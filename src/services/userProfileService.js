import { deleteDoc, doc, getDoc, getDocFromServer, setDoc, updateDoc } from 'firebase/firestore';

const DEFAULT_ADMIN_EMAILS = ['cmisra2407@gmail.com', 'asiscate.elcarmen@gmail.com'];

export async function resolveUserProfile(db, currentUser, { createProfile = true } = {}) {
  const userRef = doc(db, 'users', currentUser.uid);
  let userSnapshot;
  try {
    userSnapshot = await getDocFromServer(userRef);
  } catch (error) {
    if (!['unavailable', 'deadline-exceeded'].includes(error?.code)) throw error;
    userSnapshot = await getDoc(userRef);
  }
  const email = currentUser.email?.toLowerCase() || '';
  const isDefaultAdmin = DEFAULT_ADMIN_EMAILS.includes(email);
  const catechistRosterRef = email ? doc(db, 'catechistRoster', email) : null;
  const catechistRosterSnapshot = catechistRosterRef ? await getDoc(catechistRosterRef) : null;
  const preregisteredCatechist = catechistRosterSnapshot?.exists() ? catechistRosterSnapshot.data() : null;

  if (userSnapshot.exists()) {
    const data = userSnapshot.data();
    const phoneCode = data.phoneCode || '+506';
    const legacyPhoneDigits = String(data.phone || '').replace(/\D/g, '');
    const dialCodeDigits = String(phoneCode).replace(/\D/g, '');
    const migratedPhoneNumber = !data.phoneNumber && legacyPhoneDigits
      ? (dialCodeDigits && legacyPhoneDigits.startsWith(dialCodeDigits)
        ? legacyPhoneDigits.slice(dialCodeDigits.length)
        : legacyPhoneDigits)
      : '';
    const applyReminderDefault = data.attendanceRemindersDefaultApplied !== true;
    let role = data.role || 'catequista';
    if (isDefaultAdmin) role = 'admin';
    const profile = {
      id: currentUser.uid,
      ...data,
      name: data.name || currentUser.displayName || 'Usuario',
      email: currentUser.email || data.email,
      role,
      phoneCode,
      phoneNumber: data.phoneNumber || migratedPhoneNumber,
      theme: data.theme || 'light',
      navbarColor: data.navbarColor || '#7f1d1d',
      attendanceRemindersEnabled: applyReminderDefault || data.attendanceRemindersEnabled === true
    };
    const updates = {
      name: profile.name,
      email: profile.email,
      role,
      ...(migratedPhoneNumber ? { phoneNumber: migratedPhoneNumber } : {}),
      ...(applyReminderDefault ? {
        attendanceRemindersEnabled: true,
        attendanceRemindersDefaultApplied: true
      } : {})
    };
    let linkPreregisteredCatechist = false;
    if (preregisteredCatechist && (!data.diaconiaId || data.diaconiaId === preregisteredCatechist.diaconiaId)) {
      profile.name = data.name || preregisteredCatechist.name || profile.name;
      profile.diaconiaId = data.diaconiaId || preregisteredCatechist.diaconiaId || '';
      profile.parroquiaId = data.parroquiaId || preregisteredCatechist.parroquiaId || '';
      profile.attendance = data.attendance?.length ? data.attendance : preregisteredCatechist.attendance || [];
      Object.assign(updates, {
        name: profile.name,
        diaconiaId: profile.diaconiaId,
        parroquiaId: profile.parroquiaId,
        attendance: profile.attendance
      });
      linkPreregisteredCatechist = true;
    }
    await updateDoc(userRef, updates);
    if (linkPreregisteredCatechist) {
      await updateDoc(catechistRosterRef, { linkedUserId: currentUser.uid });
    }
    return { profile, role };
  }

  // El QR de asistencia solo admite perfiles de AsisCate ya existentes.
  // No crear el perfil de la app al autenticar a alguien por primera vez desde este flujo.
  if (!createProfile) return { profile: null, role: null };

  let approved = isDefaultAdmin;
  if (!approved && email) {
    const allowedRef = doc(db, 'allowedEmails', email);
    const allowedSnapshot = await getDoc(allowedRef);
    if (allowedSnapshot.exists()) {
      approved = true;
      await deleteDoc(allowedRef).catch(error => console.warn('No se pudo borrar de allowedEmails:', error));
    }
  }

  const role = isDefaultAdmin ? 'admin' : 'catequista';
  const profile = {
    id: currentUser.uid,
    name: currentUser.displayName || preregisteredCatechist?.name || 'Usuario',
    email: currentUser.email,
    role,
    parroquiaId: preregisteredCatechist?.parroquiaId || '',
    diaconiaId: preregisteredCatechist?.diaconiaId || '',
    phoneCode: '+506',
    phoneNumber: '',
    phone: '',
    territorySetupDismissed: false,
    approved,
    active: true,
    ...(Array.isArray(preregisteredCatechist?.attendance) ? { attendance: preregisteredCatechist.attendance } : {}),
    theme: 'light',
    navbarColor: '#7f1d1d',
    attendanceRemindersEnabled: true,
    attendanceRemindersDefaultApplied: true,
    createdAt: new Date().toISOString()
  };
  await setDoc(userRef, profile);
  if (preregisteredCatechist) {
    await updateDoc(catechistRosterRef, { linkedUserId: currentUser.uid });
  }
  return { profile, role };
}
