const SESSION_COLLECTION = 'studentAttendanceQrSessions';
const RADIUS_METERS = 200;
const FIREBASE_ID_TOKEN_JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIRESTORE_API_ROOT = 'https://firestore.googleapis.com/v1';

let firebasePublicKeys;
let serviceAccessToken;
let serviceAccessTokenExpiresAt = 0;

function jsonResponse(body, status, request, env, extraHeaders = {}) {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigins = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    ...extraHeaders
  };
  if (allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function corsOptions(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigins = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  const headers = {
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  if (allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return new Response(null, { status: 204, headers });
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function bytesToBase64Url(value) {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function stringToBase64Url(value) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

async function getFirebasePublicKeys() {
  if (firebasePublicKeys && firebasePublicKeys.expiresAt > Date.now()) return firebasePublicKeys.keys;
  const response = await fetch(FIREBASE_ID_TOKEN_JWKS, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!response.ok) throw new Error('No se pudieron obtener las claves de autenticación de Firebase.');
  const body = await response.json();
  const cacheControl = response.headers.get('Cache-Control') || '';
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/i)?.[1] || 3600);
  firebasePublicKeys = { keys: body.keys || [], expiresAt: Date.now() + maxAge * 1000 };
  return firebasePublicKeys.keys;
}

async function verifyFirebaseIdToken(request, env) {
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw httpError(401, 'Inicia sesión para realizar esta acción.');
  const parts = token.split('.');
  if (parts.length !== 3) throw httpError(401, 'La sesión de usuario no es válida.');

  let header;
  let claims;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1])));
  } catch {
    throw httpError(401, 'La sesión de usuario no es válida.');
  }
  const now = Math.floor(Date.now() / 1000);
  const projectId = env.FIREBASE_PROJECT_ID;
  if (header.alg !== 'RS256' || !header.kid || claims.aud !== projectId
    || claims.iss !== `https://securetoken.google.com/${projectId}`
    || !claims.sub || claims.sub.length > 128 || !claims.exp || claims.exp <= now
    || !claims.iat || claims.iat > now + 300) {
    throw httpError(401, 'La sesión de usuario venció o no es válida. Inicia sesión de nuevo.');
  }

  const jwk = (await getFirebasePublicKeys()).find(key => key.kid === header.kid && key.use === 'sig');
  if (!jwk) throw httpError(401, 'No se pudo validar la sesión de usuario.');
  const publicKey = await crypto.subtle.importKey('jwk', jwk, {
    name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'
  }, false, ['verify']);
  const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const isValid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, base64UrlToBytes(parts[2]), signedData);
  if (!isValid) throw httpError(401, 'No se pudo validar la sesión de usuario.');
  return claims;
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function browserAttendanceHandoff(request, env) {
  const requestUrl = new URL(request.url);
  const destination = new URL(`https://${env.FIREBASE_PROJECT_ID}.firebaseapp.com/`);
  if (requestUrl.searchParams.get('studentAttendanceQr') === '1') {
    const sessionId = requestUrl.searchParams.get('sessionId') || '';
    if (!validUuid(sessionId)) throw httpError(400, 'El enlace de asistencia no es válido.');
    destination.searchParams.set('studentAttendanceQr', '1');
    destination.searchParams.set('sessionId', sessionId);
  } else if (requestUrl.searchParams.get('formationCheckin') === '1') {
    const groupId = requestUrl.searchParams.get('groupId') || '';
    const date = requestUrl.searchParams.get('date') || '';
    if (!groupId || groupId.length > 256 || !validDate(date)) {
      throw httpError(400, 'El enlace de asistencia no es válido.');
    }
    destination.searchParams.set('formationCheckin', '1');
    destination.searchParams.set('groupId', groupId);
    destination.searchParams.set('date', date);
    const label = String(requestUrl.searchParams.get('label') || '').trim().slice(0, 200);
    if (label) destination.searchParams.set('label', label);
  } else {
    throw httpError(400, 'El enlace de asistencia no es válido.');
  }

  const destinationUrl = destination.toString();
  const safeDestination = destinationUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta http-equiv="Cache-Control" content="no-store"><title>Asistencia · AsisCate</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#09090b;color:#f4f4f5;font:16px system-ui,sans-serif}.card{width:min(88vw,420px);padding:32px;border:1px solid #27272a;border-radius:24px;text-align:center;background:#111113}.spin{width:32px;height:32px;margin:0 auto 20px;border:4px solid #065f46;border-top-color:#10b981;border-radius:50%;animation:s .8s linear infinite}@keyframes s{to{transform:rotate(360deg)}}a{display:inline-block;margin-top:20px;padding:12px 20px;border-radius:12px;background:#059669;color:white;text-decoration:none;font-weight:700}</style></head><body><main class="card"><div class="spin" aria-hidden="true"></div><strong>Abriendo asistencia en el navegador…</strong><br><a href="${safeDestination}">Continuar</a></main><script>window.location.replace(${JSON.stringify(destinationUrl)})</script></body></html>`, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate', 'X-Content-Type-Options': 'nosniff' }
  });
}

