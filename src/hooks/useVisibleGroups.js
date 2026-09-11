import { useMemo } from 'react';

export function useVisibleGroups({ groups, activeViewMode, effectiveDiaconiaId, userId }) {
  return useMemo(() => groups.filter(group => {
    if (activeViewMode === 'admin') return !effectiveDiaconiaId || group.diaconiaId === effectiveDiaconiaId;
    if (activeViewMode === 'coordinador' || activeViewMode === 'coordinadorGeneral') {
      return Boolean(effectiveDiaconiaId) && group.diaconiaId === effectiveDiaconiaId;
    }

    const isAssigned = Array.isArray(group.catechistIds)
      ? group.catechistIds.includes(userId)
      : group.catechistId === userId;
    return isAssigned && group.isVisibleForCatechists !== false;
  }), [activeViewMode, effectiveDiaconiaId, groups, userId]);
}
