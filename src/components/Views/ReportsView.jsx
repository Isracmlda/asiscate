import { useEffect, useRef, useState } from 'react';
import { MaterialIcon } from '../Shared/MaterialIcon';
import { PaymentsView } from './PaymentsView';
import { getStudentContactEmail } from '../../services/firestoreDataMappers';

export function ReportsView({
  cardBgClass,
  selectedGroupId,
  setReportStudentIds,
  visibleStudents,
  visibleGroups,
  showGroupSettings = false,
  groupCycleFilter = '',
  onGroupCycleChange,
  onOpenCreateGroup,
  onOpenImportStudents,
  allUsers,
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
  setCertificateSearchType,
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
  handleDeleteCertificate,
  rosterMode,
  setRosterMode,
  isAddStudentFormOpen,
  setIsAddStudentFormOpen,
  newStudentName,
  setNewStudentName,
  newStudentParentEmail,
  setNewStudentParentEmail,
  newStudentParentPhone,
  setNewStudentParentPhone,
  setSelectedGroupForStudent,
  handleStartEditStudent,
  handleOpenStudentReadOnly,
  handleDeleteStudent,
  handleAddStudent,
  handleGenerateStudentQr,
  handleGenerateCatechistQr,
  handleExportGroupRosterToPdf,
  handleExportGroupRosterToExcel,
  buildWhatsAppLink,
  visiblePaymentRecords,
  paymentForm,
  setPaymentForm,
  handleAddPaymentRecord,
  handleViewPaymentQr,
  handleSharePaymentProof,
  handleGeneratePaymentProofPdf,
  handlePrintPaymentReceipt,
  handleDeletePaymentRecord,
  setShowGroupPaymentTracker,
  setTrackerGroupId,
  setPaymentFilters,
  setPaymentCurrentPage,
  setPaymentPageSize,
  students,
  handleScanPaymentQr,
  paymentFilters,
  filteredPaymentRecords,
  paginatedPaymentRecords,
  paymentPageSize,
  paymentCurrentPage,
  paymentTotalPages,
  onBackToGroups,
  canManageCatechistRoster = false,
  handleAddPreregisteredCatechist,
  handleImportPreregisteredCatechists,
  handleDeleteCatechist,
  handleMergeCatechists,
  handleEditCatechist
}) {
  const [isGroupSettingsOpen, setIsGroupSettingsOpen] = useState(false);
  const [isAddCatechistFormOpen, setIsAddCatechistFormOpen] = useState(false);
  const [newCatechistName, setNewCatechistName] = useState('');
  const [newCatechistEmail, setNewCatechistEmail] = useState('');
  const [isSavingCatechist, setIsSavingCatechist] = useState(false);
  const catechistSaveLock = useRef(false);
  const [catechistAction, setCatechistAction] = useState(null);
  const [isCatechistActionRunning, setIsCatechistActionRunning] = useState(false);
  const [editCatechistName, setEditCatechistName] = useState('');
  const [editCatechistEmail, setEditCatechistEmail] = useState('');
  const [catechistActionError, setCatechistActionError] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const canGenerateLevelCertificates = userRole !== 'catequista';
  const selectedGroup = visibleGroups.find(group => group.id === selectedGroupId);
  const selectedIsCatechistGroup = selectedGroup?.type === 'catequistas';
  const canManageSelectedCatechistRoster = canManageCatechistRoster && Boolean(selectedGroup?.diaconiaId);
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentCycle = currentDate.getMonth() <= 3
    ? `${currentYear - 1}-${currentYear}`
    : `${currentYear}-${currentYear + 1}`;
  const groupCycleOptions = Array.from(new Set([
    currentCycle,
    ...visibleGroups.map(group => String(group.year || currentCycle).trim()).filter(Boolean)
  ]));
  const catechistNames = selectedGroup
    ? (Array.isArray(selectedGroup.catechistIds) && selectedGroup.catechistIds.length > 0
      ? (allUsers || []).filter(user => selectedGroup.catechistIds.includes(user.id)).map(user => user.name)
      : (selectedGroup.catechistNames || []))
        .map(name => String(name || '').trim().split(/\s+/)[0])
        .filter(Boolean)
    : [];
  useEffect(() => {
    if (!canGenerateLevelCertificates && certificateGenerationType === 'nivel') setCertificateGenerationType('asistencia');
  }, [canGenerateLevelCertificates, certificateGenerationType, setCertificateGenerationType]);
  useEffect(() => {
    if (selectedIsCatechistGroup && !['asistencia', 'lista', 'estadisticas'].includes(reportSubTab)) {
      setReportSubTab('asistencia');
    }
  }, [reportSubTab, selectedIsCatechistGroup, setReportSubTab]);
  return (
    <div className="space-y-6">
      {selectedGroupId && (
        <div className={`${cardBgClass} p-3 rounded-xl border shadow-sm`}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {typeof onBackToGroups === 'function' && (
                <button type="button" onClick={onBackToGroups} className="inline-flex items-center gap-1 rounded-full border border-red-700/60 bg-red-900/20 px-3 py-2 text-xs font-bold text-red-300 transition-colors hover:border-red-500 hover:bg-red-900/40 hover:text-white">
                  <MaterialIcon name="arrow_back" /> Grupos
                </button>
              )}
              <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain rounded-full">
                <div className="inline-flex w-max flex-nowrap gap-1 whitespace-nowrap rounded-full bg-slate-900/70 p-1">
                {(selectedIsCatechistGroup
                  ? ['asistencia', 'lista', 'estadisticas']
                  : ['asistencia', 'lista', 'pagos', 'estadisticas', 'certificados']).map(tab => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setReportSubTab(tab)}
                    aria-pressed={reportSubTab === tab}
                    className={`shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-xs font-bold transition-all duration-200 ease-out ${
                      reportSubTab === tab
                        ? 'scale-[1.02] bg-red-800 text-white shadow-md shadow-red-950/30'
                        : 'text-slate-400 hover:bg-slate-700/70 hover:text-slate-100'
                    }`}
                  >
                    {tab === 'asistencia' ? 'Asistencia' : tab === 'lista' ? 'Lista' : tab === 'pagos' ? 'Pagos' : tab === 'estadisticas' ? 'Estadísticas' : 'Certificados'}
                  </button>
                ))}
                </div>
              </div>
              {showGroupSettings && (
                <button
                  type="button"
                  onClick={() => setIsGroupSettingsOpen(true)}
                  aria-label="Configuración del grupo"
                  aria-expanded={isGroupSettingsOpen}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-slate-200 transition hover:border-emerald-500 hover:bg-slate-700"
                >
                  <MaterialIcon name="settings" />
                </button>
              )}
            </div>
            <div className={`min-w-0 text-right ${selectedIsCatechistGroup ? 'flex flex-wrap items-baseline justify-end gap-x-2' : ''}`}>
              <p className={`text-sm font-bold ${selectedIsCatechistGroup ? '' : 'truncate'}`}>{selectedGroup?.name || 'Grupo'}</p>
              {selectedIsCatechistGroup ? (
                <p className="text-xs text-slate-400">Diaconía: {selectedGroup.diaconiaName || 'Diaconía'}</p>
              ) : (
                <p className="text-xs text-slate-400">
                  Catequistas: {catechistNames.length > 0 ? catechistNames.join(', ') : 'Sin asignar'}
                </p>
              )}
              {activeViewMode === 'admin' && !selectedIsCatechistGroup && (
                <button type="button" onClick={handleDeleteOrphanedAttendance} className="mt-1 text-[10px] font-semibold text-amber-400 hover:text-amber-300">
                  Borrar asistencias sin grupo
                </button>
              )}
            </div>
          </div>

          {showGroupSettings && isGroupSettingsOpen && (
            <div
              className="fixed inset-0 z-[80] bg-slate-950/50"
              onMouseDown={event => {
                if (event.target === event.currentTarget) setIsGroupSettingsOpen(false);
              }}
            >
              <aside
                role="dialog"
                aria-modal="true"
                aria-label="Configuración del grupo"
                className="group-settings-panel absolute inset-y-0 right-0 flex w-full max-w-sm flex-col border-l border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-2xl"
              >
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-lg font-bold">
                    <MaterialIcon name="settings" /> Configuración
                  </h2>
                  <button
                    type="button"
                    onClick={() => setIsGroupSettingsOpen(false)}
                    aria-label="Cerrar configuración"
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                  >
                    <MaterialIcon name="close" />
                  </button>
                </div>
                <div className="space-y-4">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-semibold text-slate-300">Ciclo catequético</span>
                    <select
                      value={groupCycleFilter || String(selectedGroup?.year || currentCycle)}
                      onChange={event => {
                        onGroupCycleChange?.(event.target.value);
                        setIsGroupSettingsOpen(false);
                      }}
                      className={`w-full rounded-lg px-3 py-2.5 text-sm ${inputBgClass}`}
                    >
                      {groupCycleOptions.map(cycle => <option key={cycle} value={cycle}>{cycle}</option>)}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsGroupSettingsOpen(false);
                      onOpenCreateGroup?.();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg bg-red-800 px-3 py-2.5 text-left text-sm font-semibold text-white transition hover:bg-red-900"
                  >
                    <MaterialIcon name="add" /> Crear nuevo grupo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsGroupSettingsOpen(false);
                      onOpenImportStudents?.();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-left text-sm font-semibold text-white transition hover:bg-emerald-700"
                  >
                    <MaterialIcon name="group_add" /> Añadir / importar catequizando
                  </button>
                </div>
              </aside>
            </div>
          )}

          <div key={reportSubTab} className="report-tab-content">
          {reportSubTab === 'asistencia' && (
            <div className="space-y-4">
              <div className="flex flex-col lg:flex-row gap-3 justify-between items-start lg:items-center">
                <div className="grid w-full grid-cols-2 gap-2 lg:max-w-2xl sm:grid-cols-4">
                  <input
                    type="text"
                    value={reportFilters.search}
                    onChange={(event) => setReportFilters(prev => ({ ...prev, search: event.target.value }))}
                    placeholder={selectedIsCatechistGroup ? 'Buscar catequista' : 'Buscar catequizando'}
                    className={`col-span-2 rounded-lg px-3 py-2 text-xs sm:col-span-1 ${inputBgClass}`}
                  />
                  <label className="min-w-0 text-[10px] font-semibold text-slate-400">
                    Desde
                    <input
                      type="date"
                      value={reportFilters.dateFrom}
                      onChange={(event) => setReportFilters(prev => ({ ...prev, dateFrom: event.target.value }))}
                      className={`attendance-date-filter mt-1 w-full min-w-0 rounded-lg px-2 py-2 text-xs ${inputBgClass}`}
                    />
                  </label>
                  <label className="min-w-0 text-[10px] font-semibold text-slate-400">
                    Hasta
                    <input
                      type="date"
                      value={reportFilters.dateTo}
                      onChange={(event) => setReportFilters(prev => ({ ...prev, dateTo: event.target.value }))}
                      className={`attendance-date-filter mt-1 w-full min-w-0 rounded-lg px-2 py-2 text-xs ${inputBgClass}`}
                    />
                  </label>
                  <select
                    value={reportAttendanceType}
                    onChange={(event) => setReportAttendanceType(event.target.value)}
                    className={`col-span-2 min-w-0 rounded-lg px-3 py-2 text-xs sm:col-span-1 ${inputBgClass}`}
                  >
                    <option value="all">{selectedIsCatechistGroup ? 'Todos los tipos' : 'Misa + Encuentros'}</option>
                    <option value="encuentro">Encuentros</option>
                    <option value="misa">Misa</option>
                    {selectedIsCatechistGroup && <option value="formacion">Formación</option>}
                  </select>
                  <p className="col-span-full text-[10px] text-slate-500">
                    Las fechas filtran las asistencias dentro del rango seleccionado.
                  </p>
                </div>
                <div className="flex w-full flex-row justify-end gap-2 lg:w-auto">
                  <button onClick={() => handleExportAttendanceToExcel(selectedGroupId)} className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700 sm:flex-none sm:text-sm"><MaterialIcon name="download" /> Excel</button>
                  <button onClick={() => handleExportAttendanceToPdf(selectedGroupId)} className="flex-1 rounded-lg bg-red-800 px-4 py-2.5 text-xs font-bold text-white hover:bg-red-900 sm:flex-none sm:text-sm"><MaterialIcon name="picture_as_pdf" /> PDF</button>
                </div>
              </div>

              {(() => {
                const { groupStudents, sortedDates } = getAttendanceReportView(selectedGroupId);

                if (groupStudents.length === 0) {
                  return <div className={`${cardBgClass} p-6 rounded-xl border text-center text-slate-400 text-sm`}>{selectedIsCatechistGroup ? 'No hay catequistas registrados en este grupo.' : 'No hay catequizandos registrados en este grupo.'}</div>;
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
                    <div className="relative overflow-x-auto overscroll-x-contain">
                      <table className="w-full min-w-max table-fixed divide-y divide-slate-700 text-xs sm:text-sm">
                        <thead className={themeMode === 'dark' ? 'bg-slate-900/80' : 'bg-slate-100'}>
                          <tr>
                            <th className={`sticky left-0 z-20 w-[220px] min-w-[220px] max-w-[220px] border-r border-slate-700 px-4 py-3 text-left font-bold uppercase shadow-md ${themeMode === 'dark' ? 'bg-slate-900' : 'bg-slate-100'} text-slate-400`}>{selectedIsCatechistGroup ? 'Catequista' : 'Catequizando'}</th>
                            {sortedDates.map(d => {
                              const displayType = reportAttendanceType === 'all' ? getAttendanceDisplayTypeForDate(groupStudents, d) : reportAttendanceType;
                              const label = getAttendanceLabel(groupStudents, d, reportAttendanceType === 'all' ? 'all' : reportAttendanceType);
                              const isEditingDate = attendanceDateEditor && attendanceDateEditor.groupId === selectedGroupId && attendanceDateEditor.oldDate === d;
                              return (
                                <th key={d} className="px-3 py-3 text-center font-bold text-slate-300 min-w-[140px] border-l border-slate-700">
                                  <div className="flex flex-col items-center gap-1">
                                    <div className="text-[10px] uppercase tracking-wide text-amber-400 font-semibold">
                                      {displayType === 'formacion' ? 'Formación' : displayType === 'misa' ? 'Misa' : 'Encuentro'}
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
                                    {!selectedGroupId && (
                                      <div className={`${cardBgClass} rounded-xl border p-6 text-center`}>
                                        <p className="text-sm text-slate-400">Selecciona un grupo para consultar sus reportes.</p>
                                        {typeof onBackToGroups === 'function' && (
                                          <button type="button" onClick={onBackToGroups} className="mt-3 rounded-lg bg-red-800 px-4 py-2 text-xs font-bold text-white hover:bg-red-900">
                                            <MaterialIcon name="groups" /> Ir a grupos
                                          </button>
                                        )}
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
                              <td className={`sticky left-0 z-10 w-[220px] min-w-[220px] max-w-[220px] border-r border-slate-700 px-4 py-3 font-semibold shadow-md ${themeMode === 'dark' ? 'bg-black' : 'bg-white'}`}>
                                <label className="flex min-w-0 items-center gap-2 cursor-pointer">
                                  <input
                                    className="shrink-0 rounded text-red-800 focus:ring-red-800"
                                    type="checkbox"
                                    checked={reportStudentIds === null || reportStudentIds.includes(student.id)}
                                    onChange={(event) => {
                                      const currentIds = reportStudentIds === null ? groupStudents.map(item => item.id) : reportStudentIds;
                                      setReportStudentIds(event.target.checked
                                        ? [...new Set([...currentIds, student.id])]
                                        : currentIds.filter(id => id !== student.id));
                                    }}
                                  />
                                  <span className="min-w-0 break-words">{student.name || student.fullName || 'Sin nombre'}</span>
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
                  return <div className={`${cardBgClass} p-6 rounded-xl border text-center text-slate-400 text-sm`}>{selectedIsCatechistGroup ? 'No hay catequistas en este grupo.' : 'No hay catequizandos en este grupo.'}</div>;
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
                        <p className="mt-3 text-xs text-slate-400">{stats.total} {selectedIsCatechistGroup ? 'catequista(s)' : 'catequizando(s)'} · {totalRecords} registros</p>
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
                        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-700/60 pt-3">
                          <label htmlFor="statistics-attendance-type" className="text-xs font-semibold text-slate-400">
                            Tipo de asistencia
                          </label>
                          <select
                            id="statistics-attendance-type"
                            value={reportAttendanceType}
                            onChange={event => setReportAttendanceType(event.target.value)}
                            className={`rounded-lg px-3 py-2 text-xs ${inputBgClass}`}
                          >
                            <option value="all">{selectedIsCatechistGroup ? 'Todos los tipos' : 'Misa + Encuentros'}</option>
                            <option value="encuentro">Encuentros</option>
                            <option value="misa">Misa</option>
                            {selectedIsCatechistGroup && <option value="formacion">Formación</option>}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className={`${cardBgClass} rounded-xl border p-5`}>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-4">
                        <h3 className="font-bold text-sm">Asistencia por {selectedIsCatechistGroup ? 'catequista' : 'catequizando'}</h3>
                        <span className="text-[11px] text-slate-400">Presente + justificada</span>
                      </div>
                      <div className="space-y-3">
                        {studentStats.length === 0 ? (
                          <p className="text-sm text-slate-400">{selectedIsCatechistGroup ? 'No hay catequistas seleccionados.' : 'No hay catequizandos seleccionados.'}</p>
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

          {reportSubTab === 'lista' && selectedIsCatechistGroup && (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold">Lista de catequistas</h3>
              </div>
              {canManageSelectedCatechistRoster && (
                <div className={`${cardBgClass} rounded-xl border p-4`}>
                  <button
                    type="button"
                    onClick={() => setIsAddCatechistFormOpen(open => !open)}
                    aria-expanded={isAddCatechistFormOpen}
                    className="flex w-full items-center justify-between gap-2 text-left text-sm font-bold"
                  >
                    <span>Agregar o importar catequistas</span>
                    <MaterialIcon name="expand_more" className={`transition-transform duration-200 ${isAddCatechistFormOpen ? 'rotate-180' : ''}`} />
                  </button>
                  <div className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${isAddCatechistFormOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`} aria-hidden={!isAddCatechistFormOpen}>
                    <div inert={!isAddCatechistFormOpen} className={`min-h-0 overflow-hidden transition-opacity duration-150 motion-reduce:transition-none ${isAddCatechistFormOpen ? 'opacity-100' : 'opacity-0'}`}>
                      <div className="mt-3 space-y-4">
                        <form
                          className="space-y-2"
                          onSubmit={async event => {
                            event.preventDefault();
                            if (catechistSaveLock.current) return;
                            catechistSaveLock.current = true;
                            setIsSavingCatechist(true);
                            try {
                              const saved = await handleAddPreregisteredCatechist?.(newCatechistName, newCatechistEmail, selectedGroup.id);
                              if (saved) {
                                setNewCatechistName('');
                                setNewCatechistEmail('');
                              }
                            } finally { catechistSaveLock.current = false; setIsSavingCatechist(false); }
                          }}
                        >
                          <input required value={newCatechistName} onChange={event => setNewCatechistName(event.target.value)} placeholder="Nombre completo" className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
                          <input type="email" value={newCatechistEmail} onChange={event => setNewCatechistEmail(event.target.value)} placeholder="Correo electrónico (opcional)" className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
                          <button type="submit" disabled={isSavingCatechist} className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-60">{isSavingCatechist ? 'Guardando…' : 'Guardar catequista'}</button>
                        </form>
                        <div className="space-y-2 border-t border-slate-700 pt-3">
                          <h4 className="text-sm font-bold">Importar catequistas</h4>
                          <p className="text-xs text-slate-400">Sube un archivo Excel o CSV con encabezado «Nombre» y, opcionalmente, «Correo». Los correos se preautorizan.</p>
                          <input
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            aria-label="Importar catequistas desde Excel o CSV"
                            onChange={event => {
                              const [file] = event.target.files || [];
                              if (file) handleImportPreregisteredCatechists?.(file, selectedGroup.id);
                              event.target.value = '';
                            }}
                            className={`w-full rounded-lg px-3 py-2 text-xs ${inputBgClass}`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {visibleStudents.filter(student => student.groupId === selectedGroupId).length === 0 ? (
                <div className={`${cardBgClass} rounded-xl border p-6 text-center text-sm text-slate-400`}>No hay catequistas registrados en esta diaconía.</div>
              ) : (
                <div className="space-y-3">
                  {visibleStudents.filter(student => student.groupId === selectedGroupId).map(catechist => (
                    <div key={catechist.id} className={`${cardBgClass} rounded-xl border p-3`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold">{catechist.name}</p>
                          {(catechist.contactEmail || catechist.email) && <a className="text-xs text-sky-400 hover:underline" href={`mailto:${catechist.contactEmail || catechist.email}`}>{catechist.contactEmail || catechist.email}</a>}
                          {catechist.phone && <p className="text-xs text-slate-400">{catechist.phone}</p>}
                          {catechist.memberType === 'pendingCatechist' && <span className="mt-1 inline-block rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">Pendiente de registro</span>}
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          {canManageSelectedCatechistRoster && catechist.memberType === 'pendingCatechist' && <button type="button" onClick={() => { setEditCatechistName(catechist.name || ''); setEditCatechistEmail(catechist.email || ''); setCatechistActionError(''); setCatechistAction({ type: 'edit', member: catechist, group: selectedGroup }); }} aria-label={`Editar a ${catechist.name}`} title="Editar" className="rounded-lg bg-slate-600 p-2 text-white hover:bg-slate-500"><MaterialIcon name="edit" /></button>}
                          {canManageSelectedCatechistRoster && catechist.memberType === 'pendingCatechist' && visibleStudents.some(item => item.groupId === selectedGroupId && item.id !== catechist.id && item.name?.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase() === catechist.name?.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()) && (
                            <button type="button" onClick={() => { setMergeTargetId(''); setCatechistActionError(''); setCatechistAction({ type: 'merge', member: catechist, group: selectedGroup }); }} aria-label={`Fusionar a ${catechist.name}`} title="Fusionar duplicado" className="rounded-lg bg-sky-700 p-2 text-white hover:bg-sky-600"><MaterialIcon name="merge" /></button>
                          )}
                          {canManageSelectedCatechistRoster && catechist.memberType === 'pendingCatechist' && <button type="button" onClick={() => { setCatechistActionError(''); setCatechistAction({ type: 'delete', member: catechist, group: selectedGroup }); }} aria-label={`Eliminar a ${catechist.name}`} title="Eliminar" className="rounded-lg bg-rose-700 p-2 text-white hover:bg-rose-600"><MaterialIcon name="delete" /></button>}
                          <button type="button" onClick={() => handleGenerateCatechistQr?.(catechist, selectedGroup)} title={`Mostrar carnet QR de ${catechist.name}`} aria-label={`Mostrar carnet QR de ${catechist.name}`} className="rounded-lg bg-amber-500 p-2 text-white hover:bg-amber-600"><MaterialIcon name="qr_code_2" /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {catechistAction && (
            <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onMouseDown={event => event.target === event.currentTarget && !isCatechistActionRunning && setCatechistAction(null)}>
              <div role="dialog" aria-modal="true" aria-labelledby="catechist-action-title" className={`${cardBgClass} w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl`}>
                <div className={`flex items-start gap-4 border-b p-5 ${catechistAction.type === 'delete' ? 'border-rose-500/20' : 'border-sky-500/20'}`}>
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${catechistAction.type === 'delete' ? 'bg-rose-500/10 text-rose-400' : 'bg-sky-500/10 text-sky-400'}`}>
                    <MaterialIcon name={catechistAction.type === 'delete' ? 'person_remove' : catechistAction.type === 'edit' ? 'edit' : 'merge'} className="text-2xl" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 id="catechist-action-title" className="text-lg font-bold">{catechistAction.type === 'delete' ? 'Eliminar catequista' : catechistAction.type === 'edit' ? 'Editar catequista' : 'Fusionar catequista'}</h3>
                    <p className="mt-1 text-sm text-slate-400">{catechistAction.member.name}</p>
                  </div>
                  <button type="button" disabled={isCatechistActionRunning} onClick={() => setCatechistAction(null)} aria-label="Cerrar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-500/10 hover:text-slate-200 disabled:opacity-50"><MaterialIcon name="close" /></button>
                </div>
                <div className="space-y-3 p-5 text-sm leading-6 text-slate-400">
                  {catechistAction.type === 'edit' ? (
                    <div className="space-y-3">
                      <p>Actualiza el nombre y el correo de contacto.</p>
                      <label className="block text-xs font-semibold text-slate-300">Nombre<input autoFocus value={editCatechistName} onChange={event => setEditCatechistName(event.target.value)} className={`mt-1 w-full rounded-xl px-3 py-2.5 text-sm ${inputBgClass}`} /></label>
                      <label className="block text-xs font-semibold text-slate-300">Correo electrónico<input type="email" value={editCatechistEmail} onChange={event => setEditCatechistEmail(event.target.value)} placeholder="correo@ejemplo.com" className={`mt-1 w-full rounded-xl px-3 py-2.5 text-sm ${inputBgClass}`} /></label>
                      {catechistAction.member.memberType === 'catechistUser' && <p className="text-xs">En una cuenta registrada, el correo se guarda como contacto y no cambia el correo usado para iniciar sesión.</p>}
                      {catechistActionError && <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{catechistActionError}</p>}
                    </div>
                  ) : catechistAction.type === 'merge' ? (
                    <div className="space-y-3">
                      <p>Selecciona cuál registro conservar. El historial de asistencia se combinará y luego se quitará este duplicado.</p>
                      <label className="block text-xs font-semibold text-slate-300">Conservar este registro
                        <select value={mergeTargetId} onChange={event => setMergeTargetId(event.target.value)} className={`mt-1 w-full rounded-xl px-3 py-2.5 text-sm ${inputBgClass}`}>
                          <option value="">Selecciona catequista</option>
                          {visibleStudents.filter(item => item.groupId === selectedGroupId && item.id !== catechistAction.member.id && item.name?.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase() === catechistAction.member.name?.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()).map(item => <option key={item.id} value={item.id}>{item.name}{item.email ? ` · ${item.email}` : ''}{item.memberType === 'pendingCatechist' ? ' · Pendiente' : ' · Registrado'}</option>)}
                        </select>
                      </label>
                      {catechistActionError && <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{catechistActionError}</p>}
                    </div>
                  ) : catechistAction.type === 'delete'
                    ? <p>¿Deseas quitar a <strong className="text-slate-100">{catechistAction.member.name}</strong> de la lista de catequistas? Esta acción no se puede deshacer desde aquí.</p>
                    : <p>Se conservará la cuenta registrada de <strong className="text-slate-100">{catechistAction.member.name}</strong> y se quitará su entrada pendiente duplicada.</p>}
                </div>
                <div className="flex justify-end gap-3 border-t border-slate-500/15 p-5">
                  <button type="button" disabled={isCatechistActionRunning} onClick={() => setCatechistAction(null)} className="rounded-xl border border-slate-500/30 px-4 py-2.5 text-sm font-semibold hover:bg-slate-500/10 disabled:opacity-50">Cancelar</button>
                  <button type="button" disabled={isCatechistActionRunning} onClick={async () => {
                    setIsCatechistActionRunning(true);
                    try {
                      try {
                        if (catechistAction.type === 'edit') await handleEditCatechist?.(catechistAction.member, catechistAction.group, editCatechistName, editCatechistEmail);
                        else {
                          if (catechistAction.type === 'delete') await handleDeleteCatechist?.(catechistAction.member, catechistAction.group);
                          else {
                            const targetMember = visibleStudents.find(item => item.id === mergeTargetId);
                            if (!targetMember) throw new Error('Selecciona el registro que deseas conservar.');
                            await handleMergeCatechists?.(catechistAction.member, catechistAction.group, targetMember);
                          }
                        }
                        setCatechistAction(null);
                      } catch (error) { setCatechistActionError(error.message || 'No se pudo guardar el cambio.'); }
                    } finally { setIsCatechistActionRunning(false); }
                  }} className={`rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60 ${catechistAction.type === 'delete' ? 'bg-rose-700 hover:bg-rose-600' : 'bg-sky-700 hover:bg-sky-600'}`}>
                    {isCatechistActionRunning ? 'Procesando…' : catechistAction.type === 'delete' ? 'Sí, eliminar' : catechistAction.type === 'edit' ? 'Guardar cambios' : 'Fusionar registros'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {reportSubTab === 'lista' && !selectedIsCatechistGroup && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold">Lista de catequizandos</h3>
                  <p className="text-xs text-slate-400">Contactos, gestión y exportación del padrón del grupo.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => handleExportGroupRosterToPdf?.(selectedGroupId)} className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white hover:bg-rose-800"><MaterialIcon name="picture_as_pdf" /> Descargar PDF</button>
                  <button type="button" onClick={() => handleExportGroupRosterToExcel?.(selectedGroupId)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800"><MaterialIcon name="table_view" /> Descargar Excel</button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setRosterMode('view')} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${rosterMode === 'view' ? 'bg-red-800 text-white' : 'bg-slate-700 text-slate-300'}`}>Ver datos de contacto</button>
                <button type="button" onClick={() => setRosterMode('edit')} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${rosterMode === 'edit' ? 'bg-red-800 text-white' : 'bg-slate-700 text-slate-300'}`}>Gestión de lista</button>
              </div>

              {(() => {
                const groupStudents = visibleStudents.filter(student => student.groupId === selectedGroupId);
                if (groupStudents.length === 0) {
                  return <div className={`${cardBgClass} rounded-xl border p-6 text-center text-sm text-slate-400`}>No hay catequizandos registrados en este grupo.</div>;
                }
                return (
                  <div className="space-y-3">
                    {groupStudents.map(student => {
                      const displayName = student.fullName || student.name || 'Sin nombre';
                      const displayEmail = getStudentContactEmail(student);
                      const displayPhone = student.parentPhone || student.phone || student.family?.guardian?.phone1 || student.family?.mother?.phone1 || student.family?.father?.phone1 || '';
                      return (
                        <div key={student.id} className={`${cardBgClass} rounded-xl border p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
                          <div className="min-w-0">
                            {rosterMode === 'view' ? (
                              <>
                                <p className={`font-bold text-sm ${themeMode === 'dark' ? 'text-white' : 'text-slate-900'}`}>{displayName}</p>
                                <div className="mt-1 flex flex-wrap gap-3 text-xs">
                                  {displayEmail ? <span className="flex items-center gap-1"><a className="text-sky-400 hover:underline" href={`mailto:${displayEmail}`}>{displayEmail}</a><button type="button" title="Copiar correo" onClick={() => navigator.clipboard.writeText(displayEmail)}><MaterialIcon name="content_copy" /></button></span> : <span className="text-slate-500 italic">Sin correo</span>}
                                  {displayPhone ? <span className="flex items-center gap-1"><a className="text-emerald-400 hover:underline" href={buildWhatsAppLink ? buildWhatsAppLink(displayPhone) : `https://wa.me/${displayPhone}`} target="_blank" rel="noreferrer">{displayPhone}</a><button type="button" title="Copiar teléfono" onClick={() => navigator.clipboard.writeText(displayPhone)}><MaterialIcon name="content_copy" /></button></span> : <span className="text-slate-500 italic">Sin teléfono</span>}
                                </div>
                              </>
                            ) : (
                              <button type="button" onClick={() => handleOpenStudentReadOnly?.(student)} className="truncate text-left text-sm font-semibold hover:text-sky-400 hover:underline">{displayName}</button>
                            )}
                          </div>
                          {rosterMode === 'view' ? (
                            <button
                              type="button"
                              onClick={() => handleGenerateStudentQr?.(String(student.id), student)}
                              title={`Mostrar carnet QR de ${displayName}`}
                              aria-label={`Mostrar carnet QR de ${displayName}`}
                              className="shrink-0 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white hover:bg-amber-600"
                            >
                              <MaterialIcon name="qr_code_2" /> Carnet QR
                            </button>
                          ) : (
                            <div className="flex shrink-0 gap-2">
                              <button type="button" onClick={() => handleStartEditStudent?.(student)} className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-600">Editar</button>
                              <button type="button" onClick={() => handleDeleteStudent?.(student.id)} className="rounded-lg bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-400">Eliminar</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {rosterMode === 'edit' && (
                <div className="space-y-3">
                  <button type="button" onClick={() => { setSelectedGroupForStudent(selectedGroupId); setNewStudentName(''); setNewStudentParentEmail(''); setNewStudentParentPhone(''); setIsAddStudentFormOpen(previous => !previous); }} className="rounded-lg bg-red-800 px-4 py-2 text-xs font-bold text-white hover:bg-red-900">
                    <MaterialIcon name="person_add" /> Añadir catequizando
                  </button>
                  {isAddStudentFormOpen && (
                    <form onSubmit={handleAddStudent} className={`${cardBgClass} space-y-3 rounded-xl border p-4`}>
                      <input required value={newStudentName} onChange={event => setNewStudentName(event.target.value)} placeholder="Nombre completo" className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
                      <input type="email" value={newStudentParentEmail} onChange={event => setNewStudentParentEmail(event.target.value)} placeholder="Correo del encargado (opcional)" className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
                      <input value={newStudentParentPhone} onChange={event => setNewStudentParentPhone(event.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="Número telefónico del encargado (opcional)" inputMode="numeric" maxLength="8" className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
                      <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white">Guardar catequizando</button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {reportSubTab === 'pagos' && !selectedIsCatechistGroup && (
            <PaymentsView
              cardBgClass={cardBgClass}
              showGroupPaymentTracker
              setShowGroupPaymentTracker={setShowGroupPaymentTracker}
              visiblePaymentRecords={visiblePaymentRecords}
              trackerGroupId={selectedGroupId}
              setTrackerGroupId={setTrackerGroupId}
              fixedGroupId={selectedGroupId}
              inputBgClass={inputBgClass}
              visibleGroups={visibleGroups}
              visibleStudents={visibleStudents}
              setPaymentFilters={setPaymentFilters}
              setPaymentCurrentPage={setPaymentCurrentPage}
              setPaymentPageSize={setPaymentPageSize}
              setPaymentForm={setPaymentForm}
              handleAddPaymentRecord={handleAddPaymentRecord}
              paymentForm={paymentForm}
              students={students}
              handleScanPaymentQr={handleScanPaymentQr}
              paymentFilters={paymentFilters}
              filteredPaymentRecords={filteredPaymentRecords}
              paginatedPaymentRecords={paginatedPaymentRecords}
              handleViewPaymentQr={handleViewPaymentQr}
              handleSharePaymentProof={handleSharePaymentProof}
              handleGeneratePaymentProofPdf={handleGeneratePaymentProofPdf}
              handlePrintPaymentReceipt={handlePrintPaymentReceipt}
              handleDeletePaymentRecord={handleDeletePaymentRecord}
              paymentPageSize={paymentPageSize}
              paymentCurrentPage={paymentCurrentPage}
              paymentTotalPages={paymentTotalPages}
            />
          )}

          {reportSubTab === 'certificados' && !selectedIsCatechistGroup && (() => {
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 items-stretch">
                        <select value={certificateGenerationType} onChange={event => setCertificateGenerationType(event.target.value)} className={`rounded-lg px-3 py-2 text-sm ${inputBgClass}`}>
                          <option value="asistencia">Certificado de asistencia</option>
                          {canGenerateLevelCertificates && <option value="nivel">Certificado de nivel</option>}
                          <option value="carta">Carta de asistencia</option>
                        </select>
                        <input type="date" value={certificateLetterDate} onChange={event => setCertificateLetterDate(event.target.value)} className={`rounded-lg px-3 py-2 text-sm ${inputBgClass}`} aria-label="Fecha de la carta" />
                        <button type="button" onClick={() => setSelectedCertificateIds(generationStudents.map(student => student.id))} className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-400">Seleccionar todos</button>
                        <button type="button" onClick={() => setSelectedCertificateIds([])} className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-700 dark:text-rose-400">Deseleccionar todos</button>
                        <button type="button" onClick={() => handleExportSelectedCertificatesZip(selectedGroupId)} className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white">Exportar ZIP</button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {generationStudents.length === 0 ? <p className="text-sm text-slate-400 md:col-span-2">No hay catequizandos en este grupo.</p> : generationStudents.map((student, index) => (
                          <div key={student.id} className={`${cardBgClass} rounded-xl border p-3 flex items-center justify-between gap-3 ${generationStudents.length % 2 === 1 && index === generationStudents.length - 1 ? 'md:col-start-1 md:col-end-3 md:mx-[25%]' : ''}`}>
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
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
                                  if (record.certificateType === 'nivel' && !canGenerateLevelCertificates) return;
                                  if (record.certificateType === 'nivel' && canGenerateLevelCertificates) {
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
                                <MaterialIcon name="picture_as_pdf" /> PDF
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
        </div>
      )}
    </div>
  );
}
