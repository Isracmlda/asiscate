import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const DEFAULT_ADMIN_EMAILS = ['cmisra2407@gmail.com', 'asiscate.elcarmen@gmail.com'];

export async function resolveUserProfile(db, currentUser) {
  const userRef = doc(db, 'users', currentUser.uid);
  const userSnapshot = await getDoc(userRef);
  const email = currentUser.email?.toLowerCase() || '';
  const isDefaultAdmin = DEFAULT_ADMIN_EMAILS.includes(email);

  if (userSnapshot.exists()) {
    const data = userSnapshot.data();
    let role = data.role || 'catequista';
    if (isDefaultAdmin) role = 'admin';
    const profile = {
      id: currentUser.uid,
      ...data,
      name: data.name || currentUser.displayName || 'Usuario',
      email: currentUser.email || data.email,
      role,
      theme: data.theme || 'light',
      navbarColor: data.navbarColor || '#7f1d1d'
    };
    await updateDoc(userRef, { name: profile.name, email: profile.email, role });
    return { profile, role };
  }

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
    name: currentUser.displayName || 'Usuario',
    email: currentUser.email,
    role,
    parroquiaId: '',
    diaconiaId: '',
    phoneCode: '+506',
    phoneNumber: '',
    phone: '',
    approved,
    active: true,
    theme: 'light',
    navbarColor: '#7f1d1d',
    createdAt: new Date().toISOString()
  };
  await setDoc(userRef, profile);
  return { profile, role };
}
