import React from 'react';

export function ReportsView({
  cardBgClass,
  selectedGroupId,
  setSelectedGroupId,
  setReportStudentIds,
  visibleStudents,
  visibleGroups,
  activeViewMode,
  handleDeleteOrphanedAttendance,
  reportSubTab,
  setReportSubTab,
  reportFilters,
  setReportFilters,
  inputBgClass,
  reportAttendanceType,
  setReportAttendanceType,
  handleExportAttendanceToExcel,
  handleExportAttendanceToPdf,
  getAttendanceReportView,
  themeMode,
  getAttendanceDisplayTypeForDate,
  getAttendanceLabel,
  attendanceDateEditor,
  setAttendanceDateEditor,
  handleUpdateAttendanceDate,
  reportStudentIds,
  getAttendanceStatus,
  handleMarkAttendance,
  attendanceLabel,
  getGroupStatistics,
  getFilteredReportAttendance,
  issuedCertificates,
  generatedCertificates,
  levelCertificateHistory,
  attendanceLetterHistory,
  certificateSearchType,
  certificateSearch,
  certificateFilters,
  levelCertificateFilters,
  certificatePageSize,
  certificatePage,
  setCertificatePage,
  userRole,
  certificateGenerationOpen,
  setCertificateGenerationOpen,
  certificateGenerationType,
  setCertificateGenerationType,
  certificateLetterDate,
  setCertificateLetterDate,
  selectedCertificateIds,
  setSelectedCertificateIds,
  handleExportSelectedCertificatesZip,
  handleGenerateSelectedCertificate,
  certificateSearchOpen,
  setCertificateSearchOpen,
  setCertificateSearch,
  setLevelCertificateFilters,
  levelOptions,
  groups,
  setCertificateFilters,
  handleScanCertificateQr,
  setCertificatePageSize,
  handleGenerateLevelCertificate,
  handleGenerateAttendanceLetter,
  setAttendanceLetterHistory,
  handleDeleteLevelCertificate,
  handleDeleteCertificate
}) {
  return (
    <div className="space-y-6">
      <div className={`${cardBgClass} p-4 sm:p-6 rounded-xl border shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4`}>
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">Reportes</h2>
          <p className="text-xs sm:text-sm text-slate-400">Asistencia, estadísticas y certificados digitales del grupo.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
          <select value={selectedGroupId} onChange={(e) => { const groupId = e.target.value; setSelectedGroupId(groupId); setReportStudentIds(groupId ? visibleStudents.filter(student => student.groupId === groupId).map(student => student.id) : null); }} className={`w-full sm:min-w-80 rounded-lg px-4 py-2 text-xs sm:text-sm ${inputBgClass}`}>
            <option value="">Selecciona un Grupo...</option>
            {visibleGroups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.year || '2026-2027'})</option>)}
          </select>
          {activeViewMode === 'admin' && (
            <button
              type="button"
              onClick={handleDeleteOrphanedAttendance}
              className="w-full sm:w-auto whitespace-nowrap rounded-lg border border-amber-500 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-400 hover:bg-amber-500/20"
            >
              Borrar asistencias sin grupo asignado
            </button>
          )}
        </div>
      </div>

      {selectedGroupId && (
        <div className={`${cardBgClass} p-3 rounded-xl border shadow-sm`}>
          <div className="flex flex-wrap gap-2 mb-4">
            {['asistencia', 'estadisticas', 'certificados'].map(tab => (
              <button
                key={tab}
                onClick={() => setReportSubTab(tab)}
                className={`px-3 py-2 rounded-lg text-xs font-bold ${reportSubTab === tab ? 'bg-red-800 text-white' : 'bg-slate-700 text-slate-300'}`}
              >
                {tab === 'asistencia' ? 'Asistencia' : tab === 'estadisticas' ? 'Estadísticas' : 'Certificados'}
              </button>
            ))}
          </div>

          {reportSubTab === 'asistencia' && (
            <div className="space-y-4">
              <div className="flex flex-col lg:flex-row gap-3 justify-between items-start lg:items-center">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 w-full lg:max-w-2xl">
                  <input
                    type="text"
                    value={reportFilters.search}
                    onChange={(event) => setReportFilters(prev => ({ ...prev, search: event.target.value }))}
                    placeholder="Buscar catequizando"
                    className={`rounded-lg px-3 py-2 text-xs ${inputBgClass}`}
                  />
                  <input
                    type="date"
                    value={reportFilters.dateFrom}
                    onChange={(event) => setReportFilters(prev => ({ ...prev, dateFrom: event.target.value }))}
                    className={`rounded-lg px-3 py-2 text-xs ${inputBgClass}`}
                    placeholder="Desde"
                  />
                  <input
                    type="date"
                    value={reportFilters.dateTo}
                    onChange={(event) => setReportFilters(prev => ({ ...prev, dateTo: event.target.value }))}
                    className={`rounded-lg px-3 py-2 text-xs ${inputBgClass}`}
                    placeholder="Hasta"
                  />
                  <select
                    value={reportAttendanceType}
                    onChange={(event) => setReportAttendanceType(event.target.value)}
                    className={`rounded-lg px-3 py-2 text-xs ${inputBgClass}`}
                  >
                    <option value="all">Misa + Encuentros</option>
                    <option value="encuentro">Encuentros</option>
                    <option value="misa">Misa</option>
                  </select>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 justify-end">
                  <button onClick={() => handleExportAttendanceToExcel(selectedGroupId)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold px-4 py-2.5 rounded-lg">📥 Excel</button>
                  <button onClick={() => handleExportAttendanceToPdf(selectedGroupId)} className="bg-red-800 hover:bg-red-900 text-white text-xs sm:text-sm font-bold px-4 py-2.5 rounded-lg">📄 PDF</button>
                </div>
              </div>

              {(() => {
                const { groupStudents, sortedDates } = getAttendanceReportView(selectedGroupId);

                if (groupStudents.length === 0) {
                  return <div className={`${cardBgClass} p-6 rounded-xl border text-center text-slate-400 text-sm`}>No hay Catequizandos registrados en este grupo.</div>;
                }

                if (sortedDates.length === 0) {
                  return <div className={`${cardBgClass} p-6 rounded-xl border text-center text-slate-400 text-sm`}>Aún no se han tomado asistencias para este grupo con estos filtros.</div>;
                }

                return (
                  <div className={`${cardBgClass} rounded-xl border shadow-sm overflow-hidden`}>
                    <div className="p-4 border-b border-slate-700 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                      <div>
                        <h3 className="font-bold text-sm sm:text-base">Vista Previa Interactiva de Asistencias</h3>
                        <span className="text-xs text-slate-400">Desde aquí puedes gestionar las asistencias</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setReportStudentIds(groupStudents.map(student => student.id))}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20"
                        >
                          Seleccionar todos
                        </button>
                        <button
                          type="button"
                          onClick={() => setReportStudentIds([])}
                          className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-xs font-bold hover:bg-rose-500/20"
                        >
                          Deseleccionar todos
                        </button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-700 text-xs sm:text-sm">
                        <thead className={themeMode === 'dark' ? 'bg-slate-900/80' : 'bg-slate-100'}>
                          <tr>
                            <th className="px-4 py-3 text-left font-bold text-slate-400 uppercase sticky left-0 z-10 bg-inherit shadow-md min-w-[220px]">Catequizando</th>
                            {sortedDates.map(d => {
                              const displayType = reportAttendanceType === 'all' ? getAttendanceDisplayTypeForDate(groupStudents, d) : reportAttendanceType;
                              const label = getAttendanceLabel(groupStudents, d, reportAttendanceType === 'all' ? 'all' : reportAttendanceType);
                              const isEditingDate = attendanceDateEditor && attendanceDateEditor.groupId === selectedGroupId && attendanceDateEditor.oldDate === d;
                              return (
                                <th key={d} className="px-3 py-3 text-center font-bold text-slate-300 min-w-[140px] border-l border-slate-700">
                                  <div className="flex flex-col items-center gap-1">
                                    <div className="text-[10px] uppercase tracking-wide text-amber-400 font-semibold">
                                      {displayType === 'misa' ? 'Misa' : 'Encuentro'}
                                    </div>
                                    <div>{d}</div>
                                    {label && <div className="text-[10px] text-amber-400 font-normal truncate max-w-[130px]" title={label}>{label}</div>}
                                    {activeViewMode === 'admin' && (
                                      <button
                                        type="button"
                                        onClick={() => setAttendanceDateEditor({ groupId: selectedGroupId, oldDate: d, targetType: displayType, nextDate: d })}
                                        className="text-[9px] font-bold text-sky-400 hover:text-sky-300"
                                      >
                                        Editar fecha
                                      </button>
                                    )}
                                    {isEditingDate && (
                                      <div className="flex items-center gap-1 mt-1">
                                        <input
                                          type="date"
                                          value={attendanceDateEditor.nextDate || d}
                                          onChange={(event) => setAttendanceDateEditor(prev => ({ ...prev, nextDate: event.target.value }))}
                                          className="rounded px-1 py-0.5 text-[9px] bg-slate-800 border border-slate-600 text-white"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => {
                                            if (attendanceDateEditor?.nextDate) {
                                              handleUpdateAttendanceDate(selectedGroupId, d, attendanceDateEditor.targetType, attendanceDateEditor.nextDate);
                                            }
                                          }}
                                          className="px-1.5 py-0.5 rounded bg-emerald-600 text-[9px] text-white font-bold"
                                        >
                                          OK
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                          {groupStudents.map(student => (
                            <tr key={student.id} className="hover:bg-slate-700/20 transition-colors">
                              <td className="px-4 py-3 font-semibold sticky left-0 z-10 bg-inherit shadow-md">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={reportStudentIds === null || reportStudentIds.includes(student.id)}
                                    onChange={(event) => {
                                      const currentIds = reportStudentIds === null ? groupStudents.map(item => item.id) : reportStudentIds;
                                      setReportStudentIds(event.target.checked
                                        ? [...new Set([...currentIds, student.id])]
                                        : currentIds.filter(id => id !== student.id));
                                    }}
                                    className="rounded text-red-800 focus:ring-red-800"
                                  />
                                  <span>{student.name}</span>
                                </label>
                              </td>
                              {sortedDates.map(d => {
                                const resolvedType = reportAttendanceType === 'all' ? getAttendanceDisplayTypeForDate([student], d) : reportAttendanceType;
                                const status = getAttendanceStatus(student, d, reportAttendanceType === 'all' ? 'all' : reportAttendanceType);
                                return (
                                  <td key={d} className="px-2 py-2 text-center border-l border-slate-700/50">
                                    <div className={`inline-flex rounded-md p-0.5 border gap-0.5 ${themeMode === 'dark' ? 'bg-black border-neutral-800' : 'bg-slate-50 border-slate-200'}`}>
                                      <button onClick={() => handleMarkAttendance(student.id, 'present', d, attendanceLabel, resolvedType)} title="Presente" className={`px-1.5 py-1 text-[10px] font-bold rounded ${status === 'present' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}>P</button>
                                      <button onClick={() => handleMarkAttendance(student.id, 'justified', d, attendanceLabel, resolvedType)} title="Justificada" className={`px-1.5 py-1 text-[10px] font-bold rounded ${status === 'justified' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:text-white'}`}>J</button>
                                      <button onClick={() => handleMarkAttendance(student.id, 'absent', d, attendanceLabel, resolvedType)} title="Ausente" className={`px-1.5 py-1 text-[10px] font-bold rounded ${status === 'absent' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'}`}>A</button>
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {reportSubTab === 'estadisticas' && (
            <div className="space-y-4">
              {(() => {
                const stats = getGroupStatistics(selectedGroupId, reportStudentIds);
                const { groupStudents, selectedStudents: selectedGroupStudents } = getAttendanceReportView(selectedGroupId);
                const totalRecords = stats.totalRecords || 0;
                const presentPercent = totalRecords ? Math.round((stats.present / totalRecords) * 100) : 0;
                const justifiedPercent = totalRecords ? Math.round((stats.justified / totalRecords) * 100) : 0;
                const absentPercent = totalRecords ? Math.round((stats.absent / totalRecords) * 100) : 0;
                const donutEndPresent = presentPercent;
                const donutEndJustified = presentPercent + justifiedPercent;
                const donutStyle = totalRecords
                  ? { background: `conic-gradient(#10b981 0 ${donutEndPresent}%, #f59e0b ${donutEndPresent}% ${donutEndJustified}%, #f43f5e ${donutEndJustified}% 100%)` }
                  : { background: 'conic-gradient(#475569 0 100%)' };
                const studentStats = selectedGroupStudents.map(student => {
                  const records = getFilteredReportAttendance(student);
                  const present = records.filter(record => (record.status || (record.present ? 'present' : 'absent')) === 'present').length;
                  const justified = records.filter(record => (record.status || (record.present ? 'present' : 'absent')) === 'justified').length;
                  const absent = records.filter(record => (record.status || (record.present ? 'present' : 'absent')) === 'absent').length;
                  const total = present + justified + absent;
                  return { student, present, justified, absent, total, rate: total ? Math.round(((present + justified) / total) * 100) : 0 };
                }).sort((first, second) => second.rate - first.rate);
                if (!groupStudents.length) {
                  return <div className={`${cardBgClass} p-6 rounded-xl border text-center text-slate-400 text-sm`}>No hay catequizandos en este grupo.</div>;
                }

                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,0.8fr)_1.2fr] gap-4">
                      <div className={`${cardBgClass} rounded-xl border p-5 flex flex-col items-center justify-center`}>
                        <div className="relative h-44 w-44 rounded-full" style={donutStyle}>
                          <div className={`absolute inset-7 rounded-full flex flex-col items-center justify-center ${themeMode === 'dark' ? 'bg-black' : 'bg-white'}`}>
                            <span className="text-3xl font-black">{stats.rate}%</span>
                            <span className="text-[11px] text-slate-400">asistencia efectiva</span>
                          </div>
                        </div>
                        <p className="mt-3 text-xs text-slate-400">{stats.total} catequizando(s) · {totalRecords} registros</p>
                      </div>

                      <div className={`${cardBgClass} rounded-xl border p-5 space-y-4`}>
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold text-sm">Distribución de asistencia</h3>
                          <span className="text-[11px] text-slate-400">{totalRecords ? 'Porcentaje del total' : 'Sin registros'}</span>
                        </div>
                        <div className="h-8 w-full overflow-hidden rounded-lg bg-slate-700/50 flex">
                          <div className="bg-emerald-500 transition-all" style={{ width: `${presentPercent}%` }} title={`Presentes: ${presentPercent}%`} />
                          <div className="bg-amber-500 transition-all" style={{ width: `${justifiedPercent}%` }} title={`Justificadas: ${justifiedPercent}%`} />
                          <div className="bg-rose-500 transition-all" style={{ width: `${absentPercent}%` }} title={`Ausentes: ${absentPercent}%`} />
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-xs">
                          <div><div className="flex items-center gap-2 text-slate-400"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Presentes</div><p className="mt-1 text-lg font-black text-emerald-400">{stats.present} <span className="text-[11px] font-normal">({presentPercent}%)</span></p></div>
                          <div><div className="flex items-center gap-2 text-slate-400"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />Justificadas</div><p className="mt-1 text-lg font-black text-amber-400">{stats.justified} <span className="text-[11px] font-normal">({justifiedPercent}%)</span></p></div>
                          <div><div className="flex items-center gap-2 text-slate-400"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" />Ausentes</div><p className="mt-1 text-lg font-black text-rose-400">{stats.absent} <span className="text-[11px] font-normal">({absentPercent}%)</span></p></div>
                        </div>
                      </div>
                    </div>

                    <div className={`${cardBgClass} rounded-xl border p-5`}>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-4">
                        <h3 className="font-bold text-sm">Asistencia por catequizando</h3>
                        <span className="text-[11px] text-slate-400">Presente + justificada</span>
                      </div>
                      <div className="space-y-3">
                        {studentStats.length === 0 ? (
                          <p className="text-sm text-slate-400">No hay catequizandos seleccionados.</p>
                        ) : studentStats.map(({ student, present, justified, absent, total, rate }) => (
                          <div key={student.id} className="grid grid-cols-[minmax(110px,0.7fr)_1fr_auto] items-center gap-3 text-xs">
                            <span className="truncate font-semibold" title={student.name}>{student.name}</span>
                            <div className="h-3 rounded-full bg-slate-700/50 overflow-hidden flex">
                              <div className="bg-emerald-500" style={{ width: `${total ? (present / total) * 100 : 0}%` }} />
                              <div className="bg-amber-500" style={{ width: `${total ? (justified / total) * 100 : 0}%` }} />
                              <div className="bg-rose-500" style={{ width: `${total ? (absent / total) * 100 : 0}%` }} />
                            </div>
                            <span className="font-black text-sky-400">{rate}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {reportSubTab === 'certificados' && (() => {
            const generationStudents = visibleStudents.filter(student => student.groupId === selectedGroupId);
            const allCertificateRecords = [
              ...issuedCertificates.map(item => ({ 
                ...item, 
                certificateType: item.type || item.certificateType || 'asistencia', 
                label: (item.type || item.certificateType) === 'nivel' ? 'Nivel' : (item.type || item.certificateType) === 'carta' ? 'Carta' : 'Asistencia' 
              })),
              ...generatedCertificates.map(item => ({ ...item, certificateType: 'asistencia', label: 'Asistencia' })),
              ...levelCertificateHistory.map(item => ({ ...item, certificateType: 'nivel', label: 'Nivel' })),
              ...attendanceLetterHistory.map(item => ({ ...item, certificateType: 'carta', label: 'Carta' }))
            ].filter((item, index, self) => index === self.findIndex(t => t.id === item.id));
            const filteredCertificateRecords = allCertificateRecords.filter(item => {
              const matchesType = certificateSearchType === 'all' || item.certificateType === certificateSearchType;
              const searchText = certificateSearch.trim().toLowerCase();
              const fullText = `${item.id || ''} ${item.studentName || ''} ${item.groupName || ''} ${item.level || ''} ${item.year || ''} ${item.studentId || ''} ${item.qrPayload || ''}`.toLowerCase();
              const matchesSearch = !searchText || fullText.includes(searchText);
              const matchesGroup = certificateFilters.scope === 'all' || item.groupId === certificateFilters.scope;
              const matchesLevel = levelCertificateFilters.level === 'all' || item.level === levelCertificateFilters.level;
              const matchesYear = levelCertificateFilters.year === 'all' || item.year === levelCertificateFilters.year;
              return matchesType && matchesSearch && matchesGroup && matchesLevel && matchesYear;
            }).sort((first, second) => new Date(second.createdAt || 0) - new Date(first.createdAt || 0));
            const totalCertificatePages = Math.max(1, Math.ceil(filteredCertificateRecords.length / certificatePageSize));
            const visibleCertificateRecords = filteredCertificateRecords.slice((certificatePage - 1) * certificatePageSize, certificatePage * certificatePageSize);
            const canDeleteCertificates = userRole === 'admin' || userRole === 'coordinador' || userRole === 'coordinadorGeneral';

            return (
              <div className="space-y-4">
                <div className={`${cardBgClass} rounded-xl border shadow-sm overflow-hidden`}>
                  <button type="button" onClick={() => setCertificateGenerationOpen(prev => !prev)} className="w-full p-4 flex items-center justify-between text-left">
                    <div><h3 className="font-bold">Generar certificados</h3><p className="text-xs text-slate-400">Selecciona el tipo y genera uno o varios documentos.</p></div>
                    <span className="text-xs text-slate-400">{certificateGenerationOpen ? 'Ocultar' : 'Mostrar'}</span>
                  </button>
                  {certificateGenerationOpen && (
                    <div className="border-t border-slate-700 p-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <select value={certificateGenerationType} onChange={event => setCertificateGenerationType(event.target.value)} className={`rounded-lg px-3 py-2 text-sm ${inputBgClass}`}>
                          <option value="asistencia">Certificado de asistencia</option>
                          <option value="nivel">Certificado de nivel</option>
                          <option value="carta">Carta de asistencia</option>
                        </select>
                        <input type="date" value={certificateLetterDate} onChange={event => setCertificateLetterDate(event.target.value)} className={`rounded-lg px-3 py-2 text-sm ${inputBgClass}`} aria-label="Fecha de la carta" />
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setSelectedCertificateIds(generationStudents.map(student => student.id))} className="flex-1 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-400">Seleccionar todos</button>
                          <button type="button" onClick={() => setSelectedCertificateIds([])} className="flex-1 rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-400">Deseleccionar todos</button>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => handleExportSelectedCertificatesZip(selectedGroupId)} className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white">Exportar ZIP</button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {generationStudents.length === 0 ? <p className="text-sm text-slate-400">No hay catequizandos en este grupo.</p> : generationStudents.map(student => (
                          <div key={student.id} className={`${cardBgClass} rounded-xl border p-3 flex items-center justify-between gap-3`}>
                            <label className="flex items-center gap-2 min-w-0 cursor-pointer">
                              <input type="checkbox" checked={selectedCertificateIds.includes(student.id)} onChange={event => setSelectedCertificateIds(prev => event.target.checked ? [...new Set([...prev, student.id])] : prev.filter(id => id !== student.id))} className="rounded text-sky-600" />
                              <span className="truncate text-sm font-semibold">{student.name}</span>
                            </label>
                            <button type="button" onClick={() => handleGenerateSelectedCertificate(selectedGroupId, student.id)} className="shrink-0 rounded-lg bg-red-800 px-3 py-2 text-xs font-bold text-white">Generar</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className={`${cardBgClass} rounded-xl border shadow-sm overflow-hidden`}>
                  <button type="button" onClick={() => setCertificateSearchOpen(prev => !prev)} className="w-full p-4 flex items-center justify-between text-left">
                    <div><h3 className="font-bold">Buscar certificados creados</h3><p className="text-xs text-slate-400">Consulta por tipo, nombre o QR.</p></div>
                    <span className="text-xs text-slate-400">{certificateSearchOpen ? 'Ocultar' : 'Mostrar'}</span>
                  </button>
                  {certificateSearchOpen && (
                    <div className="border-t border-slate-700 p-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                        <input value={certificateSearch} onChange={event => { setCertificateSearch(event.target.value); setCertificatePage(1); }} placeholder="Buscar nombre, grupo o QR" className={`rounded-lg px-3 py-2 text-xs ${inputBgClass}`} />
                        <select value={certificateSearchType} onChange={event => { setCertificateSearchType(event.target.value); setCertificatePage(1); }} className={`rounded-lg px-3 py-2 text-xs ${inputBgClass}`}>
                          <option value="all">Todos los certificados</option><option value="asistencia">Asistencia</option><option value="nivel">Nivel</option><option value="carta">Carta</option>
                        </select>
                        <select value={levelCertificateFilters.level} onChange={event => { setLevelCertificateFilters(prev => ({ ...prev, level: event.target.value })); setCertificatePage(1); }} className={`rounded-lg px-3 py-2 text-xs ${inputBgClass}`}>
                          <option value="all">Todos los niveles</option>{levelOptions.map(option => <option key={option} value={option}>{option}</option>)}
                        </select>
                        <select value={levelCertificateFilters.year} onChange={event => { setLevelCertificateFilters(prev => ({ ...prev, year: event.target.value })); setCertificatePage(1); }} className={`rounded-lg px-3 py-2 text-xs ${inputBgClass}`}>
                          <option value="all">Todos los años</option>{Array.from(new Set(groups.map(group => group.year || '2026-2027'))).map(year => <option key={year} value={year}>{year}</option>)}
                        </select>
                        <select value={certificateFilters.scope} onChange={event => setCertificateFilters(prev => ({ ...prev, scope: event.target.value }))} className={`rounded-lg px-3 py-2 text-xs ${inputBgClass}`}>
                          <option value="all">Todos los grupos</option>{visibleGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
                        </select>
                        <button type="button" onClick={handleScanCertificateQr} className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white">Buscar por QR</button>
                      </div>
                      <div className="flex flex-wrap gap-2 items-center justify-between">
                        <span className="text-xs text-slate-400">{filteredCertificateRecords.length} registro(s)</span>
                        <div className="flex items-center gap-2 text-xs"><span>Registros por página</span><select value={certificatePageSize} onChange={event => { setCertificatePageSize(Number(event.target.value)); setCertificatePage(1); }} className={`rounded-lg px-2 py-1 ${inputBgClass}`}><option value="5">5</option><option value="10">10</option><option value="20">20</option><option value="50">50</option></select></div>
                      </div>
                      <div className="space-y-2">
                        {visibleCertificateRecords.length === 0 ? <p className="text-sm text-slate-400">No hay certificados con esos filtros.</p> : visibleCertificateRecords.map(record => (
                          <div key={record.id} className={`${cardBgClass} rounded-lg border p-3 flex items-center justify-between gap-3`}>
                            <div>
                              <p className="text-sm font-semibold">{record.studentName}</p>
                              <p className="text-[11px] text-slate-400">{record.label} · {record.groupName || 'Sin grupo'} {record.level ? `· ${record.level}` : ''}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  if (record.certificateType === 'nivel') {
                                    handleGenerateLevelCertificate(record.groupId, record.studentId);
                                  } else if (record.certificateType === 'carta') {
                                    handleGenerateAttendanceLetter(record.groupId, record.studentId, record.date || new Date().toISOString().split('T')[0], record.attendanceType || 'asistencia');
                                  } else {
                                    handleGenerateSelectedCertificate(record.groupId, record.studentId);
                                  }
                                }}
                                className="rounded-lg bg-sky-600/20 text-sky-400 hover:bg-sky-600/30 px-2 py-1 text-[10px] font-bold transition"
                                title="Volver a generar y descargar el documento PDF"
                              >
                                📄 PDF
                              </button>
                              {canDeleteCertificates && <button type="button" onClick={() => record.certificateType === 'nivel' ? handleDeleteLevelCertificate(record.id) : record.certificateType === 'carta' ? setAttendanceLetterHistory(prev => prev.filter(item => item.id !== record.id)) : handleDeleteCertificate(record.id)} className="rounded-lg bg-rose-500/10 px-2 py-1 text-[10px] font-bold text-rose-400">Eliminar</button>}
                            </div>
                          </div>
                        ))}
                      </div>
                      {totalCertificatePages > 1 && <div className="flex items-center justify-center gap-3"><button type="button" disabled={certificatePage <= 1} onClick={() => setCertificatePage(page => Math.max(1, page - 1))} className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold disabled:opacity-40">Anterior</button><span className="text-xs text-slate-400">Página {certificatePage} de {totalCertificatePages}</span><button type="button" disabled={certificatePage >= totalCertificatePages} onClick={() => setCertificatePage(page => Math.min(totalCertificatePages, page + 1))} className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold disabled:opacity-40">Siguiente</button></div>}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