function pemToArrayBuffer(pem) {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '').replace(/\s/g, '');
  return base64UrlToBytes(base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')).buffer;
}

async function getGoogleAccessToken(env) {
  if (serviceAccessToken && serviceAccessTokenExpiresAt > Date.now() + 60_000) return serviceAccessToken;
  let serviceAccount;
  try { serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT || ''); } catch {
    throw new Error('Falta configurar FIREBASE_SERVICE_ACCOUNT en los secretos del Worker.');
  }
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT no tiene las credenciales esperadas.');
  }

  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${stringToBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${stringToBase64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: GOOGLE_OAUTH_TOKEN_URL,
    iat: now,
    exp: now + 3600
  }))}`;
  const privateKey = await crypto.subtle.importKey('pkcs8', pemToArrayBuffer(serviceAccount.private_key), {
    name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'
  }, false, ['sign']);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${bytesToBase64Url(new Uint8Array(signature))}`;
  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) throw new Error('Google rechazó las credenciales del Worker para Firebase.');
  serviceAccessToken = body.access_token;
  serviceAccessTokenExpiresAt = Date.now() + Number(body.expires_in || 3600) * 1000;
  return serviceAccessToken;
}

function firestoreRoot(env) {
  return `${FIRESTORE_API_ROOT}/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents`;
}

function firestoreDocumentName(env, collection, documentId) {
  return `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(String(documentId))}`;
}

