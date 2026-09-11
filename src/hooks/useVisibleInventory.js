import { useMemo } from 'react';

export function useVisibleInventory({
  inventoryItems,
  inventoryAssets,
  inventoryReservations,
  inventoryDateFilters,
  allUsers,
  activeViewMode,
  effectiveDiaconiaId
}) {
  const inventoryDateFilteredItems = useMemo(() => inventoryItems.filter(item => {
    const itemDate = item.date || item.createdAt?.split('T')[0] || '';
    if (inventoryDateFilters.dateFrom && itemDate < inventoryDateFilters.dateFrom) return false;
    if (inventoryDateFilters.dateTo && itemDate > inventoryDateFilters.dateTo) return false;
    return true;
  }), [inventoryDateFilters.dateFrom, inventoryDateFilters.dateTo, inventoryItems]);

  const visibleInventoryItems = useMemo(() => (
    activeViewMode === 'admin' && !effectiveDiaconiaId
      ? inventoryDateFilteredItems
      : inventoryDateFilteredItems.filter(item => item.diaconiaId === effectiveDiaconiaId)
  ), [activeViewMode, effectiveDiaconiaId, inventoryDateFilteredItems]);

  const visibleInventoryAssets = useMemo(() => (
    activeViewMode === 'admin' && !effectiveDiaconiaId
      ? inventoryAssets
      : inventoryAssets.filter(asset => {
        const owner = allUsers.find(item => item.id === asset.createdBy || item.uid === asset.createdBy);
        return (asset.diaconiaId || owner?.diaconiaId) === effectiveDiaconiaId;
      })
  ), [activeViewMode, allUsers, effectiveDiaconiaId, inventoryAssets]);

  const visibleInventoryReservations = useMemo(() => (
    activeViewMode === 'admin' && !effectiveDiaconiaId
      ? inventoryReservations
      : inventoryReservations.filter(reservation => {
        const reservationAssetId = String(reservation.itemId || '');
        const parentAssetId = reservationAssetId.split('__unit__')[0];
        const asset = inventoryAssets.find(item => item.id === reservationAssetId || item.id === parentAssetId);
        const owner = asset && allUsers.find(item => item.id === asset.createdBy || item.uid === asset.createdBy);
        return (reservation.diaconiaId || asset?.diaconiaId || owner?.diaconiaId) === effectiveDiaconiaId;
      })
  ), [activeViewMode, allUsers, effectiveDiaconiaId, inventoryAssets, inventoryReservations]);

  const displayInventoryAssets = useMemo(() => visibleInventoryAssets.flatMap(asset => {
    const isGrouped = asset.showTogether === true;
    if (isGrouped || Number(asset.stock || 0) <= 1) return [{ ...asset, showTogether: isGrouped }];
    return Array.from({ length: Number(asset.stock || 0) }, (_, index) => ({
      ...asset,
      id: `${asset.id}__unit__${index + 1}`,
      name: `${asset.name} #${index + 1}`,
      stock: 1,
      parentAssetId: asset.id,
      showTogether: false
    }));
  }), [visibleInventoryAssets]);

  return { inventoryDateFilteredItems, visibleInventoryItems, visibleInventoryAssets, visibleInventoryReservations, displayInventoryAssets };
}
