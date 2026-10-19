import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

const createSessionCall = httpsCallable(functions, 'createStudentAttendanceQrSession');
const setSessionOpenCall = httpsCallable(functions, 'setStudentAttendanceQrSessionOpen');
const getSessionInfoCall = httpsCallable(functions, 'getStudentAttendanceQrSessionInfo');
const checkInCall = httpsCallable(functions, 'checkInStudentWithAttendanceQr');

export async function createStudentAttendanceQrSession(data) {
  const result = await createSessionCall(data);
  return result.data;
}

export async function setStudentAttendanceQrSessionOpen(sessionId, isOpen) {
  const result = await setSessionOpenCall({ sessionId, isOpen });
  return result.data;
}

export async function getStudentAttendanceQrSessionInfo(sessionId) {
  const result = await getSessionInfoCall({ sessionId });
  return result.data;
}

export async function checkInStudentWithAttendanceQr(data) {
  const result = await checkInCall(data);
  return result.data;
}
