import { useMemo } from 'react';

export function useVisiblePayments({
  paymentRecords,
  paymentFilters,
  paymentCurrentPage,
  paymentPageSize,
  groups,
  allUsers,
  activeViewMode,
  effectiveDiaconiaId,
  currentUserKey,
  visibleGroupIds
}) {
  const visiblePaymentRecords = useMemo(() => paymentRecords.filter(record => {
    const recordDiaconiaId = record.diaconiaId
      || groups.find(item => item.id === record.groupId)?.diaconiaId
      || allUsers.find(user => user.id === record.createdBy)?.diaconiaId;
    if (activeViewMode === 'admin') {
      if (!effectiveDiaconiaId) return true;
      return recordDiaconiaId === effectiveDiaconiaId;
    }
    if (activeViewMode === 'coordinador' || activeViewMode === 'coordinadorGeneral') {
      return record.createdBy === currentUserKey || recordDiaconiaId === effectiveDiaconiaId;
    }
    return Boolean(record.groupId && visibleGroupIds.includes(record.groupId));
  }), [activeViewMode, allUsers, currentUserKey, effectiveDiaconiaId, groups, paymentRecords, visibleGroupIds]);

  const filteredPaymentRecords = useMemo(() => visiblePaymentRecords.filter(record => {
    const matchesGroup = paymentFilters.groupId === 'all' || record.groupId === paymentFilters.groupId;
    const recordDate = record.date || record.dateTime?.split('T')[0] || '';
    const matchesDate = !paymentFilters.date || recordDate === paymentFilters.date;
    const receiptNum = String(record.id || '').replace(/\D/g, '').slice(-6) || String(record.id || '').slice(-6);
    const searchTarget = `${record.studentName || ''} ${record.invoiceName || ''} ${record.concept || ''} ${record.id || ''} ${receiptNum}`.toLowerCase();
    const matchesSearch = !paymentFilters.search || searchTarget.includes(paymentFilters.search.toLowerCase());
    return matchesGroup && matchesDate && matchesSearch;
  }), [paymentFilters, visiblePaymentRecords]);

  const effectivePageSize = paymentPageSize === 'all'
    ? Math.max(filteredPaymentRecords.length, 1)
    : Number(paymentPageSize);
  const paymentTotalPages = Math.max(1, Math.ceil(filteredPaymentRecords.length / effectivePageSize));
  const paginatedPaymentRecords = useMemo(() => filteredPaymentRecords.slice(
    (paymentCurrentPage - 1) * effectivePageSize,
    paymentCurrentPage * effectivePageSize
  ), [effectivePageSize, filteredPaymentRecords, paymentCurrentPage]);
  const totalCollected = useMemo(() => visiblePaymentRecords.reduce(
    (sum, record) => sum + Number(record.amount || 0), 0
  ), [visiblePaymentRecords]);

  return { visiblePaymentRecords, filteredPaymentRecords, paginatedPaymentRecords, paymentTotalPages, totalCollected };
}
