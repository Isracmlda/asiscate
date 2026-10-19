const admin = require('firebase-admin');
const crypto = require('node:crypto');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const {
  filterUnsentRecipients,
  getActiveScheduleEntries,
  getEligibleGroups,
  getLocalScheduleParts
} = require('./schedule');

const REMINDER_CONFIG_PATH = 'config/attendanceReminders';
const REMINDER_TIME_ZONE = 'America/Costa_Rica';
const STUDENT_ATTENDANCE_QR_SESSIONS = 'studentAttendanceQrSessions';
const STUDENT_ATTENDANCE_QR_RADIUS_METERS = 200;
const STUDENT_ATTENDANCE_QR_MAX_ACCURACY_METERS = 100;
const STUDENT_ATTENDANCE_QR_TTL_HOURS = 6;

function initializeFunctionFirestore() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

function getFiniteCoordinate(value, min, max) {
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max ? coordinate : null;
}

function isValidAttendanceDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function getDistanceMeters(firstLatitude, firstLongitude, secondLatitude, secondLongitude) {
  const toRadians = degrees => degrees * Math.PI / 180;
  const latitudeDelta = toRadians(secondLatitude - firstLatitude);
  const longitudeDelta = toRadians(secondLongitude - firstLongitude);
  const rawA = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(firstLatitude)) * Math.cos(toRadians(secondLatitude))
    * Math.sin(longitudeDelta / 2) ** 2;
  const a = Math.min(1, Math.max(0, rawA));
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getGroupParishId(db, group) {
  if (group.parroquiaId) return group.parroquiaId;
  if (!group.diaconiaId) return '';
  const diaconia = await db.collection('diaconias').doc(String(group.diaconiaId)).get();
  return diaconia.exists ? String(diaconia.data().parroquiaId || '') : '';
}

async function assertCanManageAttendanceGroup(db, uid, groupId) {
  const [userSnapshot, groupSnapshot] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('groups').doc(groupId).get()
  ]);
  if (!userSnapshot.exists || !groupSnapshot.exists) {
    throw new HttpsError('not-found', 'No se encontró el usuario o el grupo.');
  }

  const user = userSnapshot.data();
  const group = groupSnapshot.data();
  if (user.active === false || user.approved === false
    || !['admin', 'coordinadorGeneral', 'coordinador', 'catequista'].includes(user.role)) {
    throw new HttpsError('permission-denied', 'No tienes permiso para administrar este registro de asistencia.');
  }
  if (user.role === 'admin') return { user, group };

  if (user.role === 'coordinador' && user.diaconiaId && user.diaconiaId === group.diaconiaId) {
    return { user, group };
  }

  if (user.role === 'coordinadorGeneral') {
    const [userParishId, groupParishId] = await Promise.all([
      user.parroquiaId || (user.diaconiaId ? getGroupParishId(db, { diaconiaId: user.diaconiaId }) : ''),
      getGroupParishId(db, group)
    ]);
    if (userParishId && userParishId === groupParishId) return { user, group };
  }

  if (user.role === 'catequista') {
    const assignedIds = [
      ...(Array.isArray(group.catechistIds) ? group.catechistIds : []),
      group.catechistId
    ].filter(Boolean).map(String);
    if (assignedIds.includes(uid)) return { user, group };
  }

  throw new HttpsError('permission-denied', 'Este grupo no está dentro de tu ámbito asignado.');
}

