import { useRef, useState } from 'react';
import { MaterialIcon } from '../Shared/MaterialIcon';
import { createInventoryLabelPdf, createInventoryQrPayload, downloadInventoryLabelsZip, getInventoryQrImageUrl } from '../../utils/inventoryLabels';

export function InventoryLabelsModal({ asset, location, onClose }) {
  const [unit, setUnit] = useState(1);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const labelPreviewRef = useRef(null);
  const total = Math.max(1, Number(asset?.stock) || 1);
  if (!asset) return null;

  const exportCurrent = async () => {
    setBusy(true);
    try {
      const pdf = await createInventoryLabelPdf(asset, unit, location);
      pdf.save(`etiqueta-${String(asset.name || 'activo').replace(/[^\p{L}\p{N}-]+/gu, '-')}-${unit}.pdf`);
    } catch (error) {
      console.error('Error exportando etiqueta de inventario:', error);
      window.alert(error?.message || 'No se pudo generar la etiqueta.');
    } finally {
      setBusy(false);
    }
  };

  const exportAll = async () => {
    setBusy(true);
    try {
      await downloadInventoryLabelsZip(asset, location);
    } catch (error) {
      console.error('Error exportando ZIP de etiquetas:', error);
      window.alert(error?.message || 'No se pudieron exportar las etiquetas.');
    } finally {
      setBusy(false);
    }
  };

  const copyLabel = async () => {
    if (!labelPreviewRef.current) return;
    setBusy(true);
    try {
      const { toBlob, toPng } = await import('html-to-image');
      const blob = await toBlob(labelPreviewRef.current, { pixelRatio: 4, backgroundColor: '#ffffff', cacheBust: true });
      if (!blob) throw new Error('No se pudo preparar la imagen de la etiqueta.');
      if (navigator.clipboard?.write && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      } else {
        const dataUrl = await toPng(labelPreviewRef.current, { pixelRatio: 4, backgroundColor: '#ffffff', cacheBust: true });
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `etiqueta-${String(asset.name || 'activo').replace(/[^\p{L}\p{N}-]+/gu, '-')}-${unit}.png`;
        link.click();
        window.alert('Este navegador no permite copiar imágenes; descargué la etiqueta en PNG.');
      }
    } catch (error) {
      console.error('Error copiando etiqueta:', error);
      window.alert('No se pudo copiar la etiqueta. Prueba descargarla en PDF.');
    } finally {
      setBusy(false);
    }
  };

  const payload = createInventoryQrPayload(asset.id, unit);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="inventory-label-title" className="w-full max-w-lg space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-4 text-white shadow-2xl sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div><h3 id="inventory-label-title" className="font-bold">Etiqueta de {asset.kind === 'furniture' ? 'mobiliario' : 'activo'}</h3><p className="text-xs text-slate-400">50 × 30 mm · {asset.name}</p></div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg bg-slate-800 px-2.5 py-1 text-lg">×</button>
        </div>
        <div ref={labelPreviewRef} className="mx-auto flex w-full max-w-[400px] items-center gap-3 rounded-md bg-white p-2 text-slate-900 shadow" style={{ aspectRatio: '5 / 3' }}>
          <img src={getInventoryQrImageUrl(payload, 240)} alt={`Código QR de ${asset.name}, número ${unit}`} className="h-[76%] aspect-square shrink-0 object-contain" />
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="mt-1 whitespace-normal break-words text-[10px] leading-tight">{location.parish || 'Parroquia'}</p>
            <p className="whitespace-normal break-words text-[10px] leading-tight">Diaconía: {location.diaconia || 'Diaconía'}</p>
            {asset.kind === 'furniture' && <p className="whitespace-normal break-words text-[10px] leading-tight">Aula: {asset.room || 'Salón'}</p>}
            <p className="mt-1 whitespace-normal break-words text-sm font-bold leading-tight">{asset.name} #{unit}</p>
          </div>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-slate-700 p-2">
          <span className="text-xs text-slate-300">Unidad {unit} de {total}</span>
          <div className="flex items-center gap-2"><button type="button" onClick={() => setUnit(value => Math.max(1, value - 1))} disabled={unit <= 1} className="h-8 w-8 rounded-lg bg-slate-800 disabled:opacity-40" aria-label="Etiqueta anterior"><MaterialIcon name="chevron_left" /></button><button type="button" onClick={() => setUnit(value => Math.min(total, value + 1))} disabled={unit >= total} className="h-8 w-8 rounded-lg bg-slate-800 disabled:opacity-40" aria-label="Etiqueta siguiente"><MaterialIcon name="chevron_right" /></button></div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" disabled={busy} onClick={copyLabel} className="flex items-center justify-center gap-1 rounded-xl bg-red-700 px-2 py-2.5 text-[11px] font-bold hover:bg-red-600 disabled:opacity-50"><MaterialIcon name={copied ? 'check' : 'content_copy'} /> Copiar</button>
          <button type="button" disabled={busy} onClick={exportCurrent} className="flex items-center justify-center gap-1 rounded-xl bg-sky-600 px-2 py-2.5 text-[11px] font-bold hover:bg-sky-500 disabled:opacity-50"><MaterialIcon name="download" /> Descargar</button>
          <button type="button" disabled={busy} onClick={exportAll} className="flex items-center justify-center gap-1 rounded-xl bg-emerald-600 px-2 py-2.5 text-[11px] font-bold hover:bg-emerald-500 disabled:opacity-50"><MaterialIcon name="folder_zip" /> {busy ? 'Preparando…' : `ZIP (${total})`}</button>
        </div>
      </div>
    </div>
  );
}
