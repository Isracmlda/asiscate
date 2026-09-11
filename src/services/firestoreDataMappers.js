export const mapSnapshotDocs = (snapshot) =>
  snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, ...docSnapshot.data() }));

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
    parentEmail: student.parentEmail || familyEmail,
    parentPhone: student.parentPhone || familyPhone?.phone1?.trim() || familyPhone?.phone?.trim() || ''
  };
};

export const sortPaymentRecords = (records) => [...records].sort(
  (a, b) => new Date(b.dateTime || b.date || 0) - new Date(a.dateTime || a.date || 0)
);