exports.createStudentAttendanceQrSession = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Inicia sesión para abrir el registro.');
  const { groupId, date, label = '', latitude, longitude, accuracy } = request.data || {};
  if (!groupId || !isValidAttendanceDate(date)) {
    throw new HttpsError('invalid-argument', 'Selecciona un grupo y una fecha válida.');
  }
  const parsedLatitude = getFiniteCoordinate(latitude, -90, 90);
  const parsedLongitude = getFiniteCoordinate(longitude, -180, 180);
  const parsedAccuracy = Number(accuracy);
  if (parsedLatitude === null || parsedLongitude === null || !Number.isFinite(parsedAccuracy)
    || parsedAccuracy <= 0 || parsedAccuracy > STUDENT_ATTENDANCE_QR_MAX_ACCURACY_METERS) {
    throw new HttpsError('failed-precondition', 'La ubicación del dispositivo organizador no tiene suficiente precisión.');
  }

  const db = initializeFunctionFirestore();
  const { user, group } = await assertCanManageAttendanceGroup(db, request.auth.uid, String(groupId));
  if (group.type === 'catequistas' || String(groupId).startsWith('catequistas:')) {
    throw new HttpsError('failed-precondition', 'Este QR es para encuentros de catequizandos.');
  }

  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(now + STUDENT_ATTENDANCE_QR_TTL_HOURS * 60 * 60 * 1000);
  await db.collection(STUDENT_ATTENDANCE_QR_SESSIONS).doc(sessionId).create({
    groupId: String(groupId),
    groupName: String(group.name || 'Grupo'),
    date,
    label: String(label || '').trim().slice(0, 200),
    isOpen: true,
    centerLatitude: parsedLatitude,
    centerLongitude: parsedLongitude,
    centerAccuracy: parsedAccuracy,
    openedBy: request.auth.uid,
    openedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt
  });

  return {
    sessionId,
    groupId: String(groupId),
    groupName: String(group.name || 'Grupo'),
    date,
    label: String(label || '').trim().slice(0, 200),
    isOpen: true,
    expiresAt: expiresAt.toMillis(),
    openedByName: String(user.name || '')
  };
});

exports.setStudentAttendanceQrSessionOpen = onCall(async request => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Inicia sesión para cambiar el estado del registro.');
  const sessionId = String(request.data?.sessionId || '');
  const isOpen = request.data?.isOpen;
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || typeof isOpen !== 'boolean') {
    throw new HttpsError('invalid-argument', 'La sesión o el estado no son válidos.');
  }

  const db = initializeFunctionFirestore();
  const sessionRef = db.collection(STUDENT_ATTENDANCE_QR_SESSIONS).doc(sessionId);
  const sessionSnapshot = await sessionRef.get();
  if (!sessionSnapshot.exists) throw new HttpsError('not-found', 'No se encontró esta sesión de asistencia.');
  const session = sessionSnapshot.data();
  await assertCanManageAttendanceGroup(db, request.auth.uid, session.groupId);
  if (isOpen && session.expiresAt?.toMillis() <= Date.now()) {
    throw new HttpsError('failed-precondition', 'Este QR venció. Genera uno nuevo para abrir el registro.');
  }

  await sessionRef.update({
    isOpen,
    ...(isOpen ? { openedAt: admin.firestore.FieldValue.serverTimestamp(), openedBy: request.auth.uid } : {}),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return { isOpen };
});

exports.getStudentAttendanceQrSessionInfo = onCall(async request => {
  const sessionId = String(request.data?.sessionId || '');
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new HttpsError('invalid-argument', 'El enlace de asistencia no es válido.');
  const db = initializeFunctionFirestore();
  const snapshot = await db.collection(STUDENT_ATTENDANCE_QR_SESSIONS).doc(sessionId).get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'El enlace de asistencia no existe o venció.');
  const session = snapshot.data();
  const expired = session.expiresAt?.toMillis() <= Date.now();
  return {
    sessionId,
    groupId: String(session.groupId || ''),
    groupName: String(session.groupName || 'Grupo'),
    date: session.date,
    label: String(session.label || ''),
    isOpen: session.isOpen === true && !expired,
    expired,
    expiresAt: session.expiresAt?.toMillis() || null
  };
});

