import { useEffect, useState } from 'react';
import { ExpedienteMigrationModal } from '../Modals/ExpedienteMigrationModal';
import { MaterialIcon } from '../Shared/MaterialIcon';

export function GroupsView({
  setIsImportModalOpen,
  cardBgClass,
  levelOptions = [],
  activeViewMode,
  inputBgClass,
  visibleGroups,
  visibleStudents,
  catechistGroupMembers = [],
  setStudents,
  setIsCreateGroupModalOpen,
  editingGroupId,
  setEditingGroupId,
  editGroupName,
  setEditGroupName,
  editGroupLevel,
  setEditGroupLevel,
  editGroupYear,
  setEditGroupYear,
  editGroupDay,
  setEditGroupDay,
  editGroupTime,
  setEditGroupTime,
  editGroupRoom,
  setEditGroupRoom,
  groupScheduleOptions = { days: [], times: [], rooms: [] },
  editGroupCatechists,
  setEditGroupCatechists,
  editGroupVisibleForCatechists,
  setEditGroupVisibleForCatechists,
  allUsers = [],
  handleStartEditGroup,
  handleSaveGroupEdit,
  handleDeleteGroup,
  handleDuplicateGroup,
  onOpenGroupReports,
  handleExportGroupScheduleImage,
  groupCycleFilter = '',
  setGroupCycleFilter,
  themeMode,
  mutedTextClass = 'text-slate-400',
  softTextClass = 'text-slate-300',
  labelTextClass = 'text-slate-400'
}) {
  const [selectedStudentForMigration, setSelectedStudentForMigration] = useState(null);
  const [isGroupActionsOpen, setIsGroupActionsOpen] = useState(false);

  // El ciclo actual sigue la misma regla utilizada en Matrículas: de enero a
  // abril se mantiene el ciclo que inició el año anterior; desde mayo inicia
  // el ciclo del año en curso.
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentCycle = currentDate.getMonth() <= 3
    ? `${currentYear - 1}-${currentYear}`
    : `${currentYear}-${currentYear + 1}`;
  const registeredCycles = Array.from(new Set(
    visibleGroups.map(group => String(group.year || currentCycle).trim()).filter(Boolean)
  ));
  // Siempre dejamos disponible el ciclo actual para que quede seleccionado,
  // incluso cuando todavía no hay grupos creados en él.
  const cycleOptions = Array.from(new Set([currentCycle, ...registeredCycles]));
  const selectedCycle = groupCycleFilter || currentCycle;

  useEffect(() => {
    if (typeof setGroupCycleFilter !== 'function') return;
    if (!groupCycleFilter || !cycleOptions.includes(groupCycleFilter)) {
      setGroupCycleFilter(cycleOptions.includes(currentCycle) ? currentCycle : (cycleOptions[0] || currentCycle));
    }
  }, [cycleOptions, currentCycle, groupCycleFilter, setGroupCycleFilter]);

  const filteredGroups = visibleGroups
    .filter(group => group.type === 'catequistas' || String(group.year || currentCycle).trim() === selectedCycle)
    .sort((first, second) => Number(second.type === 'catequistas') - Number(first.type === 'catequistas'));

  const handleMigrationSuccess = (studentId, updatedFields) => {
    if (typeof setStudents === 'function') {
      setStudents(prev => prev.map(s => s.id === studentId ? { ...s, ...updatedFields } : s));
    }
  };

  return (
    <div className="space-y-6">
      {/* Botones de acción principales */}
      <div className="border-b border-slate-700 pb-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="min-w-0 flex-1 whitespace-nowrap text-[clamp(0.625rem,3.8vw,1.25rem)] font-bold tracking-tight text-white">Grupos y Listas de Clase</h3>
          <button
            type="button"
            onClick={() => setIsGroupActionsOpen(open => !open)}
            aria-expanded={isGroupActionsOpen}
            className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border px-2 py-2 text-[10px] font-bold transition-colors sm:px-3 sm:text-xs ${themeMode === 'dark' ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}
          >
            Ciclo y acciones
            <MaterialIcon name="expand_more" className={`transition-transform duration-200 ${isGroupActionsOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <div className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${isGroupActionsOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`} aria-hidden={!isGroupActionsOpen}>
          <div inert={!isGroupActionsOpen} className={`min-h-0 overflow-hidden transition-opacity duration-150 motion-reduce:transition-none ${isGroupActionsOpen ? 'opacity-100' : 'opacity-0'}`}>
            <div className="mt-3 space-y-2">
              <select
                id="groups-cycle-filter"
                aria-label="Filtrar por ciclo catequético"
                value={selectedCycle}
                onChange={event => setGroupCycleFilter?.(event.target.value)}
                className={`w-full rounded-xl px-3 py-2.5 text-xs font-bold sm:w-auto sm:min-w-40 ${inputBgClass}`}
              >
                {cycleOptions.map(cycle => <option key={cycle} value={cycle}>{cycle}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                {typeof setIsCreateGroupModalOpen === 'function' && (
                  <button
                    onClick={() => setIsCreateGroupModalOpen(true)}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-red-800 px-3 py-2.5 text-xs font-bold text-white shadow transition hover:bg-red-900"
                  >
                    <MaterialIcon name="add" /> Crear Nuevo Grupo
                  </button>
                )}
                {(activeViewMode === 'admin' || activeViewMode === 'coordinador' || activeViewMode === 'coordinadorGeneral') && (
                  <button type="button" onClick={() => handleExportGroupScheduleImage(selectedCycle)} className="flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2.5 text-xs font-bold text-white shadow transition hover:bg-sky-700"><MaterialIcon name="calendar_month" /> Generar horario</button>
                )}
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white shadow transition hover:bg-emerald-700 sm:col-span-1"
                >
                  <MaterialIcon name="group_add" /> Añadir / Importar Catequizandos
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* VISTA DE TARJETAS DE GRUPOS */}
      <div className="space-y-4">

        {filteredGroups.length === 0 ? (
          <div className={`${cardBgClass} p-8 sm:p-12 rounded-2xl border text-center space-y-4 shadow-sm`}>
            <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto bg-red-900/20 text-red-500 rounded-full flex items-center justify-center text-3xl sm:text-4xl">
              <MaterialIcon name="folder_open" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-lg sm:text-xl font-bold">No hay grupos creados</h3>
              <p className="text-xs sm:text-sm text-slate-400">
                Aún no se ha registrado ningún grupo. Completa el formulario superior para comenzar a organizar tus catequizandos.
              </p>
            </div>
          </div>
        ) : (
          <div className={`grid gap-4 ${
            filteredGroups.length === 1
              ? 'grid-cols-1'
              : filteredGroups.length === 2
              ? 'grid-cols-1 md:grid-cols-2'
              : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
          }`}>
            {filteredGroups.map(group => {
              const isEditing = editingGroupId === group.id;
              const isCatechistGroup = group.type === 'catequistas';
              const assignedCatechists = group.catechistIds && group.catechistIds.length > 0
                ? allUsers.filter(u => group.catechistIds.includes(u.id)).map(u => u.name).join(', ')
                : (group.catechistNames ? group.catechistNames.join(', ') : 'Sin asignar');

              return (
                <div
                  key={group.id}
                  onClick={() => {
                    if (editingGroupId === group.id) return;
                    if (typeof onOpenGroupReports === 'function') onOpenGroupReports(group);
                  }}
                  className={`${cardBgClass} p-5 rounded-2xl border ${isCatechistGroup
                    ? 'border-2 border-amber-400 bg-amber-950/20 shadow-lg shadow-amber-950/20 hover:border-amber-300'
                    : themeMode === 'dark' ? 'border-neutral-800 hover:border-red-900' : 'border-slate-700 hover:border-red-700'} transition-all shadow-sm flex flex-col justify-between cursor-pointer group w-full`}
                >
                  {isEditing && !isCatechistGroup ? (
                    <div className="space-y-4" onClick={(event) => event.stopPropagation()}>
                      <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                        <h4 className="font-bold text-sm text-red-400">Editar Grupo</h4>
                      </div>

                      <div className="space-y-2">
                        <label className={`block text-xs font-bold ${labelTextClass} uppercase`}>Nombre del Grupo</label>
                        <input
                          type="text"
                          value={editGroupName}
                          onChange={(e) => setEditGroupName && setEditGroupName(e.target.value)}
                          className={`w-full rounded-lg px-3 py-2 text-xs sm:text-sm ${inputBgClass}`}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={editGroupLevel}
                          onChange={(e) => setEditGroupLevel && setEditGroupLevel(e.target.value)}
                          className={`rounded-lg px-3 py-2 text-xs sm:text-sm ${inputBgClass}`}
                        >
                          {levelOptions.map(option => <option key={option} value={option}>{option}</option>)}
                        </select>
                        <select
                          value={editGroupYear}
                          onChange={(e) => setEditGroupYear && setEditGroupYear(e.target.value)}
                          className={`rounded-lg px-3 py-2 text-xs sm:text-sm ${inputBgClass}`}
                        >
                          {(() => {
                            const currYear = new Date().getFullYear();
                            return (
                              <>
                                <option value={`${currYear - 1}-${currYear}`}>{`${currYear - 1}-${currYear}`}</option>
                                <option value={`${currYear}-${currYear + 1}`}>{`${currYear}-${currYear + 1}`}</option>
                                <option value={`${currYear + 1}-${currYear + 2}`}>{`${currYear + 1}-${currYear + 2}`}</option>
                              </>
                            );
                          })()}
                        </select>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <select value={editGroupDay || ''} onChange={event => setEditGroupDay && setEditGroupDay(event.target.value)} className={`rounded-lg px-3 py-2 text-xs ${inputBgClass}`}>
                          <option value="">Día...</option>
                          {(groupScheduleOptions.days || []).map(day => <option key={day} value={day}>{day}</option>)}
                        </select>
                        <select value={editGroupTime || ''} onChange={event => setEditGroupTime && setEditGroupTime(event.target.value)} className={`rounded-lg px-3 py-2 text-xs ${inputBgClass}`}>
                          <option value="">Horario...</option>
                          {(groupScheduleOptions.times || []).map(time => <option key={time} value={time}>{time}</option>)}
                        </select>
                        <select value={editGroupRoom || ''} onChange={event => setEditGroupRoom && setEditGroupRoom(event.target.value)} className={`rounded-lg px-3 py-2 text-xs ${inputBgClass}`}>
                          <option value="">Salón...</option>
                          {(groupScheduleOptions.rooms || []).map(room => <option key={room} value={room}>{room}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className={`block text-xs font-bold ${labelTextClass} uppercase mb-2`}>Asignar Catequistas</label>
                        <div className="max-h-40 overflow-y-auto border border-slate-700 rounded-lg p-2 space-y-1">
                          {allUsers
                            .filter(u => (
                              ((u.role === 'catequista' || u.email?.toLowerCase() === 'cmisra2407@gmail.com') && u.diaconiaId === group.diaconiaId) ||
                              (editGroupCatechists || []).includes(u.id)
                            ))
                            .map(u => (
                            <label key={u.id} className="flex items-center gap-2 text-xs sm:text-sm hover:bg-slate-700/30 p-1 rounded">
                              <input
                                type="checkbox"
                                checked={editGroupCatechists && editGroupCatechists.includes(u.id)}
                                onChange={(e) => {
                                  if (!setEditGroupCatechists) return;
                                  if (e.target.checked) {
                                    setEditGroupCatechists([...(editGroupCatechists || []), u.id]);
                                  } else {
                                    setEditGroupCatechists((editGroupCatechists || []).filter(id => id !== u.id));
                                  }
                                }}
                                className="rounded text-red-800 focus:ring-red-800"
                              />
                              {u.name} ({u.email})
                            </label>
                          ))}
                        </div>
                      </div>

                      {(activeViewMode === 'admin' || activeViewMode === 'coordinador' || activeViewMode === 'coordinadorGeneral') && (
                        <div className="pt-2 border-t border-slate-700">
                          <label className="flex items-center gap-2 text-xs font-bold text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editGroupVisibleForCatechists}
                              onChange={(e) => setEditGroupVisibleForCatechists && setEditGroupVisibleForCatechists(e.target.checked)}
                              className="rounded text-red-800 focus:ring-red-800 w-4 h-4"
                            />
                            Visibilidad para Catequistas (Permite que el grupo les aparezca en su panel)
                          </label>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 justify-end">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            if (setEditingGroupId) setEditingGroupId(null);
                          }}
                          className="px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-700/50 rounded-lg font-bold"
                        >
                          Cancelar
                        </button>
                        {activeViewMode !== 'catequista' && typeof handleDuplicateGroup === 'function' && (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDuplicateGroup(group);
                            }}
                            className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold"
                          >
                            ⧉ Duplicar Grupo
                          </button>
                        )}
                        {typeof handleSaveGroupEdit === 'function' && (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              handleSaveGroupEdit();
                            }}
                            className="px-3 py-1.5 text-xs bg-red-800 hover:bg-red-900 text-white rounded-lg font-bold"
                          >
                            Guardar Cambios
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="flex justify-between items-start gap-2">
                          <h3 className="text-base sm:text-lg font-bold">{group.name}</h3>
                          {group.isVisibleForCatechists === false && (
                            <span className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide ${themeMode === 'dark' ? 'border-rose-400/60 bg-rose-400/15 text-rose-300' : 'border-rose-500/60 bg-rose-100 text-rose-800'}`}>
                              <MaterialIcon name="lock" /> Oculto para Catequistas
                            </span>
                          )}
                          {!isCatechistGroup && <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${themeMode === 'dark' ? 'bg-neutral-900 text-neutral-300' : 'bg-slate-200 text-slate-600'}`}>
                            {group.level || 'Cate-Kinder'}
                          </span>}
                        </div>
                        <div className="flex justify-between items-center mt-2">
                          <p className={`text-xs ${mutedTextClass}`}>Año:</p>
                          <span className={`text-xs px-2 py-0.5 rounded font-mono ${themeMode === 'dark' ? 'bg-neutral-900 text-neutral-300' : 'bg-slate-200 text-slate-600'}`}>
                            {group.year || '2026-2027'}
                          </span>
                        </div>
                        {!isCatechistGroup && (
                          <>
                            <p className={`text-xs mt-2 ${mutedTextClass}`}>Catequistas encargados:</p>
                            <p className={`text-xs sm:text-sm font-semibold ${themeMode === 'dark' ? 'text-red-400' : 'text-red-700'}`}>{assignedCatechists}</p>
                          </>
                        )}
                        {isCatechistGroup && group.diaconiaName && (
                          <p className={`text-xs mt-2 ${softTextClass}`}>Diaconía: {group.diaconiaName}</p>
                        )}
                        <p className={`text-xs mt-2 ${softTextClass}`}>
                          {isCatechistGroup
                            ? `Catequistas registrados: ${catechistGroupMembers.filter(member => member.groupId === group.id).length}`
                            : `Catequizandos matriculados: ${visibleStudents.filter(s => s.groupId === group.id).length}`}
                        </p>
                        {(group.scheduleDay || group.scheduleTime || group.room) && (
                          <p className="text-xs mt-2 text-sky-600 dark:text-sky-300 font-semibold">
                            <MaterialIcon name="event" /> {group.scheduleDay || 'Sin día'} · {group.scheduleTime || 'Sin horario'} · {group.room || 'Sin salón'}
                          </p>
                        )}
                      </div>

                      {!isCatechistGroup && (activeViewMode === 'admin' || activeViewMode === 'coordinador' || activeViewMode === 'coordinadorGeneral') && (
                        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-700 pt-4">
                          {typeof handleStartEditGroup === 'function' && (
                            <button
                              onClick={(event) => { event.stopPropagation(); handleStartEditGroup(group); }}
                              className="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg font-bold transition-colors"
                            >
                              <MaterialIcon name="settings" /> Configuración del Grupo
                            </button>
                          )}

                          {activeViewMode === 'admin' && typeof handleDeleteGroup === 'function' && (
                            <button
                              onClick={(event) => { event.stopPropagation(); handleDeleteGroup(group.id); }}
                              className="text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 px-3 py-1.5 rounded-lg font-bold transition-colors"
                            >
                              <MaterialIcon name="delete" /> Eliminar
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ExpedienteMigrationModal
        student={selectedStudentForMigration}
        isOpen={Boolean(selectedStudentForMigration)}
        onClose={() => setSelectedStudentForMigration(null)}
        cardBgClass={cardBgClass}
        inputBgClass={inputBgClass}
        onSuccess={handleMigrationSuccess}
      />
    </div>
  );
}
