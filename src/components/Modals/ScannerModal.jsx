import React from 'react';

export function ScannerModal({
  scannerModal,
  setScannerModal,
  cardBgClass,
  videoRef
}) {
  if (!scannerModal?.open) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[70] flex justify-center items-center p-4">
      <div className={`${cardBgClass} rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4`}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">
            {scannerModal.type === 'payment'
              ? 'Escanear QR de comprobante de pago'
              : scannerModal.type === 'certificate'
                ? 'Escanear QR de certificado'
                : 'Escanear QR de asistencia'}
          </h3>
          <button type="button" onClick={() => setScannerModal(null)} aria-label="Cerrar" className="bg-rose-700 hover:bg-rose-800 text-white px-2.5 py-1 rounded-lg text-lg font-bold leading-none">✕</button>
        </div>
        {scannerModal.status === 'ok' ? (
          <div className="text-center p-5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-2">
            <div className="text-4xl text-emerald-500 font-bold">✓</div>
            <div className="text-emerald-500 font-bold text-base">¡Resultado Encontrado!</div>
            <p className="text-xs text-slate-300 font-medium">
              {scannerModal.type === 'payment'
                ? `Comprobante encontrado: ${scannerModal.result}`
                : scannerModal.type === 'certificate'
                  ? `Certificado encontrado: ${scannerModal.result}`
                  : `Asistencia marcada para: ${scannerModal.result}`}
            </p>
            <p className="text-[11px] text-slate-400 mt-2 italic">Cerrando en 2 segundos...</p>
          </div>
        ) : scannerModal.status === 'not_found' ? (
          <div className="text-center p-5 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-2">
            <div className="text-4xl text-rose-500 font-bold">✕</div>
            <div className="text-rose-500 font-bold text-base">Sin Resultados</div>
            <p className="text-xs text-slate-300 font-medium">
              {scannerModal.type === 'payment'
                ? `No se encontró ningún comprobante para: ${scannerModal.result}`
                : scannerModal.type === 'certificate'
                  ? `No se encontró ningún certificado para: ${scannerModal.result}`
                  : `No se encontró el catequizando: ${scannerModal.result}`}
            </p>
            <p className="text-[11px] text-slate-400 mt-2 italic">Cerrando en 2 segundos...</p>
          </div>
        ) : (
          <>
            <video ref={videoRef} className="w-full rounded-xl bg-black" playsInline muted autoPlay />
            <p className="text-xs text-slate-400 text-center">
              {scannerModal.type === 'payment'
                ? 'Apunta la cámara al código QR de la factura o comprobante.'
                : scannerModal.type === 'certificate'
                  ? 'Apunta la cámara al código QR impreso en el certificado.'
                  : 'Apunta la cámara al carnet del catequizando para marcar asistencia automáticamente.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
