import { useMemo } from 'react';

export function useVisiblePayments({
  paymentRecords,
  paymentFilters,
  paymentCurrentPage,
  groups,
  activeViewMode,
  effectiveDiaconiaId,
  currentUserKey,
  visibleGroupIds
}) {
  const visiblePaymentRecords = useMemo(() => paymentRecords.filter(record => {
    if (activeViewMode === 'admin') {
      if (!effectiveDiaconiaId) return true;
      const group = groups.find(item => item.id === record.groupId);
      return group?.diaconiaId === effectiveDiaconiaId || record.diaconiaId === effectiveDiaconiaId;
    }
    if (activeViewMode === 'coordinador' || activeViewMode === 'coordinadorGeneral') {
      const group = groups.find(item => item.id === record.groupId);
      return record.createdBy === currentUserKey || (group && group.diaconiaId === effectiveDiaconiaId);
    }
    return Boolean(record.groupId && visibleGroupIds.includes(record.groupId));
  }), [activeViewMode, currentUserKey, effectiveDiaconiaId, groups, paymentRecords, visibleGroupIds]);

  const filteredPaymentRecords = useMemo(() => visiblePaymentRecords.filter(record => {
    const matchesGroup = paymentFilters.groupId === 'all' || record.groupId === paymentFilters.groupId;
    const recordDate = record.date || record.dateTime?.split('T')[0] || '';
    const matchesDate = !paymentFilters.date || recordDate === paymentFilters.date;
    const receiptNum = String(record.id || '').replace(/\D/g, '').slice(-6) || String(record.id || '').slice(-6);
    const searchTarget = `${record.studentName || ''} ${record.invoiceName || ''} ${record.concept || ''} ${record.id || ''} ${receiptNum}`.toLowerCase();
    const matchesSearch = !paymentFilters.search || searchTarget.includes(paymentFilters.search.toLowerCase());
    return matchesGroup && matchesDate && matchesSearch;
  }), [paymentFilters, visiblePaymentRecords]);

  const paymentPageSize = 10;
  const paymentTotalPages = Math.max(1, Math.ceil(filteredPaymentRecords.length / paymentPageSize));
  const paginatedPaymentRecords = useMemo(() => filteredPaymentRecords.slice(
    (paymentCurrentPage - 1) * paymentPageSize,
    paymentCurrentPage * paymentPageSize
  ), [filteredPaymentRecords, paymentCurrentPage]);
  const totalCollected = useMemo(() => visiblePaymentRecords.reduce(
    (sum, record) => sum + Number(record.amount || 0), 0
  ), [visiblePaymentRecords]);

  return { visiblePaymentRecords, filteredPaymentRecords, paginatedPaymentRecords, paymentPageSize, paymentTotalPages, totalCollected };
}