async function firestoreRequest(env, path, options = {}) {
  const accessToken = await getGoogleAccessToken(env);
  const response = await fetch(`${firestoreRoot(env)}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  if (!response.ok) {
    if (response.status === 404) return null;
    const detail = body.error?.message || 'No se pudo comunicar con Firestore.';
    throw httpError(response.status >= 500 ? 502 : response.status, detail);
  }
  return body;
}

function decodeFirestoreValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeFirestoreValue);
  if ('mapValue' in value) return decodeFirestoreFields(value.mapValue.fields || {});
  if ('referenceValue' in value) return value.referenceValue;
  return null;
}

function decodeFirestoreFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]));
}

function encodeFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value)
    ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFirestoreFields(value) } };
  return { nullValue: null };
}

function encodeFirestoreFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encodeFirestoreValue(value)]));
}

function firestoreTimestamp(date) {
  return { timestampValue: date.toISOString() };
}

async function getDocument(env, collection, id, transaction) {
  const name = `${collection}/${encodeURIComponent(String(id))}`;
  const query = transaction ? `?transaction=${encodeURIComponent(transaction)}` : '';
  return firestoreRequest(env, `/${name}${query}`);
}

async function getOrganizerAndGroup(env, uid, groupId) {
  const [userDoc, groupDoc] = await Promise.all([
    getDocument(env, 'users', uid),
    getDocument(env, 'groups', groupId)
  ]);
  if (!userDoc || !groupDoc) throw httpError(404, 'No se encontró el usuario o el grupo.');
  const user = decodeFirestoreFields(userDoc.fields);
  const group = decodeFirestoreFields(groupDoc.fields);
  if (user.active === false || user.approved === false
    || !['admin', 'coordinadorGeneral', 'coordinador', 'catequista'].includes(user.role)) {
    throw httpError(403, 'No tienes permiso para administrar este registro de asistencia.');
  }
  if (user.role === 'admin') return { user, group };
  if (user.role === 'coordinador' && user.diaconiaId && user.diaconiaId === group.diaconiaId) return { user, group };
  if (user.role === 'coordinadorGeneral') {
    let userParishId = user.parroquiaId || '';
    if (!userParishId && user.diaconiaId) {
      const userDiaconia = await getDocument(env, 'diaconias', user.diaconiaId);
      userParishId = userDiaconia ? String(decodeFirestoreFields(userDiaconia.fields).parroquiaId || '') : '';
    }
    let groupParishId = group.parroquiaId || '';
    if (!groupParishId && group.diaconiaId) {
      const groupDiaconia = await getDocument(env, 'diaconias', group.diaconiaId);
      groupParishId = groupDiaconia ? String(decodeFirestoreFields(groupDiaconia.fields).parroquiaId || '') : '';
    }
    if (userParishId && userParishId === groupParishId) return { user, group };
  }
  if (user.role === 'catequista') {
    const assigned = [...(Array.isArray(group.catechistIds) ? group.catechistIds : []), group.catechistId]
      .filter(Boolean).map(String);
    if (assigned.includes(uid)) return { user, group };
  }
  throw httpError(403, 'Este grupo no está dentro de tu ámbito asignado.');
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function coordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const radians = degrees => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const raw = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  const a = Math.min(1, Math.max(0, raw));
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function validUuid(value) {
  return /^[0-9a-f-]{36}$/i.test(String(value || ''));
}

async function createSession(request, env) {
  const identity = await verifyFirebaseIdToken(request, env);
  const data = await request.json();
  const groupId = String(data.groupId || '');
  const date = String(data.date || '');
  const attendanceType = data.attendanceType === 'misa' ? 'misa' : 'encuentro';
  const latitude = coordinate(data.latitude, -90, 90);
  const longitude = coordinate(data.longitude, -180, 180);
  if (!groupId || !validDate(date)) throw httpError(400, 'Selecciona un grupo y una fecha válida.');
  if (latitude === null || longitude === null) throw httpError(400, 'No se pudo obtener la ubicación del encuentro.');
  const { user, group } = await getOrganizerAndGroup(env, identity.sub, groupId);
  if (group.type === 'catequistas' || groupId.startsWith('catequistas:')) {
    throw httpError(400, 'Este QR es para encuentros de catequizandos.');
  }

  const sessionId = crypto.randomUUID();
  const fields = {
    groupId,
    groupName: String(group.name || 'Grupo'),
    date,
    label: String(data.label || '').trim().slice(0, 200),
    attendanceType,
    isOpen: true,
    centerLatitude: latitude,
    centerLongitude: longitude,
    openedBy: identity.sub,
    openedAt: firestoreTimestamp(new Date()),
    createdAt: firestoreTimestamp(new Date())
  };
  const response = await firestoreRequest(env, `/${SESSION_COLLECTION}?documentId=${encodeURIComponent(sessionId)}`, {
    method: 'POST', body: JSON.stringify({ fields: encodeFirestoreFields(fields) })
  });
  if (!response) throw httpError(502, 'No se pudo crear el registro de asistencia.');
  return {
    sessionId,
    groupId,
    groupName: String(group.name || 'Grupo'),
    date,
    label: fields.label,
    attendanceType,
    isOpen: true,
    expiresAt: null,
    openedByName: String(user.name || '')
  };
}

async function setSessionOpen(request, env, sessionId) {
  const identity = await verifyFirebaseIdToken(request, env);
  const data = await request.json();
  if (!validUuid(sessionId) || typeof data.isOpen !== 'boolean') throw httpError(400, 'La sesión o el estado no son válidos.');
  const sessionDoc = await getDocument(env, SESSION_COLLECTION, sessionId);
  if (!sessionDoc) throw httpError(404, 'No se encontró esta sesión de asistencia.');
  const session = decodeFirestoreFields(sessionDoc.fields);
  await getOrganizerAndGroup(env, identity.sub, String(session.groupId || ''));
  const fields = {
    isOpen: data.isOpen,
    updatedAt: firestoreTimestamp(new Date())
  };
  if (data.isOpen) {
    fields.openedAt = firestoreTimestamp(new Date());
    fields.openedBy = identity.sub;
  }
  const query = new URLSearchParams();
  Object.keys(fields).forEach(field => query.append('updateMask.fieldPaths', field));
  const name = `${SESSION_COLLECTION}/${encodeURIComponent(sessionId)}`;
  await firestoreRequest(env, `/${name}?${query.toString()}`, {
    method: 'PATCH', body: JSON.stringify({ name: firestoreDocumentName(env, SESSION_COLLECTION, sessionId), fields: encodeFirestoreFields(fields) })
  });
  return { isOpen: data.isOpen };
}

async function getSessionInfo(env, sessionId) {
  if (!validUuid(sessionId)) throw httpError(400, 'El enlace de asistencia no es válido.');
  const sessionDoc = await getDocument(env, SESSION_COLLECTION, sessionId);
  if (!sessionDoc) throw httpError(404, 'El enlace de asistencia no existe o venció.');
  const session = decodeFirestoreFields(sessionDoc.fields);
  return {
    sessionId,
    groupId: String(session.groupId || ''),
    groupName: String(session.groupName || 'Grupo'),
    date: session.date,
    label: String(session.label || ''),
    attendanceType: session.attendanceType === 'misa' ? 'misa' : 'encuentro',
    isOpen: session.isOpen === true,
    expired: false,
    expiresAt: null
  };
}

async function batchGetDocuments(env, paths, transaction) {
  const body = { documents: paths.map(path => firestoreDocumentName(env, path.collection, path.id)), transaction };
  const result = await firestoreRequest(env, ':batchGet', { method: 'POST', body: JSON.stringify(body) });
  const docs = new Map();
  for (const item of Array.isArray(result) ? result : []) {
    if (item.found) docs.set(item.found.name, item.found);
  }
  return paths.map(path => docs.get(firestoreDocumentName(env, path.collection, path.id)) || null);
}

async function checkIn(request, env) {
  const data = await request.json();
  const sessionId = String(data.sessionId || '');
  const studentId = String(data.studentId || '');
  const latitude = coordinate(data.latitude, -90, 90);
  const longitude = coordinate(data.longitude, -180, 180);
  if (!validUuid(sessionId) || !studentId || studentId.length > 200 || latitude === null || longitude === null) {
    throw httpError(400, 'No se pudo validar el QR o la ubicación.');
  }

  const begin = await firestoreRequest(env, ':beginTransaction', {
    method: 'POST', body: JSON.stringify({ options: { readWrite: {} } })
  });
  const transaction = begin?.transaction;
  if (!transaction) throw httpError(502, 'No se pudo iniciar el registro de asistencia.');
  const [sessionDoc, studentDoc] = await batchGetDocuments(env, [
    { collection: SESSION_COLLECTION, id: sessionId },
    { collection: 'students', id: studentId }
  ], transaction);
  let result;
  let write;

  if (!sessionDoc) result = { status: 'invalid_session', message: 'El enlace de asistencia no existe o venció.' };
  else {
    const session = decodeFirestoreFields(sessionDoc.fields);
    if (session.isOpen !== true) {
      result = { status: 'closed', message: 'El registro de este encuentro está cerrado.' };
    } else if (!studentDoc) {
      result = { status: 'student_not_in_group', message: 'Este carnet no pertenece al grupo de este encuentro.' };
    } else {
      const student = decodeFirestoreFields(studentDoc.fields);
      if (student.groupId !== session.groupId || student.active === false) {
        result = { status: 'student_not_in_group', message: 'Este carnet no pertenece al grupo de este encuentro.' };
      } else if (distanceMeters(session.centerLatitude, session.centerLongitude, latitude, longitude) > RADIUS_METERS) {
        result = { status: 'outside_radius', message: 'Debes estar lo suficientemente cerca del área del encuentro para marcar la asistencia.' };
      } else {
        const attendance = Array.isArray(student.attendance) ? [...student.attendance] : [];
        const attendanceType = session.attendanceType === 'misa' ? 'misa' : 'encuentro';
        const index = attendance.findIndex(record => record.date === session.date && (record.type || 'encuentro') === attendanceType);
        if (index >= 0 && (attendance[index].status || (attendance[index].present ? 'present' : 'absent')) === 'present') {
          result = { status: 'already_registered', studentName: String(student.name || student.fullName || 'Catequizando') };
        } else {
          const record = {
            date: session.date,
            status: 'present',
            present: true,
            label: String(session.label || ''),
            type: attendanceType,
            checkInMethod: 'qr-geofence',
            checkedAt: new Date().toISOString()
          };
          if (index >= 0) attendance[index] = record;
          else attendance.push(record);
          write = {
            update: {
              name: firestoreDocumentName(env, 'students', studentId),
              fields: encodeFirestoreFields({ attendance })
            },
            updateMask: { fieldPaths: ['attendance'] }
          };
          result = { status: 'success', studentName: String(student.name || student.fullName || 'Catequizando') };
        }
      }
    }
  }

  await firestoreRequest(env, ':commit', {
    method: 'POST',
    body: JSON.stringify({ transaction, writes: write ? [write] : [] })
  });
  return result;
}

async function routeRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === '/open' && request.method === 'GET') return browserAttendanceHandoff(request, env);
  if (path === '/sessions' && request.method === 'POST') return createSession(request, env);
  if (path === '/check-ins' && request.method === 'POST') return checkIn(request, env);
  const sessionMatch = path.match(/^\/sessions\/([0-9a-f-]{36})(?:\/(open))?$/i);
  if (sessionMatch && sessionMatch[2] === 'open' && request.method === 'PATCH') {
    return setSessionOpen(request, env, sessionMatch[1]);
  }
  if (sessionMatch && !sessionMatch[2] && request.method === 'GET') return getSessionInfo(env, sessionMatch[1]);
  if (path === '/' && request.method === 'GET') return { service: 'AsisCate student attendance', ready: true };
  throw httpError(404, 'No se encontró esta operación.');
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return corsOptions(request, env);
    try {
      const result = await routeRequest(request, env);
      if (result instanceof Response) return result;
      return jsonResponse(result, 200, request, env);
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 500;
      return jsonResponse({ message: status === 500 ? 'Ocurrió un error al registrar la asistencia.' : error.message }, status, request, env);
    }
  }
};
