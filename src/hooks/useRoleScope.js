import { useMemo } from 'react';

export function useRoleScope({ activeViewMode, userData, diaconias, generalDiaconiaId }) {
  const scope = useMemo(() => {
    const usesSelectedDiaconia = activeViewMode === 'coordinadorGeneral' || activeViewMode === 'admin';
    const effectiveDiaconiaId = usesSelectedDiaconia
      ? generalDiaconiaId
      : userData?.diaconiaId || '';
    const effectiveParroquiaId = usesSelectedDiaconia && effectiveDiaconiaId
      ? diaconias.find(diaconia => diaconia.id === effectiveDiaconiaId)?.parroquiaId || userData?.parroquiaId || ''
      : userData?.parroquiaId || '';

    return {
      effectiveDiaconiaId,
      effectiveParroquiaId,
      canManageScheduleOptions: ['admin', 'coordinador', 'coordinadorGeneral'].includes(activeViewMode)
    };
  }, [activeViewMode, diaconias, generalDiaconiaId, userData?.diaconiaId, userData?.parroquiaId]);

  return scope;
}
