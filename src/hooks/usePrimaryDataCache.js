import { useEffect } from 'react';

/** Persiste las colecciones principales para poder recuperar una vista offline. */
export function usePrimaryDataCache({ parroquias, diaconias, groups, students, users }) {
  useEffect(() => {
    try {
      localStorage.setItem('asiscate-parroquias-cache', JSON.stringify(parroquias));
      localStorage.setItem('asiscate-diaconias-cache', JSON.stringify(diaconias));
      localStorage.setItem('asiscate-groups-cache', JSON.stringify(groups));
      localStorage.setItem('asiscate-students-cache', JSON.stringify(students));
      localStorage.setItem('asiscate-users-cache', JSON.stringify(users));
    } catch (error) {
      console.warn('No se pudo guardar la caché local:', error);
    }
  }, [parroquias, diaconias, groups, students, users]);
}
