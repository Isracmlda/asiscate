
import { useEffect, useRef, useState } from 'react';

export function QrModal({
  qrModal,
  setQrModal,
  qrCardLoading,
  setQrCardLoading,
  qrCardRef,
  cardBgClass,
  handleCopyQrCardImage,
  handleDownloadQrCardImage
}) {
  const cardPreviewRef = useRef(null);
  const [cardScale, setCardScale] = useState(1);

  useEffect(() => {
    const preview = cardPreviewRef.current;
    if (!preview || qrCardLoading || !qrModal) return;

    const updateScale = () => setCardScale(Math.min(1, preview.clientWidth / 420));
    updateScale();

    const observer = new ResizeObserver(updateScale);
    observer.observe(preview);
    return () => observer.disconnect();
  }, [qrCardLoading, qrModal]);

  if (!qrModal) return null;
  const isCatechistCard = qrModal.type === 'catechist';
  const cardLevel = (qrModal.level || '').replace(/\s*\(Primera Comunión\)$/i, '').trim();

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
            <div className="flex w-full justify-center">
              <div ref={cardPreviewRef} className="relative aspect-[5/3] w-full max-w-[420px] overflow-hidden">
                <div
                  className="absolute left-0 top-0"
                  style={{ width: 420, height: 252, transform: `scale(${cardScale})`, transformOrigin: 'top left' }}
                >
                  <div
                    ref={qrCardRef}
                    className="h-[252px] w-[420px] shrink-0 bg-[#fdfbf7] border-4 double border-[#b08d57] rounded-xl p-4 flex items-center justify-between font-serif relative overflow-hidden box-border select-none"
                  >
                    <div className="w-[58%] h-full flex flex-col justify-center gap-3 pr-4 border-r border-dashed border-[#d4c5b0]">
                      <div>
                        <p className="mb-2 whitespace-normal break-words text-base font-black leading-tight text-[#362411]">
                          {qrModal.parroquia || 'Parroquia'}
                        </p>
                        <h2 className="text-sm font-bold text-[#4a351a] uppercase tracking-wide leading-tight">
                          {isCatechistCard ? 'Carnet de Catequista' : 'Carnet de Catequizando'}
                        </h2>
                      </div>

                      <div className="space-y-3">
                        <div>
                          {isCatechistCard && (
                            <p className="text-[9px] font-bold text-[#a38c70] uppercase tracking-wider font-sans">
                              Nombre del Catequista
                            </p>
                          )}
                          <p className="whitespace-normal break-words text-sm font-bold leading-snug text-[#362411]">
                            {qrModal.name || qrModal.title}
                          </p>
                        </div>

                        <div>
                          {isCatechistCard && (
                            <p className="text-[9px] font-bold text-[#a38c70] uppercase tracking-wider font-sans mb-0.5">
                              Diaconía
                            </p>
                          )}
                          <span className="inline-block bg-[#efe6d5] text-[#5c4018] border border-[#c9b497] text-[10px] font-bold px-3 py-0.5 rounded-full tracking-wider font-sans">
                            {cardLevel.toLowerCase() === 'cate-kinder' ? 'CATE-KINDER' : cardLevel.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="w-[42%] h-full flex flex-col items-center justify-center pl-4">
                      <div className="h-[140px] w-[140px] border border-black bg-white p-1">
                        <img
                          src={qrModal.imageUrl}
                          alt="Código QR"
                          className="h-full w-full object-contain [image-rendering:pixelated] [image-rendering:crisp-edges]"
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
              </div>
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={handleDownloadQrCardImage} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold">Descargar carnet</button>
              <button type="button" onClick={handleCopyQrCardImage} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-xs font-bold">Copiar carnet</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
