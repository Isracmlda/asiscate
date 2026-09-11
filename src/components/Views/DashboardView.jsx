import { useState } from 'react';

export function DashboardView({
  userData,
  user,
  legacyPanelEnabled,
  setIsImportModalOpen,
  cardBgClass,
  dashboardPanelOpen,
  setDashboardPanelOpen,
  isAppInstalled,
  handleInstallApp,
  attendanceType,
  setAttendanceType,
  dashboardGroupId,
  setDashboardGroupId,
  dashboardAttendanceType,
  setDashboardAttendanceType,
  userRole,
  visibleGroups,
  dashboardDate,
  setDashboardDate,
  browserThemeStyle,
  inputBgClass,
  themeMode,
  dashboardAttendanceStats,
  AssistantWidget,
  absentRate,
  activeViewMode,
  labelTextClass,
  attendanceDate,
  setAttendanceDate,
  setAttendanceLabel,
  getAttendanceLabel,
  visibleStudents,
  selectedGroupId,
  attendanceLabel,
  attendanceLabelSaveTimeoutRef,
  handleSaveAttendanceLabelForDate,
  setSelectedGroupId,
  handleScanQr,
  setDeleteDateTarget,
  diaconias,
  getAttendanceStatus,
  handleMarkAttendance,
  handleOpenAttendanceMessage,
  handleCreateGroup,
  newGroupName,
  setNewGroupName,
  newGroupYear,
  setNewGroupYear,
  newGroupDay,
  setNewGroupDay,
  newGroupTime,
  setNewGroupTime,
  newGroupRoom,
  setNewGroupRoom,
  groupScheduleOptions = { days: [], times: [], rooms: [] },
  newGroupParroquia,
  setNewGroupParroquia,
  newGroupDiaconia,
  setNewGroupDiaconia,
  parroquias,
  handleAddStudent,
  newStudentName,
  setNewStudentName,
  newStudentParentEmail,
  setNewStudentParentEmail,
  selectedGroupForStudent,
  setSelectedGroupForStudent
}) {
  const [hoveredDonutSegment, setHoveredDonutSegment] = useState(null);
  const sortedAttendanceStudents = visibleStudents
    .filter(student => student.groupId === selectedGroupId)
    .sort((a, b) => String(a.name || a.fullName || '').localeCompare(String(b.name || b.fullName || ''), 'es', { sensitivity: 'base' }));
  const donutSegments = [
    { key: 'present', label: 'Presentes', value: dashboardAttendanceStats.present, color: '#10b981' },
    { key: 'justified', label: 'Justificados', value: dashboardAttendanceStats.justified, color: '#f59e0b' },
    { key: 'absent', label: 'Ausentes', value: dashboardAttendanceStats.absent, color: '#f43f5e' }
  ];
  const donutTotal = dashboardAttendanceStats.total || 0;
  const donutRadius = 38;
  const donutCircumference = 2 * Math.PI * donutRadius;
  let donutOffset = 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">
            Bienvenido(a), {(userData?.name || user?.displayName || user?.email || 'Catequista').trim().split(/\s+/)[0]}
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">Panel operativo del ministerio de catequesis.</p>
        </div>
        {legacyPanelEnabled && (
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2"
          >
            <span>📊</span> Cargar Catequizandos en Excel
          </button>
        )}
      </div>

      <div className={`${cardBgClass} p-4 sm:p-6 rounded-xl border shadow-sm`}>
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-bold">Panel inteligente</h3>
            <p className="text-xs text-slate-400">Ausencias y asistente IA</p>
          </div>
          <div className="flex items-center gap-2">
            {!isAppInstalled && (
              <button
                type="button"
                onClick={handleInstallApp}
                className="px-3 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                title="Instalar AsisCate como aplicación"
              >
                ⬇ Instalar app
              </button>
            )}
            <button
              type="button"
              onClick={() => setDashboardPanelOpen(prev => !prev)}
              className="dashboard-toggle-button px-3 py-2 text-xs font-bold rounded-lg bg-slate-700 hover:bg-slate-600 text-white"
            >
              {dashboardPanelOpen ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
        </div>

        {dashboardPanelOpen && (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.2fr] gap-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-300">Consulta de asistencia</p>
                <span className="text-[11px] text-slate-400 uppercase">{dashboardAttendanceType === 'all' ? 'Todas' : dashboardAttendanceType === 'misa' ? 'Misa' : 'Encuentro'}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select value={dashboardGroupId} onChange={(event) => setDashboardGroupId(event.target.value)} className={`rounded-lg px-3 py-2 text-xs ${inputBgClass}`}>
                  <option value="">{userRole === 'catequista' ? 'Todos mis grupos' : 'Todos los grupos visibles'}</option>
                  {visibleGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
                <select value={dashboardAttendanceType} onChange={(event) => setDashboardAttendanceType(event.target.value)} className={`rounded-lg px-3 py-2 text-xs ${inputBgClass}`} aria-label="Tipo de asistencia del gráfico">
                  <option value="all">Todas</option>
                  <option value="encuentro">Encuentro</option>
                  <option value="misa">Misa</option>
                </select>
                <input type="date" value={dashboardDate} onChange={(event) => setDashboardDate(event.target.value)} style={browserThemeStyle} className={`rounded-lg px-3 py-2 text-xs ${inputBgClass}`} />
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4 flex flex-col sm:flex-row items-center gap-5">
                <div className="relative h-32 w-32 shrink-0">
                  <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-label="Distribución de asistencia">
                    <circle cx="50" cy="50" r={donutRadius} fill="none" stroke={themeMode === 'dark' ? '#334155' : '#cbd5e1'} strokeWidth="18" />
                    {donutSegments.map(segment => {
                      const segmentLength = donutTotal ? (segment.value / donutTotal) * donutCircumference : 0;
                      const segmentOffset = -donutOffset;
                      donutOffset += segmentLength;
                      return segmentLength > 0 ? (
                        <circle
                          key={segment.key}
                          cx="50"
                          cy="50"
                          r={donutRadius}
                          fill="none"
                          stroke={segment.color}
                          strokeWidth="18"
                          strokeDasharray={`${segmentLength} ${donutCircumference - segmentLength}`}
                          strokeDashoffset={segmentOffset}
                          className="cursor-pointer transition-opacity hover:opacity-70"
                          onMouseEnter={() => setHoveredDonutSegment(segment.key)}
                          onMouseLeave={() => setHoveredDonutSegment(null)}
                        >
                          <title>{`${segment.label}: ${donutTotal ? Math.round((segment.value / donutTotal) * 100) : 0}%`}</title>
                        </circle>
                      ) : null;
                    })}
                  </svg>
                  <div className={`pointer-events-none absolute inset-5 rounded-full flex flex-col items-center justify-center ${themeMode === 'dark' ? 'bg-black' : 'bg-white'}`}>
                    <span className="text-2xl font-black">{dashboardAttendanceStats.total}</span>
                    <span className="text-[10px] text-slate-400">registros</span>
                  </div>
                  {hoveredDonutSegment && (() => {
                    const segment = donutSegments.find(item => item.key === hoveredDonutSegment);
                    return segment ? <div className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-white shadow-lg">{segment.label}: {donutTotal ? Math.round((segment.value / donutTotal) * 100) : 0}%</div> : null;
                  })()}
                </div>
                <div className="w-full space-y-2 text-xs text-slate-400">
                  <div className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Presentes</span><span className="font-bold text-emerald-400">{dashboardAttendanceStats.present}</span></div>
                  <div className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />Justificados</span><span className="font-bold text-amber-400">{dashboardAttendanceStats.justified}</span></div>
                  <div className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" />Ausentes</span><span className="font-bold text-rose-400">{dashboardAttendanceStats.absent}</span></div>
                  <p className="pt-1 text-[11px] text-slate-500">{dashboardDate ? `Fecha: ${dashboardDate}` : 'Resumen acumulado del grupo'}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-3 sm:p-4">
              <AssistantWidget 
                attendanceType={dashboardAttendanceType} 
                absentRate={absentRate} 
                userRole={activeViewMode}
                userName={userData?.fullName || user?.displayName || 'Usuario'}
                themeMode={themeMode}
              />
            </div>
          </div>
        )}
      </div>

      {/* SECCIÓN PRINCIPAL DE TOMA DE ASISTENCIA */}
      <div className="space-y-4">
        <div className={`${cardBgClass} p-4 sm:p-6 rounded-xl border shadow-sm space-y-4`}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
              <span>📋</span> Control de Asistencia
            </h2>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className={`block text-xs font-bold ${labelTextClass} uppercase mb-1`}>Fecha del Encuentro</label>
              <input
                type="date"
                value={attendanceDate}
                style={browserThemeStyle}
                onChange={(e) => {
                  const date = e.target.value;
                  setAttendanceDate(date);
                  setAttendanceLabel(getAttendanceLabel(sortedAttendanceStudents, date, attendanceType));
                }}
                className={`w-full rounded-lg px-4 py-2 text-xs sm:text-sm ${inputBgClass}`}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Tipo de asistencia</label>
              <select
                value={attendanceType}
                onChange={(e) => {
                  const nextType = e.target.value;
                  setAttendanceType(nextType);
                  setAttendanceLabel(getAttendanceLabel(sortedAttendanceStudents, attendanceDate, nextType));
                }}
                className={`w-full rounded-lg px-4 py-2 text-xs sm:text-sm ${inputBgClass}`}
              >
                <option value="encuentro">Encuentro</option>
                <option value="misa">Misa</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                Tema del Encuentro (Opcional)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ej. Encuentro #3 - Los Mandamientos / Asistencia a Misa"
                  value={attendanceLabel}
                  onChange={(e) => {
                    const nextLabel = e.target.value;
                    setAttendanceLabel(nextLabel);
                    if (attendanceLabelSaveTimeoutRef.current) {
                      window.clearTimeout(attendanceLabelSaveTimeoutRef.current);
                    }
                    if (selectedGroupId) {
                      attendanceLabelSaveTimeoutRef.current = window.setTimeout(() => {
                        handleSaveAttendanceLabelForDate(selectedGroupId, attendanceDate, nextLabel, attendanceType);
                      }, 700);
                    }
                  }}
                  onBlur={() => {
                    if (attendanceLabelSaveTimeoutRef.current) {
                      window.clearTimeout(attendanceLabelSaveTimeoutRef.current);
                    }
                    if (selectedGroupId) {
                      handleSaveAttendanceLabelForDate(selectedGroupId, attendanceDate, attendanceLabel, attendanceType);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (attendanceLabelSaveTimeoutRef.current) {
                        window.clearTimeout(attendanceLabelSaveTimeoutRef.current);
                      }
                      if (selectedGroupId) {
                        handleSaveAttendanceLabelForDate(selectedGroupId, attendanceDate, attendanceLabel, attendanceType);
                      }
                    }
                  }}
                  className={`w-full rounded-lg px-4 py-2 text-xs sm:text-sm ${inputBgClass}`}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Seleccionar Grupo</label>
              <select
                value={selectedGroupId}
                onChange={(e) => {
                  const groupId = e.target.value;
                  setSelectedGroupId(groupId);
                  setAttendanceLabel(getAttendanceLabel(visibleStudents.filter(student => student.groupId === groupId), attendanceDate, attendanceType));
                }}
                className={`w-full rounded-lg px-4 py-2 text-xs sm:text-sm ${inputBgClass}`}
              >
                <option value="">Selecciona un Grupo...</option>
                {visibleGroups.map(g => (
                  <option key={g.id} value={g.id}>{g.name} ({g.year || '2026-2027'})</option>
                ))}
              </select>
            </div>

            {selectedGroupId && (
              <div className="sm:col-span-4 grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleScanQr}
                  className="w-full rounded-lg bg-sky-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-sky-700"
                >
                  Escanear QR
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteDateTarget({ groupId: selectedGroupId, dateStr: attendanceDate, type: attendanceType })}
                  className="w-full rounded-lg bg-rose-600/10 border border-rose-500/50 px-3 py-2 text-[11px] font-bold text-rose-400 hover:bg-rose-600/20"
                >
                  Borrar asistencia de esta fecha
                </button>
              </div>
            )}
          </div>
        </div>

        {selectedGroupId ? (
          <div className={`${cardBgClass} rounded-xl border shadow-sm overflow-hidden`}>
            {/* VISTA EN TARJETAS PARA PANTALLAS PEQUEÑAS */}
            <div className="block md:hidden divide-y divide-slate-700">
              {sortedAttendanceStudents.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 italic">
                  No hay Catequizandos matriculados en este grupo.
                </div>
              ) : (
                sortedAttendanceStudents.map(student => {
                    const status = getAttendanceStatus(student, attendanceDate);
                    const displayEmail = student.parentEmail || student.family?.guardian?.email || student.family?.mother?.email || student.family?.father?.email || '';
                    const displayPhone = student.parentPhone || student.phone || student.family?.guardian?.phone1 || student.family?.mother?.phone1 || student.family?.father?.phone1 || '';
                    const contactStudent = { ...student, parentEmail: displayEmail, parentPhone: displayPhone };
                    return (
                      <div key={student.id} className="p-4 space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-bold text-sm">{student.fullName || student.name}</h4>
                            <p className="text-xs text-slate-400 mt-0.5">
                              {displayEmail ? `📧 ${displayEmail}` : <span className="italic text-slate-500">Sin correo</span>}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <button disabled={!displayEmail} onClick={() => handleOpenAttendanceMessage(contactStudent, 'email')} title={displayEmail || 'Correo no registrado'} className="attendance-email-button max-w-36 truncate text-[11px] font-semibold px-2 py-1 rounded-md">✉ {displayEmail || 'Sin correo'}</button>
                            <button disabled={!displayPhone} onClick={() => handleOpenAttendanceMessage(contactStudent, 'phone')} title={displayPhone || 'Teléfono no registrado'} className="attendance-phone-button max-w-36 truncate text-[11px] font-semibold px-2 py-1 rounded-md">☎ {displayPhone || 'Sin teléfono'}</button>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5 pt-1">
                          <button
                            onClick={() => handleMarkAttendance(student.id, 'present')}
                            className={`py-2 text-xs font-bold rounded-lg transition-all border ${
                              status === 'present'
                                ? 'bg-emerald-600 border-emerald-500 text-white shadow-sm'
                                : (themeMode === 'dark' ? 'bg-black border-neutral-800 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100')
                            }`}
                          >
                            Presente
                          </button>
                          <button
                            onClick={() => handleMarkAttendance(student.id, 'justified')}
                            className={`py-2 text-xs font-bold rounded-lg transition-all border ${
                              status === 'justified'
                                ? 'bg-amber-500 border-amber-400 text-white shadow-sm'
                                : (themeMode === 'dark' ? 'bg-black border-neutral-800 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100')
                            }`}
                          >
                            Justificada
                          </button>
                          <button
                            onClick={() => handleMarkAttendance(student.id, 'absent')}
                            className={`py-2 text-xs font-bold rounded-lg transition-all border ${
                              status === 'absent'
                                ? 'bg-rose-600 border-rose-500 text-white shadow-sm'
                                : (themeMode === 'dark' ? 'bg-black border-neutral-800 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300' : 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100')
                            }`}
                          >
                            Ausente
                          </button>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            {/* VISTA EN TABLA */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-700">
                <thead className={themeMode === 'dark' ? 'bg-black' : 'bg-slate-50'}>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase">Catequizando</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-slate-400 uppercase">Estado de Asistencia</th>
                    <th className="px-6 py-3 text-right text-xs font-bold text-slate-400 uppercase">Contacto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {sortedAttendanceStudents.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="px-6 py-8 text-center text-slate-400 italic">No hay Catequizandos matriculados en este grupo.</td>
                    </tr>
                  ) : (
                    sortedAttendanceStudents.map(student => {
                        const status = getAttendanceStatus(student, attendanceDate);
                        const displayEmail = student.parentEmail || student.family?.guardian?.email || student.family?.mother?.email || student.family?.father?.email || '';
                        const displayPhone = student.parentPhone || student.phone || student.family?.guardian?.phone1 || student.family?.mother?.phone1 || student.family?.father?.phone1 || '';
                        const contactStudent = { ...student, parentEmail: displayEmail, parentPhone: displayPhone };

                        return (
                          <tr key={student.id} className="hover:bg-slate-700/20 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold">
                              {student.fullName || student.name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className={`inline-flex rounded-lg shadow-sm border p-1 gap-1 ${themeMode === 'dark' ? 'border-neutral-800 bg-black' : 'border-slate-200 bg-white'}`}>
                                <button
                                  onClick={() => handleMarkAttendance(student.id, 'present')}
                                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                                    status === 'present'
                                      ? 'bg-emerald-600 text-white shadow-sm'
                                      : (themeMode === 'dark' ? 'text-emerald-400 hover:bg-emerald-500/10' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100')
                                  }`}
                                >
                                  Presente
                                </button>
                                <button
                                  onClick={() => handleMarkAttendance(student.id, 'justified')}
                                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                                    status === 'justified'
                                      ? 'bg-amber-500 text-white shadow-sm'
                                      : (themeMode === 'dark' ? 'text-amber-400 hover:bg-amber-500/10' : 'bg-amber-50 text-amber-700 hover:bg-amber-100')
                                  }`}
                                >
                                  Justificada
                                </button>
                                <button
                                  onClick={() => handleMarkAttendance(student.id, 'absent')}
                                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                                    status === 'absent'
                                      ? 'bg-rose-600 text-white shadow-sm'
                                      : (themeMode === 'dark' ? 'text-rose-400 hover:bg-rose-500/10' : 'bg-rose-50 text-rose-700 hover:bg-rose-100')
                                  }`}
                                >
                                  Ausente
                                </button>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  disabled={!displayEmail}
                                  onClick={() => handleOpenAttendanceMessage(contactStudent, 'email')}
                                  title={displayEmail || 'Correo no registrado'}
                                  className="attendance-email-button max-w-64 truncate text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                                >
                                  {displayEmail ? `✉ ${displayEmail}` : 'Correo no registrado'}
                                </button>
                                <button
                                  disabled={!displayPhone}
                                  onClick={() => handleOpenAttendanceMessage(contactStudent, 'phone')}
                                  title={displayPhone || 'Teléfono no registrado'}
                                  className="attendance-phone-button max-w-52 truncate text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                                >
                                  {displayPhone ? `☎ ${displayPhone}` : 'Teléfono no registrado'}
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
          </div>
        ) : (
          <div className="border border-dashed border-slate-700 rounded-xl p-6 text-center text-xs sm:text-sm text-slate-400">
            Selecciona un grupo en la parte superior para pasar lista.
          </div>
        )}
      </div>

      {legacyPanelEnabled ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 pt-4">
            {/* Crear Grupo */}
            <div className={`${cardBgClass} p-4 sm:p-6 rounded-xl border shadow-sm`}>
              <h3 className="text-base sm:text-lg font-bold mb-3 sm:mb-4">Añadir Nuevo Grupo</h3>
              <form onSubmit={handleCreateGroup} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Nombre del Grupo (Ej. Confirmación - A)"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className={`sm:col-span-2 rounded-lg px-4 py-2 text-xs sm:text-sm ${inputBgClass}`}
                  />
                  <input
                    type="text"
                    placeholder="Año (2026-2027)"
                    value={newGroupYear}
                    onChange={(e) => setNewGroupYear(e.target.value)}
                    className={`rounded-lg px-3 py-2 text-xs sm:text-sm ${inputBgClass}`}
                  />
                </div>

                {activeViewMode === 'admin' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select
                      value={newGroupParroquia}
                      onChange={(e) => { setNewGroupParroquia(e.target.value); setNewGroupDiaconia(''); }}
                      className={`w-full rounded-lg px-3 py-2 text-xs ${inputBgClass}`}
                    >
                      <option value="">Parroquia...</option>
                      {parroquias.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <select
                      disabled={!newGroupParroquia}
                      value={newGroupDiaconia}
                      onChange={(e) => setNewGroupDiaconia(e.target.value)}
                      className={`w-full rounded-lg px-3 py-2 text-xs ${inputBgClass}`}
                    >
                      <option value="">Diaconía...</option>
                      {diaconias.filter(d => d.parroquiaId === newGroupParroquia).map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 bg-slate-700/30 p-2 rounded border border-slate-700">
                    Se asignará a tu Parroquia y Diaconía registrada.
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select value={newGroupDay || ''} onChange={event => setNewGroupDay(event.target.value)} className={`rounded-lg px-3 py-2 text-xs ${inputBgClass}`}><option value="">Día...</option>{groupScheduleOptions.days.map(day => <option key={day} value={day}>{day}</option>)}</select>
                  <select value={newGroupTime || ''} onChange={event => setNewGroupTime(event.target.value)} className={`rounded-lg px-3 py-2 text-xs ${inputBgClass}`}><option value="">Horario...</option>{groupScheduleOptions.times.map(time => <option key={time} value={time}>{time}</option>)}</select>
                  <select value={newGroupRoom || ''} onChange={event => setNewGroupRoom(event.target.value)} className={`rounded-lg px-3 py-2 text-xs ${inputBgClass}`}><option value="">Salón...</option>{groupScheduleOptions.rooms.map(room => <option key={room} value={room}>{room}</option>)}</select>
                </div>

                <button
                  type="submit"
                  className="w-full bg-red-800 hover:bg-red-900 text-white font-semibold py-2 rounded-lg text-xs sm:text-sm transition-colors"
                >
                  Crear Grupo
                </button>
              </form>
            </div>

            {/* Crear Catequizando */}
            <div className={`${cardBgClass} p-4 sm:p-6 rounded-xl border shadow-sm`}>
              <h3 className="text-base sm:text-lg font-bold mb-3 sm:mb-4">Inscribir Catequizando</h3>
              <form onSubmit={handleAddStudent} className="space-y-3">
                <input
                  type="text"
                  placeholder="Nombre Completo del Catequizando"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  className={`w-full rounded-lg px-4 py-2 text-xs sm:text-sm ${inputBgClass}`}
                />
                <input
                  type="email"
                  placeholder="Correo de Padres (Opcional)"
                  value={newStudentParentEmail}
                  onChange={(e) => setNewStudentParentEmail(e.target.value)}
                  className={`w-full rounded-lg px-4 py-2 text-xs sm:text-sm ${inputBgClass}`}
                />
                <select
                  value={selectedGroupForStudent}
                  onChange={(e) => setSelectedGroupForStudent(e.target.value)}
                  className={`w-full rounded-lg px-4 py-2 text-xs sm:text-sm ${inputBgClass}`}
                >
                  <option value="">Selecciona un grupo...</option>
                  {visibleGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.name} ({g.year || '2026-2027'})</option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="w-full bg-red-800 hover:bg-red-900 text-white font-semibold py-2 rounded-lg text-xs sm:text-sm transition-colors"
                >
                  Inscribir Catequizando
                </button>
              </form>
            </div>
          </div>

          {/* LISTA DE GRUPOS DISPONIBLES */}
          <div className={`${cardBgClass} p-4 sm:p-6 rounded-xl border shadow-sm`}>
            <h3 className="text-base sm:text-lg font-bold mb-4">Grupos Disponibles ({activeViewMode})</h3>
            {visibleGroups.length === 0 ? (
              <p className="text-xs sm:text-sm text-slate-400 italic">No hay grupos asignados o visibles en esta vista.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {visibleGroups.map(group => {
                  const countStudents = visibleStudents.filter(s => s.groupId === group.id).length;
                  const catechists = group.catechistNames ? group.catechistNames.join(', ') : 'Sin asignar';
                  const parroquiaObj = parroquias.find(p => p.id === group.parroquiaId);
                  const diaconiaObj = diaconias.find(d => d.id === group.diaconiaId);

                  return (
                    <div key={group.id} className={`p-4 border rounded-xl flex flex-col justify-between ${themeMode === 'dark' ? 'bg-black border-neutral-800' : 'bg-slate-50 border-slate-200'}`}>
                      <div>
                        <div className="flex justify-between items-start">
                          <p className="font-bold text-sm sm:text-base">{group.name}</p>
                          <span className={`text-xs px-2 py-0.5 rounded font-mono ${themeMode === 'dark' ? 'bg-neutral-900 text-neutral-300' : 'bg-slate-200 text-slate-600'}`}>
                            {group.year || '2026-2027'}
                          </span>
                        </div>
                        <p className="text-[11px] font-semibold text-emerald-500 mt-0.5">
                          {parroquiaObj?.name || 'Parroquia'} - {diaconiaObj?.name || 'Diaconía'}
                        </p>
                        <p className="text-xs text-slate-400 mt-2">Catequistas: <span className="font-semibold text-slate-300">{catechists}</span></p>
                        <p className="text-xs text-slate-500 mt-1">{countStudents} Catequizandos matriculados</p>
                        {group.isVisibleForCatechists === false && (
                          <span className="inline-block mt-2 text-[10px] bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded font-bold">
                            🔒 Oculto a Catequistas
                          </span>
                        )}
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={(event) => { event.stopPropagation(); setSelectedGroupId(group.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                          className="w-full text-center text-xs bg-red-800/10 hover:bg-red-800/20 text-red-700 dark:text-red-400 font-bold px-3 py-2 rounded-lg transition-colors border border-red-800/20"
                        >
                          Tomar Asistencia ↑
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
