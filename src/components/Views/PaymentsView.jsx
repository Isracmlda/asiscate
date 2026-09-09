import React from 'react';

export function PaymentsView({
  cardBgClass,
  showGroupPaymentTracker,
  setShowGroupPaymentTracker,
  totalCollected,
  visiblePaymentRecords,
  trackerGroupId,
  setTrackerGroupId,
  inputBgClass,
  visibleGroups,
  visibleStudents,
  setPaymentFilters,
  setPaymentCurrentPage,
  setPaymentForm,
  handleAddPaymentRecord,
  paymentForm,
  students,
  handleScanPaymentQr,
  paymentFilters,
  filteredPaymentRecords,
  paginatedPaymentRecords,
  handleViewPaymentQr,
  handleGeneratePaymentProofPdf,
  handlePrintPaymentReceipt,
  handleDeletePaymentRecord,
  paymentPageSize,
  paymentCurrentPage,
  paymentTotalPages
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">Pagos</h2>
          <p className="text-xs sm:text-sm text-slate-400">Seguimiento de pagos y comprobantes.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowGroupPaymentTracker(prev => !prev)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs sm:text-sm font-semibold transition shadow-sm"
        >
          <span>📊</span>
          <span>{showGroupPaymentTracker ? 'Ocultar gráfico por grupo' : 'Ver gráfico por grupo'}</span>
          <span className="text-xs">{showGroupPaymentTracker ? '▲' : '▼'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-sky-600/10 border border-sky-500/30 rounded-xl p-4">
          <p className="text-xs uppercase font-bold text-sky-400">Pagos cobrados</p>
          <p className="text-2xl font-black text-sky-500">₡{totalCollected.toLocaleString()}</p>
        </div>
        <div className="bg-emerald-600/10 border border-emerald-500/30 rounded-xl p-4">
          <p className="text-xs uppercase font-bold text-emerald-400">Registro total</p>
          <p className="text-2xl font-black text-emerald-500">{visiblePaymentRecords.length}</p>
        </div>
      </div>

      {showGroupPaymentTracker && (
        <div className={`${cardBgClass} p-4 sm:p-6 rounded-xl border border-indigo-500/30 shadow-md space-y-4`}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-700">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>📊</span> Seguimiento Gráfico de Pagos por Catequizando
              </h3>
              <p className="text-xs text-slate-400">
                Selecciona un grupo para consultar el estado y avance de aportes de sus catequizandos.
              </p>
            </div>
            <div className="w-full sm:w-72">
              <select
                value={trackerGroupId}
                onChange={(e) => setTrackerGroupId(e.target.value)}
                className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass} font-medium border border-indigo-500/40`}
              >
                <option value="">-- Selecciona un grupo --</option>
                {visibleGroups.map(group => (
                  <option key={group.id} value={group.id}>{group.name} ({group.year || '2026-2027'})</option>
                ))}
              </select>
            </div>
          </div>

          {!trackerGroupId ? (
            <div className="py-8 text-center text-slate-400 text-sm">
              <p className="text-3xl mb-2">📋</p>
              Elige un grupo en el menú desplegable superior para visualizar sus pagos y catequizandos.
            </div>
          ) : (() => {
            const selectedGroup = visibleGroups.find(g => g.id === trackerGroupId);
            const groupStudents = visibleStudents.filter(s => s.groupId === trackerGroupId);
            const groupPayments = visiblePaymentRecords.filter(p => p.groupId === trackerGroupId);
            const groupTotal = groupPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
            const studentsWithPayments = groupStudents.filter(s => {
              return groupPayments.some(p => p.studentId === s.id || (p.studentName && p.studentName.toLowerCase().trim() === s.name.toLowerCase().trim()));
            });
            const percentPaid = groupStudents.length > 0 ? Math.round((studentsWithPayments.length / groupStudents.length) * 100) : 0;
            const efectivoTotal = groupPayments.filter(p => (p.paymentMethod || 'Efectivo').toLowerCase() === 'efectivo').reduce((sum, p) => sum + Number(p.amount || 0), 0);
            const sinpeTotal = groupPayments.filter(p => (p.paymentMethod || '').toLowerCase() === 'sinpe').reduce((sum, p) => sum + Number(p.amount || 0), 0);

            const studentTotals = groupStudents.map(s => {
              const sPayments = groupPayments.filter(p => p.studentId === s.id || (p.studentName && p.studentName.toLowerCase().trim() === s.name.toLowerCase().trim()));
              const total = sPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
              return { student: s, payments: sPayments, total };
            });
            const maxStudentPaid = Math.max(1, ...studentTotals.map(st => st.total));
            const unassignedPayments = groupPayments.filter(p => !p.studentId && !groupStudents.some(s => s.name.toLowerCase().trim() === p.studentName?.toLowerCase().trim()));

            return (
              <div className="space-y-5">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Recaudación Grupo</span>
                    <p className="text-xl sm:text-2xl font-black text-emerald-400 mt-1">₡{groupTotal.toLocaleString()}</p>
                  </div>
                  <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Con Pagos Registrados</span>
                    <p className="text-xl sm:text-2xl font-black text-indigo-400 mt-1">
                      {studentsWithPayments.length} <span className="text-xs font-normal text-slate-400">de {groupStudents.length} ({percentPaid}%)</span>
                    </p>
                  </div>
                  <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Comprobantes</span>
                    <p className="text-xl sm:text-2xl font-black text-sky-400 mt-1">{groupPayments.length}</p>
                  </div>
                  <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Métodos</span>
                    <div className="text-xs mt-1 text-slate-300 space-y-0.5">
                      <div><span className="font-semibold text-white">Efectivo:</span> ₡{efectivoTotal.toLocaleString()}</div>
                      <div><span className="font-semibold text-white">Sinpe:</span> ₡{sinpeTotal.toLocaleString()}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center text-xs text-slate-400 mb-1.5 font-medium">
                    <span>Progreso de catequizandos con aportes</span>
                    <span>{percentPaid}% completado</span>
                  </div>
                  <div className="w-full bg-slate-700/60 rounded-full h-3 overflow-hidden p-0.5 border border-slate-600/40">
                    <div
                      className="bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(percentPaid > 0 ? 3 : 0, percentPaid)}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Catequizandos de {selectedGroup?.name} ({groupStudents.length})
                  </h4>

                  {groupStudents.length === 0 ? (
                    <p className="text-sm text-slate-400 py-3 text-center">No hay catequizandos matriculados en este grupo.</p>
                  ) : (
                    <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                      {studentTotals.map(({ student, payments, total }) => {
                        const barWidth = total > 0 ? Math.max(8, Math.round((total / maxStudentPaid) * 100)) : 0;
                        return (
                          <div
                            key={student.id}
                            className={`rounded-xl p-3 border transition ${
                              total > 0
                                ? 'bg-slate-800/40 border-slate-700 hover:border-indigo-500/40'
                                : 'bg-slate-800/20 border-slate-800/80 opacity-75'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-sm text-white">{student.name}</span>
                                  {payments.length > 0 ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                      {payments.length} {payments.length === 1 ? 'pago' : 'pagos'}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-700/40 text-slate-400 border border-slate-600/30">
                                      Sin pagos
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`text-sm font-black ${total > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                                  ₡{total.toLocaleString()}
                                </span>
                                {payments.length > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPaymentFilters(prev => ({ ...prev, search: student.name, groupId: trackerGroupId }));
                                      setPaymentCurrentPage(1);
                                      setTimeout(() => {
                                        document.getElementById('payment-history-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                      }, 50);
                                    }}
                                    className="text-xs text-sky-400 hover:text-sky-300 font-medium underline cursor-pointer"
                                    title="Ver en historial de pagos"
                                  >
                                    Ver recibos
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPaymentForm(prev => ({
                                        ...prev,
                                        groupId: trackerGroupId,
                                        studentId: student.id,
                                        studentName: student.name,
                                        withoutMatricula: false
                                      }));
                                      setTimeout(() => {
                                        document.getElementById('payment-register-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                      }, 50);
                                    }}
                                    className="text-xs text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer"
                                  >
                                    + Registrar pago
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="mt-2 w-full bg-slate-900/60 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  total > 0 ? 'bg-indigo-500' : 'bg-transparent'
                                }`}
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>

                            {payments.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5 pt-1 border-t border-slate-700/40">
                                {payments.map(p => (
                                  <span
                                    key={p.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900/80 text-[11px] text-slate-300 border border-slate-700"
                                  >
                                    <span className="font-semibold text-emerald-400">₡{Number(p.amount || 0).toLocaleString()}</span>
                                    <span className="text-slate-500">•</span>
                                    <span>{p.concept || 'Pago'}</span>
                                    <span className="text-slate-500">•</span>
                                    <span className="text-slate-400">{p.date || p.dateTime?.split('T')[0]}</span>
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {unassignedPayments.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-700/60 space-y-2">
                      <h5 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                        Otros pagos registrados en este grupo ({unassignedPayments.length})
                      </h5>
                      <div className="space-y-1.5">
                        {unassignedPayments.map(p => (
                          <div key={p.id} className="flex justify-between items-center bg-slate-800/30 border border-amber-500/20 rounded-lg px-3 py-2 text-xs">
                            <div>
                              <span className="font-semibold text-white">{p.invoiceName || p.studentName || 'Sin nombre'}</span>
                              <span className="text-slate-400 ml-2">{p.concept} · {p.date || p.dateTime?.split('T')[0]}</span>
                            </div>
                            <span className="font-bold text-emerald-400">₡{Number(p.amount || 0).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_1.6fr] gap-6">
        <div id="payment-register-form" className={`${cardBgClass} p-4 sm:p-6 rounded-xl border shadow-sm`}>
          <h3 className="text-base sm:text-lg font-bold mb-4">Registrar pago</h3>
          <form onSubmit={handleAddPaymentRecord} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <select value={paymentForm.groupId} onChange={(event) => setPaymentForm(prev => ({ ...prev, groupId: event.target.value, studentId: '', studentName: '' }))} className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`}>
                <option value="">Selecciona un grupo</option>
                {visibleGroups.map(group => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
              <select value={paymentForm.studentId} onChange={(event) => setPaymentForm(prev => ({ ...prev, studentId: event.target.value, studentName: event.target.value ? (students.find(student => student.id === event.target.value)?.name || '') : '' }))} disabled={!paymentForm.groupId || paymentForm.withoutMatricula} className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass} ${(!paymentForm.groupId || paymentForm.withoutMatricula) ? 'opacity-60 cursor-not-allowed' : ''}`}>
                <option value="">Selecciona catequizando</option>
                {visibleStudents.filter(student => student.groupId === paymentForm.groupId).map(student => (
                  <option key={student.id} value={student.id}>{student.name}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
              <input type="checkbox" checked={paymentForm.withoutMatricula} onChange={(event) => setPaymentForm(prev => ({ ...prev, withoutMatricula: event.target.checked, studentId: event.target.checked ? '' : prev.studentId, studentName: '' }))} className="rounded text-red-800 focus:ring-red-800" />
              Sin matrícula
            </label>
            {paymentForm.withoutMatricula && (
              <input value={paymentForm.invoiceName} onChange={(event) => setPaymentForm(prev => ({ ...prev, invoiceName: event.target.value }))} placeholder="Nombre para la factura" className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
            )}
            <input value={paymentForm.concept} onChange={(event) => setPaymentForm(prev => ({ ...prev, concept: event.target.value }))} placeholder="Concepto" className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" min="0" value={paymentForm.amount} onChange={(event) => setPaymentForm(prev => ({ ...prev, amount: event.target.value }))} placeholder="Monto" className={`rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
              <select value={paymentForm.paymentMethod} onChange={(event) => setPaymentForm(prev => ({ ...prev, paymentMethod: event.target.value }))} className={`rounded-lg px-3 py-2 text-sm ${inputBgClass}`}>
                <option value="Efectivo">Efectivo</option>
                <option value="Sinpe">Sinpe</option>
              </select>
            </div>
            <button className="w-full bg-red-800 hover:bg-red-900 text-white font-semibold py-2 rounded-lg text-sm">Guardar pago</button>
          </form>
        </div>

        <div id="payment-history-section" className={`${cardBgClass} p-4 sm:p-6 rounded-xl border shadow-sm`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <h3 className="text-base sm:text-lg font-bold">Historial de pagos</h3>
            <button
              type="button"
              onClick={handleScanPaymentQr}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-400 border border-sky-500/30 text-xs font-semibold transition self-start sm:self-auto"
              title="Escanear QR de comprobante para buscar pago"
            >
              <span>📷</span>
              <span>Escanear QR</span>
            </button>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_1.1fr] gap-2">
              <input
                value={paymentFilters.search}
                onChange={(event) => {
                  setPaymentFilters(prev => ({ ...prev, search: event.target.value }));
                  setPaymentCurrentPage(1);
                }}
                placeholder="Buscar por nombre o N° recibo..."
                className={`w-full rounded-lg px-3 py-2 text-xs ${inputBgClass}`}
              />
              <select
                value={paymentFilters.groupId}
                onChange={(event) => {
                  setPaymentFilters(prev => ({ ...prev, groupId: event.target.value }));
                  setPaymentCurrentPage(1);
                }}
                className={`w-full rounded-lg px-3 py-2 text-xs ${inputBgClass}`}
              >
                <option value="all">Todos los grupos</option>
                {visibleGroups.map(group => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={paymentFilters.date}
                  onChange={(event) => {
                    setPaymentFilters(prev => ({ ...prev, date: event.target.value }));
                    setPaymentCurrentPage(1);
                  }}
                  className={`w-full rounded-lg px-2.5 py-1.5 text-xs ${inputBgClass}`}
                  title="Filtrar por fecha"
                />
                {paymentFilters.date && (
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentFilters(prev => ({ ...prev, date: '' }));
                      setPaymentCurrentPage(1);
                    }}
                    className="px-2 py-1 text-xs text-slate-400 hover:text-white rounded bg-slate-700/50"
                    title="Limpiar fecha"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {filteredPaymentRecords.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">
                <p className="text-2xl mb-1">🔍</p>
                No hay pagos con esos filtros.
              </div>
            ) : (
              <div className="space-y-2">
                {paginatedPaymentRecords.map(record => {
                  const rawNum = record.receiptNumber !== undefined && record.receiptNumber !== null
                    ? record.receiptNumber
                    : (String(record.id).replace(/\D/g, '').slice(-6) || '1');
                  const receiptNumber = String(rawNum).padStart(6, '0');
                  return (
                    <div key={record.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-slate-700 rounded-xl p-3 bg-slate-800/20 hover:border-slate-600 transition">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm text-white">{record.studentName || record.invoiceName}</p>
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                            N° {receiptNumber}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">
                          {record.concept} · {record.groupName || 'Sin grupo'} · {record.date || record.dateTime?.split('T')[0]} {record.paymentMethod ? `· ${record.paymentMethod}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-emerald-400">₡{Number(record.amount || 0).toLocaleString()}</span>
                        <button onClick={() => handleViewPaymentQr(record)} className="px-2 py-1 rounded-lg bg-sky-600/10 text-sky-400 hover:bg-sky-600/20 text-xs font-bold transition">Imagen</button>
                        <button onClick={() => handleGeneratePaymentProofPdf(record)} className="px-2 py-1 rounded-lg bg-violet-600/10 text-violet-400 hover:bg-violet-600/20 text-xs font-bold transition">PDF</button>
                        <button onClick={() => handlePrintPaymentReceipt(record)} className="px-2 py-1 rounded-lg bg-amber-600/10 text-amber-400 hover:bg-amber-600/20 text-xs font-bold transition">Imprimir</button>
                        <button onClick={() => handleDeletePaymentRecord(record.id)} className="px-2 py-1 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-xs font-bold transition">Eliminar</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {filteredPaymentRecords.length > paymentPageSize ? (
              <div className="flex items-center justify-between pt-3 border-t border-slate-700 text-xs">
                <button
                  type="button"
                  disabled={paymentCurrentPage <= 1}
                  onClick={() => setPaymentCurrentPage(prev => Math.max(1, prev - 1))}
                  className="px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-200 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition"
                >
                  ← Anterior
                </button>
                <span className="text-slate-400">
                  Página <strong className="text-white">{paymentCurrentPage}</strong> de <strong className="text-white">{paymentTotalPages}</strong> ({filteredPaymentRecords.length} pagos)
                </span>
                <button
                  type="button"
                  disabled={paymentCurrentPage >= paymentTotalPages}
                  onClick={() => setPaymentCurrentPage(prev => Math.min(paymentTotalPages, prev + 1))}
                  className="px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-200 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium transition"
                >
                  Siguiente →
                </button>
              </div>
            ) : filteredPaymentRecords.length > 0 ? (
              <div className="text-right text-[11px] text-slate-400 pt-2 border-t border-slate-800">
                Total: {filteredPaymentRecords.length} pago(s)
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