exports.checkInStudentWithAttendanceQr = onCall(async request => {
  const sessionId = String(request.data?.sessionId || '');
  const studentId = String(request.data?.studentId || '');
  const latitude = getFiniteCoordinate(request.data?.latitude, -90, 90);
  const longitude = getFiniteCoordinate(request.data?.longitude, -180, 180);
  const accuracy = Number(request.data?.accuracy);
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !studentId || studentId.length > 200
    || latitude === null || longitude === null || !Number.isFinite(accuracy)
    || accuracy <= 0 || accuracy > STUDENT_ATTENDANCE_QR_MAX_ACCURACY_METERS) {
    throw new HttpsError('invalid-argument', 'No se pudo validar el QR o la precisión de la ubicación.');
  }

  const db = initializeFunctionFirestore();
  const sessionRef = db.collection(STUDENT_ATTENDANCE_QR_SESSIONS).doc(sessionId);
  const studentRef = db.collection('students').doc(studentId);
  let response;
  await db.runTransaction(async transaction => {
    const [sessionSnapshot, studentSnapshot] = await Promise.all([
      transaction.get(sessionRef),
      transaction.get(studentRef)
    ]);
    if (!sessionSnapshot.exists) {
      response = { status: 'invalid_session', message: 'El enlace de asistencia no existe o venció.' };
      return;
    }
    const session = sessionSnapshot.data();
    if (session.expiresAt?.toMillis() <= Date.now()) {
      response = { status: 'expired', message: 'Este QR venció. Pide a la catequista que genere uno nuevo.' };
      return;
    }
    if (session.isOpen !== true) {
      response = { status: 'closed', message: 'El registro de este encuentro está cerrado.' };
      return;
    }
    if (!studentSnapshot.exists || studentSnapshot.data().groupId !== session.groupId || studentSnapshot.data().active === false) {
      response = { status: 'student_not_in_group', message: 'Este carnet no pertenece al grupo de este encuentro.' };
      return;
    }

    const student = studentSnapshot.data();
    const distanceMeters = getDistanceMeters(session.centerLatitude, session.centerLongitude, latitude, longitude);
    if (distanceMeters > STUDENT_ATTENDANCE_QR_RADIUS_METERS) {
      response = { status: 'outside_radius', message: 'Estás fuera del área permitida de 200 metros.' };
      return;
    }

    const attendance = Array.isArray(student.attendance) ? [...student.attendance] : [];
    const existingIndex = attendance.findIndex(record => record.date === session.date && (record.type || 'encuentro') === 'encuentro');
    if (existingIndex >= 0 && (attendance[existingIndex].status || (attendance[existingIndex].present ? 'present' : 'absent')) === 'present') {
      response = { status: 'already_registered', studentName: String(student.name || student.fullName || 'Catequizando') };
      return;
    }

    const record = {
      date: session.date,
      status: 'present',
      present: true,
      label: String(session.label || ''),
      type: 'encuentro',
      checkInMethod: 'qr-geofence',
      checkedAt: new Date().toISOString()
    };
    if (existingIndex >= 0) attendance[existingIndex] = record;
    else attendance.push(record);
    transaction.update(studentRef, { attendance });
    response = { status: 'success', studentName: String(student.name || student.fullName || 'Catequizando') };
  });
  return response;
});

