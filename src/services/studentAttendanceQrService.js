import { auth } from '../config/firebase';

const workerUrl = String(import.meta.env.VITE_STUDENT_ATTENDANCE_WORKER_URL || '').replace(/\/+$/, '');

async function callAttendanceWorker(path, { method = 'GET', data, requiresLogin = false } = {}) {
  if (!workerUrl) {
    throw new Error('El servicio de asistencia QR todavía no está configurado.');
  }

  const headers = {};
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  if (requiresLogin) {
    const user = auth.currentUser;
    if (!user) throw new Error('Inicia sesión para realizar esta acción.');
    headers.Authorization = `Bearer ${await user.getIdToken()}`;
  }

  const response = await fetch(`${workerUrl}${path}`, {
    method,
    headers,
    ...(data !== undefined ? { body: JSON.stringify(data) } : {})
  });
  let result = {};
  try { result = await response.json(); } catch { /* La respuesta de error puede no incluir JSON. */ }
  if (!response.ok) throw new Error(result.message || 'No se pudo completar la operación de asistencia.');
  return result;
}

export function createStudentAttendanceQrSession(data) {
  return callAttendanceWorker('/sessions', { method: 'POST', data, requiresLogin: true });
}

export function setStudentAttendanceQrSessionOpen(sessionId, isOpen) {
  return callAttendanceWorker(`/sessions/${encodeURIComponent(sessionId)}/open`, {
    method: 'PATCH', data: { isOpen }, requiresLogin: true
  });
}

export function getStudentAttendanceQrSessionInfo(sessionId) {
  return callAttendanceWorker(`/sessions/${encodeURIComponent(sessionId)}`);
}

export function checkInStudentWithAttendanceQr(data) {
  return callAttendanceWorker('/check-ins', { method: 'POST', data });
}
