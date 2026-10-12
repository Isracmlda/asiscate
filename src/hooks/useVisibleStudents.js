import { useMemo } from 'react';

export function useVisibleStudents({ students, visibleGroupIds, activeViewMode, effectiveDiaconiaId }) {
  const visibleStudents = useMemo(() => {
    if (activeViewMode === 'admin' && !effectiveDiaconiaId) return students;

    return students.filter(student => (
      visibleGroupIds.includes(student.groupId) ||
      (
        activeViewMode === 'admin' &&
        Boolean(effectiveDiaconiaId) &&
        !student.groupId &&
        student.diaconiaId === effectiveDiaconiaId
      )
    ));
  }, [activeViewMode, effectiveDiaconiaId, students, visibleGroupIds]);

  const latestAttendanceDate = useMemo(() => visibleStudents
    .flatMap(student => (student.attendance || []).map(record => record.date).filter(Boolean))
    .sort()
    .at(-1) || '', [visibleStudents]);

  return { visibleStudents, latestAttendanceDate };
}
