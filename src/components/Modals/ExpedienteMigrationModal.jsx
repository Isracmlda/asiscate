import React, { useState, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { APPS_SCRIPT_URL } from '../../utils/constants';
import { fileToBase64, compressImage } from '../../utils/documentProcessor';

export function ExpedienteMigrationModal({
  student,
  isOpen,
  onClose,
  cardBgClass = 'bg-slate-800',
  inputBgClass = 'bg-slate-900',
  onSuccess
}) {
  if (!isOpen || !student) return null;

  const currentYear = new Date().getFullYear();
  const [cycle, setCycle] = useState(student.cycle || `${currentYear}-${currentYear + 1}`);

  // Archivos
  const [minorIdFile, setMinorIdFile] = useState(null);
  const [baptismFile, setBaptismFile] = useState(null);
  const [communionFile, setCommunionFile] = useState(null);

  // Pendientes
  const [minorIdPending, setMinorIdPending] = useState(student.documents?.minorId?.status === 'PENDING');
  const [baptismPending, setBaptismPending] = useState(student.documents?.bautismo?.status === 'PENDING');
  const [communionPending, setCommunionPending] = useState(student.documents?.comunion?.status === 'PENDING');

  // Firma
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureData, setSignatureData] = useState(null);

  const [isSaving, setIsSaving] = useState(false);

  // Firma canvas handlers
  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;
    ctx.lineTo(x, y);
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing && canvasRef.current) {
      setIsDrawing(false);
      setSignatureData(canvasRef.current.toDataURL('image/png'));
    }
  };

  const clearCanvas = () => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setSignatureData(null);
  };

  const uploadToDrive = async (base64, fileName, contentType = 'application/pdf') => {
    if (!base64 || !APPS_SCRIPT_URL) return null;
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'uploadFile',
          fileName: `${student.name || student.fullName}_${fileName}`,
          fileBase64: base64,
          contentType: contentType
        })
      });
      const res = await response.json();
      return res.status === 'success' ? res.fileUrl : null;
    } catch (err) {
      console.error('Error subiendo archivo:', err);
      return null;
    }
  };

  const handleSaveMigration = async (e) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      let signatureUrl = student.family?.guardian?.signatureUrl || null;
      if (signatureData) {
        const signatureCleanB64 = signatureData.split(',')[1];
        signatureUrl = await uploadToDrive(signatureCleanB64, 'Firma_Migracion.png', 'image/png');
      }

      let minorIdUrl = student.documents?.minorId?.url || null;
      if (minorIdFile && !minorIdPending) {
        const b64 = minorIdFile.type === 'application/pdf' ? await fileToBase64(minorIdFile) : (await compressImage(minorIdFile)).split(',')[1];
        minorIdUrl = await uploadToDrive(b64, 'Cedula_Menor.pdf', minorIdFile.type);
      }

      let baptismUrl = student.documents?.bautismo?.url || null;
      if (baptismFile && !baptismPending) {
        const b64 = baptismFile.type === 'application/pdf' ? await fileToBase64(baptismFile) : (await compressImage(baptismFile)).split(',')[1];
        baptismUrl = await uploadToDrive(b64, 'Bautismo.pdf', baptismFile.type);
      }

      let communionUrl = student.documents?.comunion?.url || null;
      if (communionFile && !communionPending) {
        const b64 = communionFile.type === 'application/pdf' ? await fileToBase64(communionFile) : (await compressImage(communionFile)).split(',')[1];
        communionUrl = await uploadToDrive(b64, 'Comunion.pdf', communionFile.type);
      }

      const updatedFields = {
        cycle: cycle,
        documents: {
          minorId: { status: minorIdPending ? 'PENDING' : (minorIdUrl ? 'COMPLETED' : 'NOT_REQUIRED'), url: minorIdUrl },
          bautismo: { status: baptismPending ? 'PENDING' : (baptismUrl ? 'COMPLETED' : 'NOT_REQUIRED'), url: baptismUrl },
          comunion: { status: communionPending ? 'PENDING' : (communionUrl ? 'COMPLETED' : 'NOT_REQUIRED'), url: communionUrl }
        },
        expedienteStatus: 'COMPLETED'
      };

      if (signatureUrl) {
        updatedFields['family.guardian.signatureUrl'] = signatureUrl;
      }
      if (signatureData) {
        updatedFields['family.guardian.signatureData'] = signatureData;
      }

      await updateDoc(doc(db, 'students', student.id), updatedFields);

      if (typeof onSuccess === 'function') {
        onSuccess(student.id, updatedFields);
      }

      onClose();
    } catch (err) {
      console.error('Error al actualizar expediente:', err);
      alert('No se pudo actualizar el expediente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className={`${cardBgClass} rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4 my-8`}>
        <div className="flex justify-between items-center border-b border-slate-700 pb-2">
          <div>
            <h3 className="text-lg font-bold text-white">Complementar Expediente Digital</h3>
            <p className="text-xs text-slate-400">{student.name || student.fullName}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white font-bold text-sm">
            ✕
          </button>
        </div>

        <form onSubmit={handleSaveMigration} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Ciclo Catequético</label>
            <select value={cycle} onChange={(e) => setCycle(e.target.value)} className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`}>
              <option value={`${currentYear - 1}-${currentYear}`}>{`${currentYear - 1}-${currentYear}`}</option>
              <option value={`${currentYear}-${currentYear + 1}`}>{`${currentYear}-${currentYear + 1}`}</option>
            </select>
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-bold text-amber-400 uppercase">Documentos Faltantes</label>

            {/* Constancia Bautismo */}
            <div className="border border-slate-700/60 p-3 rounded-xl space-y-1">
              <label className="block text-xs font-semibold text-slate-300">Constancia de Bautismo</label>
              <input type="file" accept="image/*,application/pdf" onChange={(e) => setBaptismFile(e.target.files[0])} className="w-full text-xs text-slate-400" />
              <label className="inline-flex items-center text-xs text-slate-400 cursor-pointer pt-1">
                <input type="checkbox" checked={baptismPending} onChange={(e) => setBaptismPending(e.target.checked)} className="mr-2 rounded text-red-800" />
                Queda pendiente de entregar
              </label>
            </div>

            {/* Cédula Menor */}
            <div className="border border-slate-700/60 p-3 rounded-xl space-y-1">
              <label className="block text-xs font-semibold text-slate-300">Cédula de Menor (Si aplica)</label>
              <input type="file" accept="image/*,application/pdf" onChange={(e) => setMinorIdFile(e.target.files[0])} className="w-full text-xs text-slate-400" />
              <label className="inline-flex items-center text-xs text-slate-400 cursor-pointer pt-1">
                <input type="checkbox" checked={minorIdPending} onChange={(e) => setMinorIdPending(e.target.checked)} className="mr-2 rounded text-red-800" />
                Queda pendiente de entregar
              </label>
            </div>

            {/* Comunión */}
            <div className="border border-slate-700/60 p-3 rounded-xl space-y-1">
              <label className="block text-xs font-semibold text-slate-300">Comprobante de Comunión</label>
              <input type="file" accept="image/*,application/pdf" onChange={(e) => setCommunionFile(e.target.files[0])} className="w-full text-xs text-slate-400" />
              <label className="inline-flex items-center text-xs text-slate-400 cursor-pointer pt-1">
                <input type="checkbox" checked={communionPending} onChange={(e) => setCommunionPending(e.target.checked)} className="mr-2 rounded text-red-800" />
                Queda pendiente de entregar
              </label>
            </div>
          </div>

          {/* Firma */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-400 uppercase">Firma Digital del Encargado</label>
            <div className="flex flex-col items-center">
              <canvas
                ref={canvasRef}
                width={360}
                height={140}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="border-2 border-dashed border-slate-600 bg-white rounded-xl touch-none"
              />
              <button type="button" onClick={clearCanvas} className="mt-1 text-xs text-rose-400 hover:underline">
                Limpiar firma
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs text-slate-400 hover:text-white">
              Cancelar
            </button>
            <button type="submit" disabled={isSaving} className="bg-red-800 hover:bg-red-900 text-white font-bold px-4 py-2 rounded-lg text-xs">
              {isSaving ? 'Guardando...' : 'Guardar Expediente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
