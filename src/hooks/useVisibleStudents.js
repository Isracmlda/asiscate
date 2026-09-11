import { useMemo } from 'react';

export function useVisibleStudents({ students, visibleGroupIds, activeViewMode, effectiveDiaconiaId }) {
  const visibleStudents = useMemo(() => (
    activeViewMode === 'admin' && !effectiveDiaconiaId
      ? students
      : students.filter(student => visibleGroupIds.includes(student.groupId))
  ), [activeViewMode, effectiveDiaconiaId, students, visibleGroupIds]);

  const latestAttendanceDate = useMemo(() => visibleStudents
    .flatMap(student => (student.attendance || []).map(record => record.date).filter(Boolean))
    .sort()
    .at(-1) || '', [visibleStudents]);

  return { visibleStudents, latestAttendanceDate };
}
