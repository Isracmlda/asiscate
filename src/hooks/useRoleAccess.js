import { useMemo } from 'react';

const isProtectedAdmin = (user) => (
  user.role === 'admin' && user.email?.toLowerCase() !== 'asiscate.elcarmen@gmail.com'
);

export function useRoleAccess({ allUsers, activeViewMode, userRole, userData, effectiveDiaconiaId, isEnrollmentEnabled }) {
  return useMemo(() => {
    const canManageScopedUsers = (user) => (
      (user.role === 'catequista' || isProtectedAdmin(user)) && user.diaconiaId === effectiveDiaconiaId
    );
    const managedUsers = activeViewMode === 'coordinadorGeneral' || activeViewMode === 'coordinador'
      ? allUsers.filter(canManageScopedUsers)
      : userRole === 'coordinadorGeneral'
        ? allUsers.filter(user => user.parroquiaId === userData?.parroquiaId)
        : allUsers;
    const canAccessEnrollment = isEnrollmentEnabled && userData?.canEnroll !== false;
    const canAccessEnrollmentDashboard = ['admin', 'coordinador', 'coordinadorGeneral'].includes(activeViewMode);
    const canAccessUserManagement = canAccessEnrollmentDashboard;
    const canManageScheduleOptions = ['admin', 'coordinador', 'coordinadorGeneral'].includes(activeViewMode);

    return {
      managedUsers,
      legacyPanelEnabled: userRole === '__legacy__',
      canAccessEnrollment,
      canAccessEnrollmentDashboard,
      canAccessUserManagement,
      canManageScheduleOptions,
      showPreferencesMenu: canManageScheduleOptions
    };
  }, [activeViewMode, allUsers, effectiveDiaconiaId, isEnrollmentEnabled, userData?.canEnroll, userData?.parroquiaId, userRole]);
}
