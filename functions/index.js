const admin = require('firebase-admin');
const {
  filterUnsentRecipients,
  getActiveScheduleEntries,
  getEligibleGroups,
  getLocalScheduleParts
} = require('./schedule');

const REMINDER_CONFIG_PATH = 'config/attendanceReminders';
const REMINDER_TIME_ZONE = 'America/Costa_Rica';

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

module.exports = { getAssignedCatechistIds, runAttendanceReminders };
