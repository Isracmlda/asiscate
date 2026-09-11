export const normalizeRecordText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ');

export const sameNormalized = (a, b) => normalizeRecordText(a) === normalizeRecordText(b);

export const hasDuplicateGroup = (groups, candidate) => groups.some(group =>
  group.id !== candidate.id &&
  sameNormalized(group.name, candidate.name) &&
  String(group.year || '') === String(candidate.year || '') &&
  String(group.diaconiaId || '') === String(candidate.diaconiaId || '')
);

export const hasDuplicateReservation = (reservations, candidate, excludedId = null) => reservations.some(reservation =>
  reservation.id !== excludedId &&
  String(reservation.itemId || '') === String(candidate.itemId || '') &&
  String(reservation.date || '') === String(candidate.date || '') &&
  String(reservation.slot || '') === String(candidate.slot || '') &&
  String(reservation.createdBy || '') === String(candidate.createdBy || '')
);

export const isRecentDuplicatePayment = (payments, candidate, windowMs = 15000) => payments.some(payment => {
  const samePayment = String(payment.studentId || '') === String(candidate.studentId || '')
    && String(payment.groupId || '') === String(candidate.groupId || '')
    && Number(payment.amount || 0) === Number(candidate.amount || 0)
    && sameNormalized(payment.concept, candidate.concept)
    && String(payment.paymentMethod || '') === String(candidate.paymentMethod || '');
  if (!samePayment) return false;
  const previousTime = new Date(payment.dateTime || 0).getTime();
  const candidateTime = new Date(candidate.dateTime || 0).getTime();
  return Number.isFinite(previousTime) && Math.abs(candidateTime - previousTime) <= windowMs;
});
