import { arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { db } from '../config/firebase';

const getVapidKey = () => import.meta.env.VITE_FIREBASE_VAPID_KEY?.trim();

export function isInstalledApp() {
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true
  );
}

async function getSupportedMessaging() {
  if (!isInstalledApp()) {
    throw new Error('Instala AsisCate en este dispositivo para activar los recordatorios en segundo plano.');
  }

  if (!('Notification' in window) || !('serviceWorker' in navigator) || !(await isSupported())) {
    throw new Error(
      'Este navegador o modo de navegación no admite notificaciones push. En iPhone o iPad, usa iOS 16.4 o posterior y añade AsisCate a la pantalla de inicio; en Android, abre AsisCate con Chrome. Comprueba también que estés usando HTTPS y no navegación privada.'
    );
  }

  const vapidKey = getVapidKey();
  if (!vapidKey) {
    throw new Error('Falta configurar VITE_FIREBASE_VAPID_KEY para activar las notificaciones.');
  }

  return { messaging: getMessaging(), vapidKey };
}

export async function enableAttendanceReminders(userId) {
  const { messaging, vapidKey } = await getSupportedMessaging();
  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Debes permitir las notificaciones en el navegador para recibir recordatorios.');
  }

  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  if (!token) throw new Error('No se pudo registrar este dispositivo para recibir notificaciones.');

  await updateDoc(doc(db, 'users', userId), {
    attendanceRemindersEnabled: true,
    installedFcmTokens: arrayUnion(token)
  });

  return token;
}

export async function disableAttendanceReminders(userId) {
  await updateDoc(doc(db, 'users', userId), {
    attendanceRemindersEnabled: false
  });
}

export async function refreshAttendanceReminderToken(userId) {
  if (!userId || !isInstalledApp() || !('Notification' in window) || Notification.permission !== 'granted') return null;

  const { messaging, vapidKey } = await getSupportedMessaging();
  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  if (!token) return null;

  await updateDoc(doc(db, 'users', userId), {
    installedFcmTokens: arrayUnion(token)
  });

  return token;
}
