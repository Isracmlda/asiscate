import React from 'react';

export function MaintenanceModal({
  maintenanceGroup,
  setMaintenanceGroup,
  handleCloseMaintenanceModal,
  maintenanceMode,
  setMaintenanceMode,
  visibleStudents,
  editingStudentId,
  setEditingStudentId,
  editStudentName,
  setEditStudentName,
  editStudentParentEmail,
  setEditStudentParentEmail,
  editStudentParentPhone,
  setEditStudentParentPhone,
  isAddStudentFormOpen,
  setIsAddStudentFormOpen,
  newStudentName,
  setNewStudentName,
  newStudentParentEmail,
  setNewStudentParentEmail,
  newStudentParentPhone,
  setNewStudentParentPhone,
  setSelectedGroupForStudent,
  handleSaveStudentEdit,
  handleStartEditStudent,
  handleDeleteStudent,
  handleAddStudent,
  handleGenerateStudentQr,
  buildWhatsAppLink,
  cardBgClass,
  inputBgClass
}) {
  if (!maintenanceGroup) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
      <div className={`${cardBgClass} rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto`}>
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-xl font-bold">{maintenanceGroup.name}</h3>
            <p className="text-xs text-slate-400">Ciclo {maintenanceGroup.year || '2026-2027'}</p>
          </div>
          <button onClick={() => { if (handleCloseMaintenanceModal) handleCloseMaintenanceModal(); else if (setMaintenanceGroup) setMaintenanceGroup(null); }} className="bg-red-900 text-white px-3 py-1.5 rounded-lg text-xs font-bold">Cerrar</button>
        </div>

        <div className="flex gap-2 border-b border-slate-700 pb-2">
          <button onClick={() => setMaintenanceMode('view')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${maintenanceMode === 'view' ? 'bg-red-800 text-white' : 'bg-slate-700 text-slate-300'}`}>Ver Datos de Contacto</button>
          <button onClick={() => setMaintenanceMode('edit')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${maintenanceMode === 'edit' ? 'bg-red-800 text-white' : 'bg-slate-700 text-slate-300'}`}>Gestión de Lista</button>
        </div>

        {maintenanceMode === 'view' ? (
          <div className="space-y-3">
            {visibleStudents.filter(student => student.groupId === maintenanceGroup.id).map(student => {
              const displayName = student.fullName || student.name || 'Sin nombre';
              const displayEmail = student.parentEmail || student.family?.guardian?.email || student.family?.mother?.email || student.family?.father?.email || '';
              const displayPhone = student.parentPhone || student.phone || student.family?.guardian?.phone1 || student.family?.mother?.phone1 || student.family?.father?.phone1 || '';

              return (
                <div key={student.id} className="border border-slate-700 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-sm text-white">{displayName}</p>
                    <div className="flex flex-wrap gap-3 text-xs mt-1">
                      {displayEmail ? <span className="flex items-center gap-1"><a className="text-sky-400 hover:underline" href={`mailto:${displayEmail}`}>{displayEmail}</a><button title="Copiar correo" onClick={() => navigator.clipboard.writeText(displayEmail)}>📋</button></span> : <span className="text-slate-500 italic">Sin Correo</span>}
                      {displayPhone ? <span className="flex items-center gap-1"><a className="text-emerald-400 hover:underline" href={buildWhatsAppLink ? buildWhatsAppLink(displayPhone) : `https://wa.me/${displayPhone}`} target="_blank" rel="noreferrer">{displayPhone}</a><button title="Copiar teléfono" onClick={() => navigator.clipboard.writeText(displayPhone)}>📋</button></span> : <span className="text-slate-500 italic">Sin Teléfono</span>}
                    </div>
                  </div>
                  <button type="button" onClick={() => handleGenerateStudentQr(student)} className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-lg text-xs font-bold">Mostrar CódigoQR</button>
                </div>
              );
            })}

            {visibleStudents.filter(student => student.groupId === maintenanceGroup.id).length === 0 && <p className="text-sm text-slate-400">No hay catequizandos registrados.</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {visibleStudents.filter(student => student.groupId === maintenanceGroup.id).map(student => {
              const displayName = student.fullName || student.name || 'Sin nombre';
              return editingStudentId === student.id ? (
                <div key={student.id} className="grid grid-cols-1 sm:grid-cols-3 gap-2 border-b border-slate-700 pb-3">
                  <input value={editStudentName} onChange={event => setEditStudentName(event.target.value)} className={`rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
                  <input type="email" value={editStudentParentEmail} onChange={event => setEditStudentParentEmail(event.target.value)} placeholder="Correo del encargado (opcional)" className={`rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
                  <input value={editStudentParentPhone} onChange={event => setEditStudentParentPhone(event.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="Número telefónico del encargado (opcional)" inputMode="numeric" maxLength="8" className={`rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
                  <div className="sm:col-span-3 flex gap-2 justify-end"><button onClick={() => handleSaveStudentEdit(student)} className="px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg">Guardar</button><button onClick={() => setEditingStudentId(null)} className="px-3 py-1.5 text-xs text-slate-400">Cancelar</button></div>
                </div>
              ) : (
                <div key={student.id} className="flex items-center justify-between border-b border-slate-700 pb-2"><span className="text-sm font-semibold">{displayName}</span><div className="flex gap-2"><button onClick={() => handleStartEditStudent(student)} className="px-3 py-1.5 text-xs bg-slate-700 rounded-lg">Editar</button><button onClick={() => handleDeleteStudent(student.id)} className="px-3 py-1.5 text-xs text-rose-400 bg-rose-500/10 rounded-lg">Eliminar</button></div></div>
              );
            })}
            <button onClick={() => { setSelectedGroupForStudent(maintenanceGroup.id); setNewStudentName(''); setNewStudentParentEmail(''); setNewStudentParentPhone(''); setIsAddStudentFormOpen(!isAddStudentFormOpen); }} className="bg-red-800 hover:bg-red-900 text-white px-4 py-2 rounded-lg text-xs font-bold">Añadir catequizando</button>
            {isAddStudentFormOpen && <form onSubmit={handleAddStudent} className="border border-slate-700 rounded-xl p-4 space-y-3">
              <input required value={newStudentName} onChange={event => setNewStudentName(event.target.value)} placeholder="Nombre completo" className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
              <input type="email" value={newStudentParentEmail} onChange={event => setNewStudentParentEmail(event.target.value)} placeholder="Correo del encargado (opcional)" className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
              <input value={newStudentParentPhone} onChange={event => setNewStudentParentPhone(event.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="Número telefónico del encargado (opcional)" inputMode="numeric" maxLength="8" className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
              <button className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-xs font-bold">Guardar catequizando</button>
            </form>}
          </div>
        )}
      </div>
    </div>
  );
}
