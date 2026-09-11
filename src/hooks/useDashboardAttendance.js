import { useMemo } from 'react';

export function useDashboardAttendance({ visibleStudents, dashboardGroupId, dashboardAttendanceType, dashboardDate }) {
  const dashboardAttendanceRecords = useMemo(() => {
    const dashboardStudentIds = new Set();
    return visibleStudents.flatMap(student => {
      const dashboardStudentKey = student.id || `${student.name || student.fullName || ''}|${student.groupId || ''}`;
      if (dashboardStudentIds.has(dashboardStudentKey)) return [];
      dashboardStudentIds.add(dashboardStudentKey);
      if (dashboardGroupId && student.groupId !== dashboardGroupId) return [];

      const uniqueRecords = new Map();
      (student.attendance || []).forEach(record => {
        const recordType = record.type || 'encuentro';
        const matchesType = dashboardAttendanceType === 'all' || recordType === dashboardAttendanceType;
        const matchesDate = !dashboardDate || record.date === dashboardDate;
        if (matchesType && matchesDate) uniqueRecords.set(`${record.date || ''}|${recordType}`, record);
      });
      return Array.from(uniqueRecords.values());
    });
  }, [dashboardAttendanceType, dashboardDate, dashboardGroupId, visibleStudents]);

  const dashboardAttendanceStats = useMemo(() => ({
    total: dashboardAttendanceRecords.length,
    present: dashboardAttendanceRecords.filter(record => (record.status || (record.present ? 'present' : 'absent')) === 'present').length,
    justified: dashboardAttendanceRecords.filter(record => (record.status || (record.present ? 'present' : 'absent')) === 'justified').length,
    absent: dashboardAttendanceRecords.filter(record => (record.status || (record.present ? 'present' : 'absent')) === 'absent').length
  }), [dashboardAttendanceRecords]);

  const absentRate = dashboardAttendanceStats.total
    ? Math.round((dashboardAttendanceStats.absent / dashboardAttendanceStats.total) * 100)
    : 0;
  const dashboardDonutStyle = dashboardAttendanceStats.total
    ? { background: `conic-gradient(#10b981 0 ${dashboardAttendanceStats.present / dashboardAttendanceStats.total * 100}%, #f59e0b ${dashboardAttendanceStats.present / dashboardAttendanceStats.total * 100}% ${(dashboardAttendanceStats.present + dashboardAttendanceStats.justified) / dashboardAttendanceStats.total * 100}%, #f43f5e ${(dashboardAttendanceStats.present + dashboardAttendanceStats.justified) / dashboardAttendanceStats.total * 100}% 100%)` }
    : { background: 'conic-gradient(#475569 0 100%)' };

  return { dashboardAttendanceRecords, dashboardAttendanceStats, absentRate, dashboardDonutStyle };
}
