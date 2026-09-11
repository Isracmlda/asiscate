import { useEffect, useRef, useState } from 'react';

export function InventoryView({
  cardBgClass,
  activeViewMode,
  handleExportInventoryPdf,
  inventoryDateFilters,
  setInventoryDateFilters,
  inputBgClass,
  inventoryShowDateSummary,
  setInventoryShowDateSummary,
  inventoryDateFilteredItems,
  handleAddInventoryItem,
  inventoryForm,
  setInventoryForm,
  editingInventoryItemId,
  resetInventoryEditors,
  visibleInventoryItems,
  currentUserKey,
  startInventoryItemEdit,
  handleInventoryStockChange,
  handleDeleteInventoryItem,
  handleDeleteAllInventoryItems,
  handleAddInventoryReservation,
  inventoryReservationForm,
  setInventoryReservationForm,
  editingInventoryReservationId,
  displayInventoryAssets,
  getInventorySlotAvailability,
  getReservationAssetConfig,
  setEditingInventoryReservationId,
  visibleInventoryReservations,
  startInventoryReservationEdit,
  handleDeleteInventoryReservation,
  handleAddInventoryAsset,
  inventoryAssetForm,
  setInventoryAssetForm,
  editingInventoryAssetId,
  setEditingInventoryAssetId,
  startInventoryAssetEdit,
  handleInventoryAssetStockChange,
  handleDeleteInventoryAsset,
  groupScheduleOptions = { days: [], times: [], rooms: [] }
}) {
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const [isReservationCalendarOpen, setIsReservationCalendarOpen] = useState(false);
  const reservationCalendarRef = useRef(null);
  const [reservationCalendarMonth, setReservationCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const allowedDays = groupScheduleOptions.days || [];
  const allowedTimes = groupScheduleOptions.times || [];
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const isAllowedReservationDate = (dateValue) => {
    if (!dateValue) return false;
    const date = new Date(`${dateValue}T12:00:00`);
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const maximumDate = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
    return date >= startDate && date <= maximumDate && (!allowedDays.length || allowedDays.includes(dayNames[date.getDay()]));
  };
  const today = new Date();
  const calendarMinimumMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const calendarMaximumMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const canGoPreviousMonth = reservationCalendarMonth > calendarMinimumMonth;
  const canGoNextMonth = reservationCalendarMonth < calendarMaximumMonth;
  const calendarMonthDays = new Date(reservationCalendarMonth.getFullYear(), reservationCalendarMonth.getMonth() + 1, 0).getDate();
  const calendarFirstDay = (new Date(reservationCalendarMonth.getFullYear(), reservationCalendarMonth.getMonth(), 1).getDay() + 6) % 7;
  const calendarDateValue = (day) => `${reservationCalendarMonth.getFullYear()}-${String(reservationCalendarMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const selectReservationDate = (dateValue) => {
    if (!isAllowedReservationDate(dateValue)) return;
    setInventoryReservationForm(previous => ({ ...previous, date: dateValue }));
    setIsReservationCalendarOpen(false);
  };
  useEffect(() => {
    if (!isReservationCalendarOpen) return undefined;
    const handleOutsideClick = (event) => {
      if (reservationCalendarRef.current && !reservationCalendarRef.current.contains(event.target)) {
        setIsReservationCalendarOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isReservationCalendarOpen]);
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">Inventario</h2>
          <p className="text-xs sm:text-sm text-slate-400">Control de materiales y reservas.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className={`${cardBgClass} hidden p-4 sm:p-6 rounded-xl border shadow-sm`}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-base sm:text-lg font-bold">Materiales</h3>
            {activeViewMode !== 'catequista' && (
              <button onClick={handleExportInventoryPdf} className="px-3 py-2 rounded-lg bg-red-800 text-white text-xs font-bold hover:bg-red-900">Generar PDF</button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
            <input type="date" value={inventoryDateFilters.dateFrom} onChange={event => setInventoryDateFilters(prev => ({ ...prev, dateFrom: event.target.value }))} className={`rounded-lg px-3 py-2 text-xs ${inputBgClass}`} aria-label="Materiales desde" />
            <input type="date" value={inventoryDateFilters.dateTo} onChange={event => setInventoryDateFilters(prev => ({ ...prev, dateTo: event.target.value }))} className={`rounded-lg px-3 py-2 text-xs ${inputBgClass}`} aria-label="Materiales hasta" />
            <button type="button" onClick={() => setInventoryShowDateSummary(prev => !prev)} className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-white">{inventoryShowDateSummary ? 'Ocultar compendio' : 'Mostrar compendio'}</button>
          </div>
          {inventoryShowDateSummary && (
            <div className="mb-4 rounded-lg border border-slate-700 bg-slate-900/30 p-3 text-xs text-slate-300">
              {inventoryDateFilteredItems.length} material(es) registrado(s) en el intervalo seleccionado.
            </div>
          )}
          <form onSubmit={handleAddInventoryItem} className="hidden">
            <input value={inventoryForm.name} onChange={(event) => setInventoryForm(prev => ({ ...prev, name: event.target.value }))} placeholder="Nombre del material" className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
            <input type="number" min="0" value={inventoryForm.stock} onChange={(event) => setInventoryForm(prev => ({ ...prev, stock: event.target.value }))} placeholder="Cantidad inicial" className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
            <div className="flex gap-2">
              <button className="flex-1 bg-red-800 hover:bg-red-900 text-white font-semibold py-2 rounded-lg text-sm">{editingInventoryItemId ? 'Guardar cambios' : 'Guardar material'}</button>
              {editingInventoryItemId && (
                <button type="button" onClick={resetInventoryEditors} className="px-3 py-2 rounded-lg bg-slate-700 text-white text-xs font-bold">Cancelar</button>
              )}
            </div>
          </form>

          <div className="mt-5 space-y-3">
            {visibleInventoryItems.length === 0 ? (
              <p className="text-sm text-slate-400">No hay materiales.</p>
            ) : visibleInventoryItems.map(item => {
              const canDeleteItem = activeViewMode === 'admin' || activeViewMode === 'coordinador' || activeViewMode === 'coordinadorGeneral';
              const canEditItem = activeViewMode === 'admin' || activeViewMode === 'coordinador' || activeViewMode === 'coordinadorGeneral';
              return (
                <div key={item.id} className="border border-slate-700 rounded-xl p-3 cursor-pointer" onClick={() => { if (canEditItem) { startInventoryItemEdit(item); setIsMaterialModalOpen(true); } }}>
                  <div className="flex justify-between gap-2 items-center">
                    <div>
                      <p className="font-bold text-sm">{item.name}</p>
                      <p className="text-xs text-slate-400">Stock: {item.stock} · {item.date || item.createdAt?.split('T')[0] || 'Sin fecha'} {activeViewMode !== 'catequista' && `· ${item.createdByName || item.createdBy || 'Usuario'}`}</p>
                    </div>
                    <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                      <button onClick={() => handleInventoryStockChange(item.id, -1)} className="px-2 py-1 rounded-lg bg-slate-700 text-white text-xs font-bold">-</button>
                      <button onClick={() => handleInventoryStockChange(item.id, 1)} className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold">+</button>
                      {canDeleteItem && (
                        <button onClick={() => handleDeleteInventoryItem(item.id)} className="px-2 py-1 rounded-lg bg-rose-500/10 text-rose-400 text-xs font-bold">Eliminar</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className={`${cardBgClass} p-4 sm:p-6 rounded-xl border shadow-sm`}>
          <h3 className="text-base sm:text-lg font-bold mb-4">Reservas</h3>
          <form onSubmit={handleAddInventoryReservation} className="space-y-3">
            <select value={inventoryReservationForm.itemId} onChange={(event) => setInventoryReservationForm(prev => ({ ...prev, itemId: event.target.value }))} className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`}>
              <option value="">Selecciona un material o activo</option>
                {displayInventoryAssets
                  .filter(asset => {
                    if (editingInventoryReservationId && asset.id === inventoryReservationForm.itemId) return true;
                    return getInventorySlotAvailability(asset.id, inventoryReservationForm.date, inventoryReservationForm.slot, editingInventoryReservationId) > 0;
                  })
                  .map(asset => {
                    const isGrouped = asset.showTogether === true;
                    const available = getInventorySlotAvailability(asset.id, inventoryReservationForm.date, inventoryReservationForm.slot, editingInventoryReservationId);
                    return (
                      <option key={asset.id} value={asset.id}>
                        {isGrouped ? `${asset.name} (${available} disp.)` : asset.name}
                      </option>
                    );
                  })}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <div ref={reservationCalendarRef} className="relative">
                <button type="button" onClick={() => setIsReservationCalendarOpen(previous => !previous)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${inputBgClass}`}>{inventoryReservationForm.date ? new Date(`${inventoryReservationForm.date}T12:00:00`).toLocaleDateString('es-CR') : 'Selecciona una fecha'} <span className="float-right">📅</span></button>
                {isReservationCalendarOpen && (
                  <div className="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border border-slate-300 bg-white p-3 text-slate-800 shadow-2xl dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">
                    <div className="mb-3 flex items-center justify-between"><button type="button" disabled={!canGoPreviousMonth} onClick={() => canGoPreviousMonth && setReservationCalendarMonth(previous => new Date(previous.getFullYear(), previous.getMonth() - 1, 1))} className="rounded px-2 py-1 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-700">‹</button><strong className="text-sm capitalize">{reservationCalendarMonth.toLocaleDateString('es-CR', { month: 'long', year: 'numeric' })}</strong><button type="button" disabled={!canGoNextMonth} onClick={() => canGoNextMonth && setReservationCalendarMonth(previous => new Date(previous.getFullYear(), previous.getMonth() + 1, 1))} className="rounded px-2 py-1 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-700">›</button></div>
                    <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-500">{['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map(day => <span key={day}>{day}</span>)}</div>
                    <div className="mt-1 grid grid-cols-7 gap-1">{Array.from({ length: calendarFirstDay + calendarMonthDays }, (_, index) => { const day = index - calendarFirstDay + 1; if (day < 1) return <span key={`empty-${index}`} />; const dateValue = calendarDateValue(day); const enabled = isAllowedReservationDate(dateValue); const selected = inventoryReservationForm.date === dateValue; return <button key={dateValue} type="button" disabled={!enabled} onClick={() => selectReservationDate(dateValue)} className={`rounded py-1.5 text-xs ${selected ? 'bg-sky-600 text-white' : enabled ? 'hover:bg-sky-100 dark:hover:bg-slate-700' : 'cursor-not-allowed text-slate-300 line-through dark:text-slate-600'}`}>{day}</button>; })}</div>
                    <div className="mt-2 flex justify-between"><button type="button" onClick={() => { const today = new Date(); setReservationCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1)); }} className="text-xs text-sky-600">Hoy</button><button type="button" onClick={() => { setInventoryReservationForm(previous => ({ ...previous, date: '' })); setIsReservationCalendarOpen(false); }} className="text-xs text-rose-600">Borrar</button></div>
                  </div>
                )}
              </div>
              <select value={inventoryReservationForm.slot} onChange={(event) => setInventoryReservationForm(prev => ({ ...prev, slot: event.target.value }))} className={`rounded-lg px-3 py-2 text-sm ${inputBgClass}`}>
                {allowedTimes.map(slot => <option key={slot} value={slot}>{slot}</option>)}
              </select>
            </div>
            {getReservationAssetConfig(inventoryReservationForm.itemId)?.showTogether === true && (
              <input type="number" min="1" value={inventoryReservationForm.quantity} onChange={(event) => setInventoryReservationForm(prev => ({ ...prev, quantity: event.target.value }))} placeholder="Cantidad a reservar" className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
            )}
            <div className="flex gap-2">
              <button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 rounded-lg text-sm">{editingInventoryReservationId ? 'Guardar cambios' : 'Guardar reserva'}</button>
              {editingInventoryReservationId && (
                <button type="button" onClick={() => { setEditingInventoryReservationId(null); setInventoryReservationForm({ itemId: '', date: new Date().toISOString().split('T')[0], slot: '08:00-10:00', quantity: '1' }); }} className="px-3 py-2 rounded-lg bg-slate-700 text-white text-xs font-bold">Cancelar</button>
              )}
            </div>
          </form>

          <div className="mt-5 space-y-3">
            {visibleInventoryReservations.length === 0 ? (
              <p className="text-sm text-slate-400">No hay reservas registradas.</p>
            ) : visibleInventoryReservations.map(reservation => {
              const canDeleteReservation = activeViewMode === 'admin' || reservation.createdBy === currentUserKey;
              const canEditReservation = activeViewMode === 'admin' || reservation.createdBy === currentUserKey;
              return (
                <div key={reservation.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-slate-700 rounded-xl p-3 cursor-pointer" onClick={() => canEditReservation && startInventoryReservationEdit(reservation)}>
                  <div>
                    <p className="font-bold text-sm">{reservation.itemName}</p>
                    <p className="text-xs text-slate-400">{reservation.date} · {reservation.slot}{getReservationAssetConfig(reservation.itemId)?.showTogether === true ? ` · ${reservation.quantity} reservado(s)` : ''}</p>
                    <p className="text-[11px] text-slate-500">Reservado por: {reservation.reservedBy || 'Usuario'}</p>
                  </div>
                  <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                    {canDeleteReservation && (
                      <button onClick={() => handleDeleteInventoryReservation(reservation.id)} className="px-2 py-1 rounded-lg bg-rose-500/10 text-rose-400 text-xs font-bold">Eliminar</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      {(activeViewMode === 'admin' || activeViewMode === 'coordinador' || activeViewMode === 'coordinadorGeneral') && (
        <div className={`${cardBgClass} p-4 sm:p-6 rounded-xl border shadow-sm`}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-base sm:text-lg font-bold">Activos</h3>
          </div>
          <form onSubmit={handleAddInventoryAsset} className="space-y-3">
            <input value={inventoryAssetForm.name} onChange={(event) => setInventoryAssetForm(prev => ({ ...prev, name: event.target.value }))} placeholder="Nombre del activo" className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
            <input type="number" min="0" value={inventoryAssetForm.stock} onChange={(event) => setInventoryAssetForm(prev => ({ ...prev, stock: event.target.value }))} placeholder="Cantidad inicial" className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
              <input type="checkbox" checked={inventoryAssetForm.showTogether === true} onChange={event => setInventoryAssetForm(prev => ({ ...prev, showTogether: event.target.checked }))} className="rounded text-sky-600" />
              Mostrar todos juntos
            </label>
            <div className="flex gap-2">
              <button className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-semibold py-2 rounded-lg text-sm">{editingInventoryAssetId ? 'Guardar cambios' : 'Guardar activo'}</button>
              {editingInventoryAssetId && (
                <button type="button" onClick={() => { setEditingInventoryAssetId(null); setInventoryAssetForm({ name: '', stock: '1', showTogether: false }); }} className="px-3 py-2 rounded-lg bg-slate-700 text-white text-xs font-bold">Cancelar</button>
              )}
            </div>
          </form>

          <div className="mt-5 space-y-3">
            {displayInventoryAssets.length === 0 ? (
              <p className="text-sm text-slate-400">No hay activos.</p>
            ) : displayInventoryAssets.map(asset => {
              const sourceAssetId = asset.parentAssetId || asset.id;
              const canDeleteAsset = activeViewMode === 'admin' || asset.createdBy === currentUserKey;
              const canEditAsset = activeViewMode === 'admin' || asset.createdBy === currentUserKey;
              const isGrouped = asset.showTogether === true;
              return (
                <div key={asset.id} className="border border-slate-700 rounded-xl p-3 cursor-pointer" onClick={() => canEditAsset && startInventoryAssetEdit({ ...asset, id: sourceAssetId })}>
                  <div className="flex justify-between gap-2 items-center">
                    <div>
                      <p className="font-bold text-sm">{asset.name}</p>
                      <p className="text-xs text-slate-400">{isGrouped ? `Stock: ${asset.stock}` : 'Activo individual'}</p>
                    </div>
                    <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                      {isGrouped && <><button onClick={() => handleInventoryAssetStockChange(sourceAssetId, -1)} className="px-2 py-1 rounded-lg bg-slate-700 text-white text-xs font-bold">-</button><button onClick={() => handleInventoryAssetStockChange(sourceAssetId, 1)} className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold">+</button></>}
                      {canDeleteAsset && (
                        <button onClick={() => handleDeleteInventoryAsset(sourceAssetId)} className="px-2 py-1 rounded-lg bg-rose-500/10 text-rose-400 text-xs font-bold">Eliminar</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>
      <button type="button" onClick={() => setIsMaterialModalOpen(true)} className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-red-800 hover:bg-red-900 text-white text-3xl font-light shadow-xl" title="Añadir material faltante" aria-label="Añadir material faltante">+</button>
      {isMaterialModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4" onMouseDown={event => event.target === event.currentTarget && setIsMaterialModalOpen(false)}>
          <div className={`${cardBgClass} w-full max-w-md rounded-2xl border p-5 shadow-2xl`}>
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold">Añadir material faltante</h3><button type="button" onClick={() => setIsMaterialModalOpen(false)} aria-label="Cerrar" className="rounded-lg bg-rose-700 hover:bg-rose-800 px-2.5 py-1 text-lg font-bold leading-none text-white">✕</button></div>
            <form onSubmit={event => { handleAddInventoryItem(event); setIsMaterialModalOpen(false); }} className="space-y-3">
              <input required value={inventoryForm.name} onChange={event => setInventoryForm(prev => ({ ...prev, name: event.target.value }))} placeholder="Nombre del material" className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
              <button className="w-full bg-red-800 hover:bg-red-900 text-white font-semibold py-2 rounded-lg text-sm">{editingInventoryItemId ? 'Guardar cambios' : 'Guardar material'}</button>
            </form>
            <div className="mt-5 space-y-2 max-h-72 overflow-y-auto">
              <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-bold">Materiales registrados</h4><div className="flex gap-2">{activeViewMode !== 'catequista' && <button type="button" onClick={handleExportInventoryPdf} className="rounded-lg bg-red-800 px-3 py-1.5 text-xs font-bold text-white">Generar PDF</button>}{activeViewMode !== 'catequista' && visibleInventoryItems.length > 0 && <button type="button" onClick={handleDeleteAllInventoryItems} className="rounded-lg bg-rose-700 px-3 py-1.5 text-xs font-bold text-white">Eliminar todo</button>}</div></div>
              {visibleInventoryItems.length === 0 ? <p className="text-sm text-slate-400">No hay materiales.</p> : visibleInventoryItems.map(item => {
                const canDeleteItem = activeViewMode === 'admin' || activeViewMode === 'coordinador' || activeViewMode === 'coordinadorGeneral';
                const canEditItem = activeViewMode === 'admin' || activeViewMode === 'coordinador' || activeViewMode === 'coordinadorGeneral';
                return <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-700 p-2"><p className="text-sm font-bold">{item.name}</p><div className="flex gap-1">{canEditItem && <button type="button" onClick={() => startInventoryItemEdit(item)} className="rounded bg-slate-700 px-2 py-1 text-xs text-white">Editar</button>}{canDeleteItem && <button type="button" onClick={() => handleDeleteInventoryItem(item.id)} className="rounded bg-rose-700 px-2 py-1 text-xs text-white">Eliminar</button>}</div></div>;
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
