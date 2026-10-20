import { useState, useMemo } from 'react';
import { MaterialIcon } from '../Shared/MaterialIcon';

export function StudentsView({
  students = [],
  groups = [],
  levelOptions = [],
  parroquias = [],
  diaconias = [],
  cardBgClass = 'bg-slate-800/80',
  inputBgClass = 'bg-slate-900 border-slate-700 text-white',
  themeMode = 'dark',
  handleDeleteStudent,
  handleStartEditStudent,
  handleOpenStudentReadOnly
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLevelFilter, setSelectedLevelFilter] = useState('all');
  const [selectedCycleFilter, setSelectedCycleFilter] = useState('all');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState('all');
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingId, setDeletingId] = useState(null);

  // Mapa de grupos por ID para consulta rápida
  const groupMap = useMemo(() => {
    const map = new Map();
    groups.forEach(g => map.set(g.id, g));
    return map;
  }, [groups]);

  // Mapa de parroquias y diaconías
  const parroquiaMap = useMemo(() => new Map(parroquias.map(p => [p.id, p.name])), [parroquias]);
  const diaconiaMap = useMemo(() => new Map(diaconias.map(d => [d.id, d.name])), [diaconias]);

  const getDisplayLevel = (value) => String(value || 'Primer Nivel')
    .replace(/\s*\(Primera Comunión\)$/i, '')
    .trim();

  // Extraer lista única de ciclos catequéticos registrados en los estudiantes y grupos
  const availableCycles = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const defaultCycle = `${currentYear}-${currentYear + 1}`;
    const cycleSet = new Set([defaultCycle, `${currentYear - 1}-${currentYear}`]);
    students.forEach(s => { if (s.cycle) cycleSet.add(String(s.cycle).trim()); });
    groups.forEach(g => { if (g.year) cycleSet.add(String(g.year).trim()); });
    return Array.from(cycleSet).filter(Boolean).sort().reverse();
  }, [students, groups]);

  // Filtrado de estudiantes
  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      // 1. Filtro por búsqueda (Nombre, Correo, Teléfono, Tutor)
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const name = String(student.fullName || student.name || '').toLowerCase();
        const parentEmail = String(student.parentEmail || student.family?.guardian?.email || '').toLowerCase();
        const parentPhone = String(student.parentPhone || student.family?.guardian?.phone1 || '').toLowerCase();
        const parentName = String(student.family?.guardian?.name || '').toLowerCase();

        const matches = name.includes(query) ||
          parentEmail.includes(query) ||
          parentPhone.includes(query) ||
          parentName.includes(query);

        if (!matches) return false;
      }

      // 2. Filtro por Nivel
      if (selectedLevelFilter !== 'all') {
        const assignedGroup = student.groupId ? groupMap.get(student.groupId) : null;
        const studentLevel = getDisplayLevel(student.level || assignedGroup?.level || 'Primer Nivel');
        if (studentLevel !== selectedLevelFilter) return false;
      }

      // 3. Filtro por Ciclo Catequético
      if (selectedCycleFilter !== 'all') {
        const assignedGroup = student.groupId ? groupMap.get(student.groupId) : null;
        const groupCycle = assignedGroup?.year || '';
        const effectiveCycle = student.cycle || groupCycle;

        if (effectiveCycle !== selectedCycleFilter) return false;
      }

      // 4. Filtro por Estado de Grupo
      if (selectedGroupFilter === 'with-group') {
        if (!student.groupId || !groupMap.has(student.groupId)) return false;
      } else if (selectedGroupFilter === 'no-group') {
        if (student.groupId && groupMap.has(student.groupId)) return false;
      }

      return true;
    });
  }, [students, searchTerm, selectedLevelFilter, selectedCycleFilter, selectedGroupFilter, groupMap]);

  const displayLevelOptions = useMemo(() => Array.from(new Set(levelOptions.map(getDisplayLevel))), [levelOptions]);

  // Paginación
  const totalPages = pageSize === 'all' ? 1 : Math.ceil(filteredStudents.length / (Number(pageSize) || 25));
  const paginatedStudents = useMemo(() => {
    if (pageSize === 'all') return filteredStudents;
    const size = Number(pageSize) || 25;
    const start = (currentPage - 1) * size;
    return filteredStudents.slice(start, start + size);
  }, [filteredStudents, currentPage, pageSize]);

  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedLevelFilter('all');
    setSelectedCycleFilter('all');
    setSelectedGroupFilter('all');
    setCurrentPage(1);
  };

  const onDeleteConfirm = async (student) => {
    if (typeof handleDeleteStudent !== 'function') return;
    setDeletingId(student.id);
    try {
      await handleDeleteStudent(student);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-700/60 pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <MaterialIcon name="badge" /> <span>Directorio General de Catequizandos</span>
          </h2>
        </div>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 gap-3">
        <div className={`${cardBgClass} p-4 rounded-xl border border-slate-700/60`}>
          <span className="text-[11px] font-bold text-slate-400 uppercase block">Total Registrados</span>
          <span className="text-2xl font-black text-white">{students.length}</span>
        </div>
        <div className={`${cardBgClass} p-4 rounded-xl border border-amber-500/30`}>
          <span className="text-[11px] font-bold text-amber-400 uppercase block">Filtrados Mostrados</span>
          <span className="text-2xl font-black text-amber-300">{filteredStudents.length}</span>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className={`${cardBgClass} p-4 rounded-2xl border border-slate-700/60 space-y-3`}>
        <div className="flex justify-between items-center border-b border-slate-700/60 pb-2">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-wider"><MaterialIcon name="search" /> Panel de Búsqueda y Filtros</span>
          {(searchTerm || selectedLevelFilter !== 'all' || selectedCycleFilter !== 'all' || selectedGroupFilter !== 'all') && (
            <button
              onClick={handleClearFilters}
              className="text-xs text-amber-400 hover:text-amber-300 font-bold transition flex items-center gap-1"
            >
              <MaterialIcon name="filter_alt_off" /> Limpiar Filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* 1. Búsqueda por nombre */}
          <div className="col-span-2 md:col-span-1">
            <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Buscar por Nombre / Contacto</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              placeholder="Nombre, correo, teléfono..."
              className={`w-full rounded-xl px-3 py-2 text-xs font-semibold ${inputBgClass}`}
            />
          </div>

          {/* 2. Filtro por Nivel */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Nivel Catequético</label>
            <select
              value={selectedLevelFilter}
              onChange={(e) => { setSelectedLevelFilter(e.target.value); setCurrentPage(1); }}
              className={`w-full rounded-xl px-3 py-2 text-xs font-semibold ${inputBgClass}`}
            >
              <option value="all">Todos los Niveles</option>
              {displayLevelOptions.map(level => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </div>

          {/* 3. Filtro por Ciclo Catequético */}
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Ciclo Catequético</label>
            <select
              value={selectedCycleFilter}
              onChange={(e) => { setSelectedCycleFilter(e.target.value); setCurrentPage(1); }}
              className={`w-full rounded-xl px-3 py-2 text-xs font-semibold ${inputBgClass}`}
            >
              <option value="all">Todos los Ciclos</option>
              {availableCycles.map(cycle => (
                <option key={cycle} value={cycle}>{cycle}</option>
              ))}
            </select>
          </div>

          {/* 4. Filtro por Estado de Grupo */}
          <div className="col-span-2 md:col-span-1">
            <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">Estado de Grupo</label>
            <select
              value={selectedGroupFilter}
              onChange={(e) => { setSelectedGroupFilter(e.target.value); setCurrentPage(1); }}
              className={`w-full rounded-xl px-3 py-2 text-xs font-semibold ${inputBgClass}`}
            >
              <option value="all">Todos (Con y Sin Grupo)</option>
              <option value="with-group">Con Grupo Asignado</option>
              <option value="no-group">Sin Grupo Asignado</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabla de resultados */}
      <div className={`${cardBgClass} rounded-2xl border border-slate-700/60 overflow-hidden shadow-sm`}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-700/80 text-xs sm:text-sm">
            <thead className={themeMode === 'dark' ? 'bg-slate-900/90' : 'bg-slate-100'}>
              <tr>
                <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider w-12">#</th>
                <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Catequizando / Encargado</th>
                <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Nivel</th>
                <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Ciclo</th>
                <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Grupo Asignado</th>
                <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase tracking-wider">Ubicación</th>
                <th className="px-4 py-3 text-right font-bold text-slate-400 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60">
              {paginatedStudents.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-slate-400 italic">
                    {filteredStudents.length === 0 ? (
                      <div className="space-y-2">
                        <div className="text-3xl"><MaterialIcon name="search_off" /></div>
                        <p className="font-bold text-sm text-slate-300">No se encontraron catequizandos con los filtros seleccionados.</p>
                        <p className="text-xs text-slate-400">Intenta modificar la búsqueda o limpiar los filtros.</p>
                      </div>
                    ) : (
                      'No hay datos en esta página.'
                    )}
                  </td>
                </tr>
              ) : (
                paginatedStudents.map((student, index) => {
                  const rowIndex = (pageSize === 'all' ? 0 : (currentPage - 1) * Number(pageSize)) + index + 1;
                  const group = student.groupId ? groupMap.get(student.groupId) : null;
                  const level = getDisplayLevel(student.level || group?.level || 'Primer Nivel');
                  const cycle = student.cycle || group?.year || 'Sin ciclo';
                  const parroquiaName = student.parroquiaId ? parroquiaMap.get(student.parroquiaId) : null;
                  const diaconiaName = student.diaconiaId ? diaconiaMap.get(student.diaconiaId) : null;

                  return (
                    <tr key={student.id} className="hover:bg-slate-700/30 transition-colors">
                      {/* # Index */}
                      <td className="px-4 py-3 font-mono text-slate-400 text-xs">{rowIndex}</td>

                      {/* Catequizando / Encargado */}
                      <td className="px-4 py-3">
                        <div className="font-bold text-white text-sm">{student.fullName || student.name || 'Sin nombre'}</div>
                        <div className="text-slate-400 text-xs font-normal flex flex-wrap items-center gap-x-2 mt-0.5">
                          {student.parentEmail && <span><MaterialIcon name="mail" /> {student.parentEmail}</span>}
                          {student.parentPhone && <span><MaterialIcon name="phone" /> {student.parentPhone}</span>}
                        </div>
                        {student.family?.guardian?.name && (
                          <div className="text-[11px] text-slate-400 font-medium mt-0.5">
                            Encargado: {student.family.guardian.name}
                          </div>
                        )}
                      </td>

                      {/* Nivel */}
                      <td className="px-4 py-3">
                        <span className="inline-block px-2.5 py-1 rounded-full font-bold text-[11px] bg-amber-500/10 text-amber-300 border border-amber-500/30">
                          {level}
                        </span>
                      </td>

                      {/* Ciclo */}
                      <td className="px-4 py-3">
                        <span className="inline-block px-2 py-0.5 rounded font-mono text-xs text-slate-300 bg-slate-900 border border-slate-700">
                          {cycle}
                        </span>
                      </td>

                      {/* Grupo Asignado */}
                      <td className="px-4 py-3">
                        {group ? (
                          <div>
                            <span className="font-semibold text-emerald-400 text-xs block">{group.name}</span>
                            {group.scheduleDay && group.scheduleTime && (
                              <span className="text-[10px] text-slate-400 block">{group.scheduleDay} · {group.scheduleTime}</span>
                            )}
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            Sin Grupo
                          </span>
                        )}
                      </td>

                      {/* Ubicación */}
                      <td className="px-4 py-3 text-xs text-slate-300">
                        {parroquiaName || diaconiaName ? (
                          <div>
                            {diaconiaName && <div className="font-semibold text-slate-200">{diaconiaName}</div>}
                            {parroquiaName && <div className="text-[10px] text-slate-400">{parroquiaName}</div>}
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">No especificada</span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {typeof handleStartEditStudent === 'function' && (
                            <button
                              type="button"
                              onClick={() => handleStartEditStudent(student)}
                              className="px-2.5 py-1 bg-sky-600/20 hover:bg-sky-600/40 text-sky-300 rounded-lg font-bold text-xs border border-sky-500/30 transition"
                              title="Editar / Ver expediente"
                            >
                              <MaterialIcon name="edit" /> Editar
                            </button>
                          )}
                          {typeof handleOpenStudentReadOnly === 'function' && typeof handleStartEditStudent !== 'function' && (
                            <button
                              type="button"
                              onClick={() => handleOpenStudentReadOnly(student)}
                              className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-bold text-xs transition"
                              title="Ver expediente"
                            >
                              <MaterialIcon name="visibility" /> Ver
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onDeleteConfirm(student)}
                            disabled={deletingId === student.id}
                            className="px-2.5 py-1 bg-rose-700/30 hover:bg-rose-700/60 disabled:bg-slate-700 text-rose-300 rounded-lg font-bold text-xs border border-rose-500/40 transition flex items-center gap-1"
                            title="Borrar registro de Firestore"
                          >
                            {deletingId === student.id ? (
                              <MaterialIcon name="progress_activity" className="animate-spin" />
                            ) : (
                              <><MaterialIcon name="delete" /> Borrar</>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {filteredStudents.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-700/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span>Registros por página:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value));
                  setCurrentPage(1);
                }}
                className={`rounded px-2 py-1 text-xs font-bold ${inputBgClass}`}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value="all">Todos</option>
              </select>
            </div>

            {pageSize !== 'all' && totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white font-bold rounded-lg transition"
                >
                  ← Anterior
                </button>
                <span className="font-bold text-slate-300">
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white font-bold rounded-lg transition"
                >
                  Siguiente →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
