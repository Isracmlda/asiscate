export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = '¿Estás seguro?',
  description = 'Esta acción no se puede deshacer.',
  confirmText = 'Eliminar',
  cancelText = 'Cancelar',
  isDanger = true,
  isLoading = false,
  themeMode = 'dark'
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div
        className={`w-full max-w-md rounded-2xl p-6 border shadow-2xl space-y-5 transition-all ${
          themeMode === 'dark'
            ? 'bg-slate-900 border-slate-700 text-white'
            : 'bg-white border-slate-200 text-slate-800'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ícono superior y Título */}
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-xl font-bold ${
            isDanger ? 'bg-rose-500/15 text-rose-500 border border-rose-500/30' : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
          }`}>
            {isDanger ? '🗑️' : '⚠️'}
          </div>
          <div className="space-y-1 pr-2">
            <h3 className="text-base sm:text-lg font-bold leading-snug">
              {title}
            </h3>
            <div className={`text-xs sm:text-sm leading-relaxed font-normal ${
              themeMode === 'dark' ? 'text-slate-300' : 'text-slate-600'
            }`}>
              {description}
            </div>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex justify-end items-center gap-3 pt-2 border-t border-slate-700/50">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors ${
              themeMode === 'dark'
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
            }`}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-5 py-2 rounded-xl text-xs sm:text-sm font-bold text-white transition-all shadow-md flex items-center gap-2 ${
              isDanger
                ? 'bg-rose-700 hover:bg-rose-800 disabled:bg-rose-900/60'
                : 'bg-amber-600 hover:bg-amber-700 disabled:bg-amber-800/60'
            }`}
          >
            {isLoading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>Procesando...</span>
              </>
            ) : (
              <span>{confirmText}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