function initializeFirebaseAdmin() {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    throw new Error('Falta el secreto FIREBASE_SERVICE_ACCOUNT en GitHub Actions.');
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch (error) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT no contiene JSON válido: ${error.message}`);
  }

  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  return admin.firestore();
}

function getAssignedCatechistIds(group) {
  const assignedIds = Array.isArray(group.catechistIds) ? group.catechistIds : [];
  if (group.catechistId) assignedIds.push(group.catechistId);
  return [...new Set(assignedIds.filter(Boolean).map(String))];
}

async function getInstalledRecipients(db, group) {
  const catechistIds = getAssignedCatechistIds(group);
  if (catechistIds.length === 0) return [];

  const userSnapshots = await Promise.all(
    catechistIds.map(userId => db.collection('users').doc(userId).get())
  );

  return userSnapshots.flatMap(snapshot => {
    if (!snapshot.exists) return [];
    const user = snapshot.data();
    if (user.attendanceRemindersEnabled !== true || !Array.isArray(user.installedFcmTokens)) return [];
    return user.installedFcmTokens.filter(token => typeof token === 'string' && token.length > 0)
      .map(token => ({ token, userId: snapshot.id }));
  });
}

function getDeliveryDocumentId(date, groupId) {
  return `${date}_${encodeURIComponent(groupId)}`;
}

async function sendGroupReminder(db, groupSnapshot, date) {
  const group = { id: groupSnapshot.id, ...groupSnapshot.data() };
  const recipients = await getInstalledRecipients(db, group);
  if (recipients.length === 0) return;

  const deliveryRef = db.collection('attendanceReminderDeliveries')
    .doc(getDeliveryDocumentId(date, group.id));
  const deliverySnapshot = await deliveryRef.get();
  const sentTokens = deliverySnapshot.exists ? deliverySnapshot.data().sentTokens || [] : [];
  const unsentRecipients = filterUnsentRecipients(recipients, sentTokens);
  if (unsentRecipients.length === 0) return;

  const staleTokens = [];
  const successfulTokens = [];
  const sendErrors = [];
  const groupName = String(group.name || 'tu grupo');
  const payload = {
    notification: {
      title: 'Recordatorio de asistencia',
      body: `Recuerda pasar lista al grupo ${groupName}.`
    },
    data: {
      type: 'attendance-reminder',
      groupId: group.id,
      url: '/'
    }
  };

  for (const recipient of unsentRecipients) {
    try {
      await admin.messaging().send({ ...payload, token: recipient.token });
      successfulTokens.push(recipient.token);
    } catch (error) {
      if (error.code === 'messaging/registration-token-not-registered'
        || error.code === 'messaging/invalid-registration-token') {
        staleTokens.push(recipient.token);
        continue;
      }
      sendErrors.push(error);
    }
  }

  if (successfulTokens.length > 0) {
    await deliveryRef.set({
      date,
      groupId: group.id,
      sentTokens: admin.firestore.FieldValue.arrayUnion(...successfulTokens),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  if (staleTokens.length > 0) {
    const staleTokensByUser = new Map();
    recipients.forEach(({ token, userId }) => {
      if (!staleTokens.includes(token)) return;
      if (!staleTokensByUser.has(userId)) staleTokensByUser.set(userId, []);
      staleTokensByUser.get(userId).push(token);
    });
    await Promise.all([...staleTokensByUser].map(([userId, tokens]) =>
      db.collection('users').doc(userId).update({
        installedFcmTokens: admin.firestore.FieldValue.arrayRemove(...tokens)
      })
    ));
  }

  if (sendErrors.length > 0) {
    throw new Error(`Fallaron ${sendErrors.length} envío(s) de FCM: ${sendErrors.map(error => error.code || error.message).join(', ')}`);
  }
}

async function runAttendanceReminders(now = new Date()) {
  const db = initializeFirebaseAdmin();
  const globalConfigSnapshot = await db.doc(REMINDER_CONFIG_PATH).get();
  if (!globalConfigSnapshot.exists || globalConfigSnapshot.data().enabled !== true) {
    console.log('Recordatorios pausados globalmente; no se consultan horarios ni grupos.');
    return;
  }

  const { day, date, minuteOfDay } = getLocalScheduleParts(now, REMINDER_TIME_ZONE);
  const scheduleSnapshots = await db.collection('diaconiaSchedules')
    .where('days', 'array-contains', day)
    .get();
  const scheduleConfigs = scheduleSnapshots.docs.map(snapshot => ({
    diaconiaId: snapshot.id,
    data: snapshot.data()
  }));
  const activeSchedules = getActiveScheduleEntries(scheduleConfigs, day, minuteOfDay);
  if (activeSchedules.length === 0) {
    console.log(`Sin horarios activos en mantenimiento para ${day} a esta hora.`);
    return;
  }

  const groupSnapshots = await db.collection('groups')
    .where('scheduleDay', '==', day)
    .get();
  const eligibleGroups = getEligibleGroups(
    groupSnapshots.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() })),
    day,
    activeSchedules
  );
  const snapshotsById = new Map(groupSnapshots.docs.map(snapshot => [snapshot.id, snapshot]));

  for (const group of eligibleGroups) {
    await sendGroupReminder(db, snapshotsById.get(group.id), date);
  }
  console.log(`Recordatorios procesados: ${eligibleGroups.length} grupo(s) elegible(s).`);
}

if (require.main === module) {
  runAttendanceReminders().catch(error => {
    console.error('Falló el proceso de recordatorios de asistencia:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  getAssignedCatechistIds,
  runAttendanceReminders,
  createStudentAttendanceQrSession: exports.createStudentAttendanceQrSession,
  setStudentAttendanceQrSessionOpen: exports.setStudentAttendanceQrSessionOpen,
  getStudentAttendanceQrSessionInfo: exports.getStudentAttendanceQrSessionInfo,
  checkInStudentWithAttendanceQr: exports.checkInStudentWithAttendanceQr
};
