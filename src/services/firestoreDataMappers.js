export const mapSnapshotDocs = (snapshot) =>
  snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() }));

const cleanEmail = (value) => (typeof value === 'string' ? value.trim() : '');

export const getStudentContactEmail = (student = {}) => {
  const family = student.family || {};
  const familyEmail = [family.mother, family.father, family.guardian]
    .map((contact) => cleanEmail(contact?.email))
    .find(Boolean);

  return familyEmail || cleanEmail(student.parentEmail) || cleanEmail(student.email) || '';
};

export const normalizeStudentRecord = (docSnapshot) => {
  const student = docSnapshot.data() || {};
  const family = student.family || {};
  const contacts = [family.guardian, family.mother, family.father].filter(Boolean);
  const familyEmail = contacts.find((contact) => contact.email?.trim())?.email?.trim() || '';
  const familyPhone = contacts.find((contact) => contact.phone1?.trim() || contact.phone?.trim());

  return {
    id: docSnapshot.id,
    ...student,
    name: student.name || student.fullName || '',
    parentEmail: familyEmail || cleanEmail(student.parentEmail) || cleanEmail(student.email),
    parentPhone: student.parentPhone || familyPhone?.phone1?.trim() || familyPhone?.phone?.trim() || ''
  };
};

export const sortPaymentRecords = (records) => [...records].sort(
  (a, b) => new Date(b.dateTime || b.date || 0) - new Date(a.dateTime || a.date || 0)
);
