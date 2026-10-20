import { useEffect, useRef, useState } from 'react';
import { MaterialIcon } from '../Shared/MaterialIcon';
import { InventoryLabelsModal } from '../Modals/InventoryLabelsModal';

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
  inventoryFurnitureForm = { name: '', stock: '1', showTogether: false, room: '' },
  setInventoryFurnitureForm = () => {},
  editingInventoryAssetId,
  setEditingInventoryAssetId,
  startInventoryAssetEdit,
  handleInventoryAssetStockChange,
  handleDeleteInventoryAsset,
  groupScheduleOptions = { days: [], times: [], rooms: [] },
  visibleInventoryAssets = [],
  onScanInventoryQr = () => {},
  getInventoryLabelLocation = () => ({ parish: '', diaconia: '' }),
  canManageInventoryAssets = false
}) {
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const [isReservationCalendarOpen, setIsReservationCalendarOpen] = useState(false);
  const [labelAsset, setLabelAsset] = useState(null);
  const [pdfBusyKind, setPdfBusyKind] = useState('');
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
  const exportAssetsPdf = async (kind, assets) => {
    setPdfBusyKind(kind);
    try {
      const [{ jsPDF }, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const autoTable = autoTableModule.default || autoTableModule.autoTable;
      const isFurniture = kind === 'furniture';
      const totalUnits = assets.reduce((sum, asset) => sum + Math.max(0, Number(asset.stock) || 0), 0);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const title = isFurniture ? 'Inventario de mobiliario' : 'Inventario de activos';
      const locations = assets.map(getInventoryLabelLocation);
      const parishNames = Array.from(new Set(locations.map(location => location.parish).filter(Boolean)));
      const diaconiaNames = Array.from(new Set(locations.map(location => location.diaconia).filter(Boolean)));
      const locationTitle = [
        parishNames.length ? `Parroquia: ${parishNames.join(' · ')}` : '',
        diaconiaNames.length ? `Diaconía: ${diaconiaNames.join(' · ')}` : ''
      ].filter(Boolean).join('   |   ');
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      const locationTitleLines = locationTitle ? pdf.splitTextToSize(locationTitle, pageWidth - 30) : [];
      const summaryY = locationTitleLines.length ? 21 + locationTitleLines.length * 4 + 3 : 23;
      const headerHeight = Math.max(32, summaryY + 7);
      pdf.setFillColor(127, 29, 29);
      pdf.rect(0, 0, pageWidth, headerHeight, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(16);
      pdf.text(title, 15, 13);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      if (locationTitleLines.length) pdf.text(locationTitleLines, 15, 20);
      pdf.text(`${assets.length} registro(s) · ${totalUnits} unidad(es) · ${new Date().toLocaleDateString('es-CR')}`, 15, summaryY);
      let startY = headerHeight + 9;
      const tableOptions = (body, start) => ({
        startY: start,
        head: [['Nombre', 'Cantidad']],
        body,
        theme: 'grid',
        headStyles: { fillColor: [127, 29, 29], textColor: 255, fontStyle: 'bold' },
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
        columnStyles: { 0: { cellWidth: 145 }, 1: { cellWidth: 35, halign: 'center' } },
        margin: { left: 15, right: 15, bottom: 16 }
      });
      if (isFurniture) {
        if (!assets.length) {
          pdf.setTextColor(100, 116, 139);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(10);
          pdf.text('No hay mobiliario registrado.', 15, startY);
        }
        const rooms = Array.from(new Set(assets.map(asset => asset.room || 'Salón sin especificar'))).sort((a, b) => a.localeCompare(b, 'es'));
        for (const room of rooms) {
          if (startY > 250) { pdf.addPage(); startY = 20; }
          pdf.setTextColor(31, 41, 55);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(11);
          pdf.text(room, 15, startY);
          const roomRows = assets.filter(asset => (asset.room || 'Salón sin especificar') === room)
            .map(asset => [asset.name || 'Mobiliario', String(Math.max(0, Number(asset.stock) || 0))]);
          autoTable(pdf, tableOptions(roomRows, startY + 3));
          startY = (pdf.lastAutoTable?.finalY || startY + 10) + 7;
        }
      } else if (assets.length) {
        const body = assets.map(asset => [asset.name || 'Activo', String(Math.max(0, Number(asset.stock) || 0))]);
        autoTable(pdf, tableOptions(body, startY));
      } else {
        pdf.setTextColor(100, 116, 139);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.text('No hay registros para mostrar.', 15, startY);
      }
      pdf.save(`${isFurniture ? 'Inventario_mobiliario' : 'Inventario_activos'}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (error) {
      console.error('No se pudo generar el PDF de inventario:', error);
      window.alert('No se pudo generar el PDF del inventario.');
    } finally {
      setPdfBusyKind('');
    }
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
              <option value="">Selecciona material, activo o mobiliario</option>
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
                <button type="button" onClick={() => setIsReservationCalendarOpen(previous => !previous)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${inputBgClass}`}>{inventoryReservationForm.date ? new Date(`${inventoryReservationForm.date}T12:00:00`).toLocaleDateString('es-CR') : 'Selecciona una fecha'} <MaterialIcon className="float-right" name="calendar_month" /></button>
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

      {canManageInventoryAssets && (activeViewMode === 'admin' || activeViewMode === 'coordinador' || activeViewMode === 'coordinadorGeneral') && (
        <>
          {['asset', 'furniture'].map(kind => {
            const isFurniture = kind === 'furniture';
            const form = isFurniture ? inventoryFurnitureForm : inventoryAssetForm;
            const setForm = isFurniture ? setInventoryFurnitureForm : setInventoryAssetForm;
            const typeAssets = visibleInventoryAssets.filter(asset => (asset.kind || 'asset') === kind);
            const editingKind = visibleInventoryAssets.find(asset => asset.id === editingInventoryAssetId)?.kind || 'asset';
            const editingThisType = editingInventoryAssetId && editingKind === kind;
            const formLocked = Boolean(editingInventoryAssetId && !editingThisType);
            return <section key={kind} className={`${cardBgClass} p-4 sm:p-6 rounded-xl border shadow-sm`}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-base font-bold sm:text-lg">{isFurniture ? 'Mobiliario' : 'Activos'}</h3>
                <div className="flex items-center gap-1.5">
                  <button type="button" disabled={pdfBusyKind === kind} onClick={() => exportAssetsPdf(kind, typeAssets)} className="inline-flex items-center gap-1 rounded-lg bg-rose-600/15 px-2 py-1.5 text-[11px] font-bold text-rose-300 hover:bg-rose-600/25 disabled:opacity-50" title={`Generar PDF de ${isFurniture ? 'mobiliario' : 'activos'}`}><MaterialIcon name="picture_as_pdf" /> {pdfBusyKind === kind ? 'PDF…' : 'Generar PDF'}</button>
                  <button type="button" onClick={onScanInventoryQr} className="inline-flex items-center gap-1 rounded-lg bg-sky-600/15 px-2 py-1.5 text-[11px] font-bold text-sky-300 hover:bg-sky-600/25" title={`Escanear QR de ${isFurniture ? 'mobiliario' : 'activos'}`}><MaterialIcon name="qr_code_scanner" /> Escanear</button>
                </div>
              </div>
              <form onSubmit={event => handleAddInventoryAsset(event, kind, form)} className="space-y-3">
                <div className="grid grid-cols-4 gap-2">
                  <input disabled={formLocked} value={form.name} onChange={event => setForm(prev => ({ ...prev, name: event.target.value }))} placeholder={isFurniture ? 'Nombre del mueble' : 'Nombre del activo'} className={`col-span-3 min-w-0 rounded-lg px-3 py-2 text-sm ${inputBgClass} disabled:opacity-50`} />
                  <input disabled={formLocked} type="number" min="1" value={form.stock} onChange={event => setForm(prev => ({ ...prev, stock: event.target.value }))} placeholder="Cantidad" aria-label="Cantidad" className={`col-span-1 min-w-0 rounded-lg px-2 py-2 text-sm ${inputBgClass} disabled:opacity-50`} />
                </div>
                {isFurniture && <select disabled={formLocked} value={form.room || ''} onChange={event => setForm(prev => ({ ...prev, room: event.target.value }))} required className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass} disabled:opacity-50`}><option value="">Selecciona aula o salón</option>{(groupScheduleOptions.rooms || []).map(room => <option key={room} value={room}>{room}</option>)}</select>}
                <label className={`flex items-center gap-2 text-xs font-semibold text-slate-300 ${formLocked ? 'opacity-50' : 'cursor-pointer'}`}><input disabled={formLocked} type="checkbox" checked={form.showTogether === true} onChange={event => setForm(prev => ({ ...prev, showTogether: event.target.checked }))} className="rounded text-sky-600" /> Mostrar todos juntos</label>
                <div className="flex gap-2">
                  <button disabled={formLocked} className="flex-1 rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">{editingThisType ? 'Guardar cambios' : isFurniture ? 'Guardar mobiliario' : 'Guardar activo'}</button>
                  {editingThisType && <button type="button" onClick={() => { setEditingInventoryAssetId(null); setInventoryAssetForm({ name: '', stock: '1', showTogether: false, kind: 'asset', room: '' }); setInventoryFurnitureForm({ name: '', stock: '1', showTogether: false, room: '' }); }} className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-white">Cancelar</button>}
                </div>
              </form>
              <div className="mt-4 space-y-2">
                {typeAssets.length === 0 ? <p className="text-sm text-slate-400">No hay {isFurniture ? 'mobiliario' : 'activos'} registrados.</p> : typeAssets.map(asset => {
                  const canDeleteAsset = activeViewMode === 'admin' || asset.createdBy === currentUserKey;
                  const canEditAsset = activeViewMode === 'admin' || asset.createdBy === currentUserKey;
                  const qty = Math.max(0, Number(asset.stock) || 0);
                  return <div key={asset.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-700 p-2.5" onClick={() => canEditAsset && startInventoryAssetEdit(asset)}>
                    <div className="min-w-0 flex-[3]" title={asset.name}><p className="truncate text-sm font-bold">{asset.name}</p><p className="truncate text-[10px] text-slate-400">{isFurniture ? asset.room : asset.diaconiaName}</p></div>
                    <div className="flex min-w-0 flex-1 items-center justify-end gap-1" onClick={event => event.stopPropagation()}>
                      <span className="min-w-[2.5rem] text-center text-xs font-bold text-slate-300">{qty}</span>
                      <button type="button" onClick={() => setLabelAsset(asset)} aria-label={`Generar QR para ${asset.name}`} title="Ver etiqueta QR" className="rounded-lg bg-sky-600/15 p-1.5 text-sky-300 hover:bg-sky-600/30"><MaterialIcon name="qr_code_2" /></button>
                      {canDeleteAsset && <button type="button" onClick={() => handleDeleteInventoryAsset(asset.id)} aria-label={`Eliminar ${asset.name}`} title="Eliminar" className="rounded-lg bg-rose-500/10 p-1.5 text-rose-400 hover:bg-rose-500/20"><MaterialIcon name="delete" /></button>}
                    </div>
                  </div>;
                })}
              </div>
            </section>;
          })}
        </>
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
      {labelAsset && <InventoryLabelsModal asset={labelAsset} location={getInventoryLabelLocation(labelAsset)} onClose={() => setLabelAsset(null)} />}
    </div>
  );
}
