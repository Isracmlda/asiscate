import React from 'react';

export function QrModal({
  qrModal,
  setQrModal,
  qrCardLoading,
  setQrCardLoading,
  qrCardRef,
  cardBgClass,
  handleCopyQrCardImage
}) {
  if (!qrModal) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[60] flex justify-center items-center p-4">
      <div className={`${cardBgClass} rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4`}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">{qrModal.title}</h3>
          <button type="button" onClick={() => { setQrModal(null); setQrCardLoading(false); }} aria-label="Cerrar" className="bg-rose-700 hover:bg-rose-800 text-white px-2.5 py-1 rounded-lg text-lg font-bold leading-none">✕</button>
        </div>

        {qrCardLoading ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="w-12 h-12 border-4 border-amber-200 border-t-[#8b6b23] rounded-full animate-spin" />
            <p className="text-sm text-slate-400">Preparando carnet...</p>
          </div>
        ) : (
          <>
            <div className="flex justify-center">
              <div
                ref={qrCardRef}
                className="w-[420px] h-[252px] bg-[#fdfbf7] border-4 double border-[#b08d57] rounded-xl p-4 flex items-center justify-between font-serif relative overflow-hidden box-border select-none"
              >
                <div className="w-[58%] h-full flex flex-col justify-center pr-4 border-r border-dashed border-[#d4c5b0]">
                  <div>
                    <div className="inline-flex items-center gap-1.5 bg-[#f4ece1] text-[#6b4d27] text-[10px] font-bold px-2.5 py-1 rounded border border-[#e2d4c0] uppercase tracking-wider font-sans mb-2">
                      <span className="text-[#8b6b23]">┼</span> Catequesis Parroquial
                    </div>
                    <h2 className="text-sm font-bold text-[#4a351a] uppercase tracking-wide leading-tight">
                      Carnet de Catequizando
                    </h2>
                    <p className="text-[11px] text-[#8c7355] italic mb-3">
                      Parroquia {qrModal.parroquia || 'Parroquia'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <p className="text-[9px] font-bold text-[#a38c70] uppercase tracking-wider font-sans">
                        Nombre del Alumno(a)
                      </p>
                      <p className="text-xs font-bold text-[#362411] truncate">
                        {qrModal.name || qrModal.title}
                      </p>
                    </div>

                    <div>
                      <p className="text-[9px] font-bold text-[#a38c70] uppercase tracking-wider font-sans mb-0.5">
                        Nivel Asignado
                      </p>
                      <span className="inline-block bg-[#efe6d5] text-[#5c4018] border border-[#c9b497] text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider font-sans">
                        {(qrModal.level || '').toLowerCase() === 'cate-kinder' ? 'CATE-KINDER' : (qrModal.level || '').toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="w-[42%] h-full flex flex-col items-center justify-center pl-4">
                  <div className="w-32 h-32 bg-[#faf6f0] border-2 border-dashed border-[#b08d57] rounded-xl flex items-center justify-center p-2 shadow-xs">
                    <img
                      src={qrModal.imageUrl}
                      alt="Código QR"
                      className="w-full h-full object-contain rounded-lg"
                      onLoad={() => setQrCardLoading(false)}
                      onError={() => setQrCardLoading(false)}
                    />
                  </div>
                  <p className="text-[10px] font-medium text-[#8c7355] mt-2 italic">
                    Escanear para verificar
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <a href={qrModal.imageUrl} target="_blank" rel="noreferrer" download className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-center px-4 py-2 rounded-lg text-xs font-bold">Descargar QR</a>
              <button type="button" onClick={handleCopyQrCardImage} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-xs font-bold">Copiar imagen</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
