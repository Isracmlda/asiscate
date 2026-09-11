import React from 'react';

export function UserManagementView({
  cardBgClass,
  activeViewMode,
  managedUsers,
  themeMode,
  userRole,
  user,
  inputBgClass,
  handleChangeRole,
  handleUpdateUserTerritory,
  parroquias,
  diaconias,
  handleApproveUser,
  handleToggleActiveUser,
  handleDeleteUser,
  handleAddAllowedEmail,
  newAllowedEmailInput,
  setNewAllowedEmailInput,
  allowedEmails,
  handleDeleteAllowedEmail
}) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl sm:text-2xl font-bold">
        {activeViewMode === 'admin' ? 'Control de Usuarios, Roles y Jurisdicción' : 'Gestión de Catequistas de la Diaconía'}
      </h2>
      <div className={`${cardBgClass} rounded-xl border shadow-sm overflow-x-auto`}>
        <table className="min-w-full divide-y divide-slate-700 text-xs sm:text-sm">
          <thead className={themeMode === 'dark' ? 'bg-black' : 'bg-slate-50'}>
            <tr>
              <th className="px-6 py-3 text-left font-bold text-slate-400 uppercase">Usuario</th>
              <th className="px-6 py-3 text-left font-bold text-slate-400 uppercase">Rol</th>
              <th className="px-6 py-3 text-left font-bold text-slate-400 uppercase">Ubicación</th>
              <th className="px-6 py-3 text-left font-bold text-slate-400 uppercase">Estado</th>
              <th className="px-6 py-3 text-right font-bold text-slate-400 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {managedUsers.map((u) => {
              const isApproved = u.approved !== false;
              const isActive = u.active !== false;
              const isProtectedByRole = !['admin'].includes(userRole) && (
                u.role === 'admin' || (userRole === 'coordinador' && u.role === 'coordinadorGeneral')
              );
              const isProtectedAccount = ['cmisra2407@gmail.com', 'asiscate.elcarmen@gmail.com'].includes(u.email?.toLowerCase());
              const canModifyUser = u.id !== user.uid && !isProtectedByRole && !isProtectedAccount;
              return (
                <tr key={u.id}>
                  <td className="px-6 py-4 font-semibold">
                    <div>{u.name}</div>
                    <div className="text-xs text-slate-400 font-normal">{u.email}</div>
                    {u.phone && <div className="text-[11px] text-slate-500 font-mono">{u.phone}</div>}
                  </td>
                  <td className="px-6 py-4">
                    {(userRole === 'admin' || userRole === 'coordinadorGeneral') && activeViewMode !== 'coordinador' && canModifyUser ? (
                      <select
                        value={u.role}
                        onChange={(e) => handleChangeRole(u.id, e.target.value)}
                        className={`rounded px-2 py-1 text-xs font-bold ${inputBgClass}`}
                      >
                        <option value="catequista">Catequista</option>
                        <option value="coordinador">Coordinador</option>
                        {userRole === 'admin' && activeViewMode !== 'coordinadorGeneral' && <option value="admin">Administrador</option>}
                        {userRole === 'admin' && activeViewMode !== 'coordinadorGeneral' && <option value="coordinadorGeneral">Coordinador General</option>}
                      </select>
                    ) : (
                      <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                        u.role === 'admin' ? 'bg-rose-100 text-rose-700' : u.role === 'coordinador' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-800'
                      }`}>
                        {u.role}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <select
                        disabled={activeViewMode !== 'admin' || !canModifyUser}
                        value={u.parroquiaId || ''}
                        onChange={(e) => handleUpdateUserTerritory(u.id, e.target.value, '')}
                        className={`rounded px-2 py-1 text-xs ${inputBgClass}`}
                      >
                        <option value="">Parroquia...</option>
                        {parroquias.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>

                      <select
                        disabled={(activeViewMode !== 'admin' && activeViewMode !== 'coordinadorGeneral') || !u.parroquiaId || !canModifyUser}
                        value={u.diaconiaId || ''}
                        onChange={(e) => handleUpdateUserTerritory(u.id, u.parroquiaId, e.target.value)}
                        className={`rounded px-2 py-1 text-xs ${inputBgClass}`}
                      >
                        <option value="">Diaconía...</option>
                        {diaconias.filter(d => d.parroquiaId === u.parroquiaId).map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1 items-start">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        isApproved ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                      }`}>
                        {isApproved ? '✓ Aprobado' : '⏳ Pendiente Aprobación'}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        isActive ? 'bg-sky-500/10 text-sky-400 border border-sky-500/30' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                      }`}>
                        {isActive ? '● Activo' : '○ Inactivo'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {canModifyUser && (
                        <>
                          {!isApproved && (
                            <button
                              onClick={() => handleApproveUser(u.id)}
                              className="text-xs px-2.5 py-1 rounded-lg font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors"
                            >
                              Aprobar
                            </button>
                          )}
                          <button
                            onClick={() => handleToggleActiveUser(u.id, isActive)}
                            className={`text-xs px-2.5 py-1 rounded-lg font-bold transition-colors ${
                              isActive 
                                ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' 
                                : 'bg-sky-600 hover:bg-sky-700 text-white'
                            }`}
                          >
                            {isActive ? 'Desactivar' : 'Activar'}
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 px-2.5 py-1 rounded-lg font-bold transition-colors"
                          >
                            Eliminar
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* SECCIÓN CORREOS PREAUTORIZADOS */}
      <div className={`${cardBgClass} p-4 sm:p-6 rounded-xl border shadow-sm space-y-4`}>
        <div>
          <h3 className="text-base sm:text-lg font-bold">Correos Preautorizados (Aprobación Automática)</h3>
          <p className="text-xs text-slate-400">
            Agrega correos electrónicos a esta lista. Si un nuevo usuario se registra con un correo que coincida con esta lista, su perfil se **aprobará automáticamente** y el correo será removido de esta lista.
          </p>
        </div>

        <form onSubmit={handleAddAllowedEmail} className="flex gap-2 max-w-md">
          <input
            type="email"
            required
            placeholder="ejemplo@gmail.com"
            value={newAllowedEmailInput}
            onChange={(e) => setNewAllowedEmailInput(e.target.value)}
            className={`flex-1 rounded-lg px-3 py-2 text-xs sm:text-sm ${inputBgClass}`}
          />
          <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition-colors shadow"
          >
            + Agregar Correo
          </button>
        </form>

        <div className="space-y-2 pt-2 border-t border-slate-700">
          <span className="text-xs font-bold text-slate-400 uppercase block">
            Lista de Correos Pendientes de Registro ({allowedEmails.length}):
          </span>
          {allowedEmails.length === 0 ? (
            <p className="text-xs italic text-slate-400">No hay correos en la lista de preautorización.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {allowedEmails.map(item => (
                <div key={item.id} className="bg-slate-800/80 border border-slate-700 rounded-xl p-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="font-mono text-xs text-emerald-300 font-semibold block truncate">{item.email}</span>
                    <span className="text-[10px] text-slate-400 block">Añadido: {item.createdAt?.split('T')[0] || 'Reciente'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteAllowedEmail(item.id)}
                    className="text-xs text-rose-400 hover:text-rose-300 px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 font-bold transition-colors flex-shrink-0"
                    title="Eliminar de lista"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
