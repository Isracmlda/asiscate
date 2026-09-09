import React, { useState } from 'react';
import { collection, addDoc, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { jsPDF } from 'jspdf';

export default function EnrollmentDashboardView({
  currentUser,
  userRole,
  cardBgClass,
  inputBgClass,
  isEnrollmentEnabled,
  setIsEnrollmentEnabled,
  students = [],
  paymentRecords = [],
  groups = [],
  parroquias = [],
  diaconias = [],
  setGroups,
  setStudents,
  handleDeleteStudent,
  handleStartEditStudent,
  allUsers = [],
  fetchAllData
}) {
  const currentYear = new Date().getFullYear();
  const [selectedCycle, setSelectedCycle] = useState(`${currentYear}-${currentYear + 1}`);

  // Estado menú desplegable de permisos por usuario
  const [isUsersPermissionOpen, setIsUsersPermissionOpen] = useState(false);

  // Modales
  const [selectedLevelModal, setSelectedLevelModal] = useState(null);
  const [selectedStudentDetail, setSelectedStudentDetail] = useState(null);

  // Asistente de Creación/Asignación Masiva
  const [targetLevel, setTargetLevel] = useState('Primer Nivel');
  const [groupChoiceMode, setGroupChoiceMode] = useState('NEW'); // 'NEW' | 'EXISTING'
  const [selectedExistingGroupId, setSelectedExistingGroupId] = useState('');
  const [groupNameSuffix, setGroupNameSuffix] = useState('Sección A');
  const [isCreatingGroups, setIsCreatingGroups] = useState(false);
  const [creationMessage, setCreationMessage] = useState(null);

  const levelsList = [
    'Cate-Kinder',
    'Primer Nivel',
    'Segundo Nivel',
    'Tercer Nivel (Primera Comunión)',
    'Cuarto Nivel',
    'Quinto Nivel',
    'Sexto Nivel',
    'Septimo Nivel',
    'Confirma'
  ];

  // 1. Persistencia de estado Habilitado / Deshabilitado general
  const handleToggleEnrollment = async (enabled) => {
    setIsEnrollmentEnabled(enabled);
    try {
      await setDoc(doc(db, 'config', 'enrollment'), {
        enabled: enabled,
        updatedBy: currentUser?.fullName || currentUser?.displayName || 'Usuario',
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      console.warn('Error guardando estado de matrícula en Firestore:', err);
    }
  };

  // Toggle de permiso de matrícula específico por usuario
  const handleToggleUserEnrollment = async (targetUser, canEnroll) => {
    try {
      await updateDoc(doc(db, 'users', targetUser.id), {
        canEnroll: canEnroll
      });
      if (typeof fetchAllData === 'function') fetchAllData();
    } catch (err) {
      console.error('Error actualizando permiso de usuario:', err);
    }
  };

  // 2. Filtrar estudiantes por ciclo seleccionado
  const cycleStudents = students.filter(s => {
    if (!s.cycle) return true;
    return s.cycle === selectedCycle;
  });

  // Conteo de catequizandos por Nivel
  const studentsByLevel = levelsList.reduce((acc, level) => {
    acc[level] = cycleStudents.filter(s => (s.level || 'Primer Nivel') === level).length;
    return acc;
  }, {});

  const maxStudentsInLevel = Math.max(...Object.values(studentsByLevel), 1);

  // 3. Grupos existentes para el nivel seleccionado
  const existingGroupsForLevel = groups.filter(g => (g.level || 'Primer Nivel') === targetLevel);

  // 4. Recaudación Neta Parroquial (deduciendo costo de libro si aplica)
  const calculateTotalRecaudacion = () => {
    return paymentRecords.reduce((total, record) => {
      const amount = Number(record.amount || record.totalAmount || 0);
      const isHighLevel = ['Sexto Nivel', 'Septimo Nivel', 'Confirma'].includes(record.groupName || record.level);
      const bookCost = isHighLevel ? 4000 : 3500;

      let contrib = amount;
      if (record.concept && record.concept.includes('libro')) {
        contrib = Math.max(0, amount - bookCost);
      } else if (record.contributionAmount !== undefined) {
        contrib = Number(record.contributionAmount);
      }
      return total + contrib;
    }, 0);
  };

  const totalRecaudadoContribucion = calculateTotalRecaudacion();

  // 5. Asistente para creación / asignación masiva de grupos
  const handleMassiveGroupAction = async () => {
    const unassignedStudents = cycleStudents.filter(s => (s.level || 'Primer Nivel') === targetLevel && (!s.groupId || s.groupId === ''));
    if (unassignedStudents.length === 0) {
      alert(`No hay catequizandos sin grupo asignado en el nivel ${targetLevel} para el ciclo ${selectedCycle}.`);
      return;
    }

    setIsCreatingGroups(true);
    try {
      let targetGroupId = selectedExistingGroupId;
      let targetGroupName = '';

      if (groupChoiceMode === 'NEW' || !targetGroupId) {
        const fullGroupName = `${targetLevel} - ${groupNameSuffix} (${selectedCycle})`;
        const matchedParroquia = currentUser?.parroquiaId || (parroquias[0]?.id || '');
        const matchedDiaconia = currentUser?.diaconiaId || (diaconias[0]?.id || '');

        const newGroupData = {
          name: fullGroupName,
          level: targetLevel,
          year: selectedCycle,
          parroquiaId: matchedParroquia,
          diaconiaId: matchedDiaconia,
          createdBy: currentUser?.uid || currentUser?.id || 'system',
          createdAt: new Date().toISOString()
        };

        const groupDocRef = await addDoc(collection(db, 'groups'), newGroupData);
        targetGroupId = groupDocRef.id;
        targetGroupName = fullGroupName;

        if (typeof setGroups === 'function') {
          setGroups(prev => [...prev, { id: targetGroupId, ...newGroupData }]);
        }
      } else {
        const matched = groups.find(g => g.id === targetGroupId);
        targetGroupName = matched ? matched.name : 'Grupo existente';
      }

      // Actualizar estudiantes en Firestore
      const updatePromises = unassignedStudents.map(student =>
        updateDoc(doc(db, 'students', student.id), { groupId: targetGroupId })
      );

      await Promise.all(updatePromises);

      if (typeof setStudents === 'function') {
        setStudents(prev => prev.map(s => unassignedStudents.some(u => u.id === s.id) ? { ...s, groupId: targetGroupId } : s));
      }

      setCreationMessage(`¡Se asignaron ${unassignedStudents.length} catequizandos con éxito al grupo "${targetGroupName}"!`);
      setTimeout(() => setCreationMessage(null), 6000);
    } catch (err) {
      console.error('Error en asignación de grupos:', err);
      alert('Ocurrió un error al procesar los grupos.');
    } finally {
      setIsCreatingGroups(false);
    }
  };

  // 6. Generador de Expediente PDF (Una sola página con la imagen de la firma incrustada)
  const generateSinglePageExpedientePdf = async (st) => {
    const docPdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = docPdf.internal.pageSize.getWidth();
    const margin = 12;

    // Encabezado estilizado
    docPdf.setFillColor(127, 29, 29); // Red-800
    docPdf.rect(0, 0, pageWidth, 24, 'F');
    docPdf.setTextColor(255, 255, 255);
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(16);
    docPdf.text('EXPEDIENTE DIGITAL DE MATRÍCULA', margin, 12);
    docPdf.setFontSize(9);
    docPdf.setFont('helvetica', 'normal');
    docPdf.text(`AsisCate • Sistema Parroquial | Parroquia ${st.parish || 'El Carmen'}`, margin, 18);

    let y = 30;

    // Sección I: Datos Catequizando
    docPdf.setFillColor(241, 245, 249);
    docPdf.rect(margin, y, pageWidth - margin * 2, 7, 'F');
    docPdf.setTextColor(127, 29, 29);
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(10);
    docPdf.text('I. DATOS DEL CATEQUIZANDO', margin + 3, y + 5);
    y += 11;

    docPdf.setTextColor(30, 41, 59);
    docPdf.setFontSize(9);

    const leftX = margin + 3;
    const rightX = pageWidth / 2 + 5;

    docPdf.setFont('helvetica', 'bold'); docPdf.text('Nombre completo:', leftX, y);
    docPdf.setFont('helvetica', 'normal'); docPdf.text(String(st.fullName || st.name || 'N/A'), leftX + 32, y);
    docPdf.setFont('helvetica', 'bold'); docPdf.text('Nivel:', rightX, y);
    docPdf.setFont('helvetica', 'normal'); docPdf.text(String(st.level || 'N/A'), rightX + 14, y);
    y += 6;

    docPdf.setFont('helvetica', 'bold'); docPdf.text('Fecha nacimiento:', leftX, y);
    docPdf.setFont('helvetica', 'normal'); docPdf.text(`${st.birthDate || 'N/A'} (${st.age ?? 'N/A'} años)`, leftX + 32, y);
    docPdf.setFont('helvetica', 'bold'); docPdf.text('Identificación:', rightX, y);
    docPdf.setFont('helvetica', 'normal'); docPdf.text(`${st.idType || 'NACIONAL'}: ${st.nationalId || 'N/A'}`, rightX + 24, y);
    y += 6;

    docPdf.setFont('helvetica', 'bold'); docPdf.text('Ciclo / Parroquia:', leftX, y);
    docPdf.setFont('helvetica', 'normal'); docPdf.text(`${st.cycle || '2026-2027'} | ${st.parish || 'El Carmen'} (${st.diocesis || 'General'})`, leftX + 32, y);
    y += 6;

    docPdf.setFont('helvetica', 'bold'); docPdf.text('Dirección / Notas:', leftX, y);
    docPdf.setFont('helvetica', 'normal'); docPdf.text(`${st.address || 'Sin dirección'} | Med: ${st.medicalNotes || 'N/A'}`, leftX + 32, y);
    y += 10;

    // Sección II: Encargados
    docPdf.setFillColor(241, 245, 249);
    docPdf.rect(margin, y, pageWidth - margin * 2, 7, 'F');
    docPdf.setTextColor(127, 29, 29);
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(10);
    docPdf.text('II. INFORMACIÓN DE FAMILIARES Y ENCARGADOS', margin + 3, y + 5);
    y += 11;

    const m = st.family?.mother || {};
    const f = st.family?.father || {};
    const g = st.family?.guardian || {};

    docPdf.setTextColor(30, 41, 59);
    docPdf.setFontSize(8.5);

    if (m.fullName) {
      docPdf.setFont('helvetica', 'bold'); docPdf.text(`Madre: ${m.fullName}`, leftX, y);
      docPdf.setFont('helvetica', 'normal'); docPdf.text(`Céd: ${m.nationalId || 'N/A'} | Tel: ${m.phone1 || 'N/A'} ${m.phone2 ? '/ ' + m.phone2 : ''} | ${m.email || ''}`, leftX + 45, y);
      y += 5.5;
    }
    if (f.fullName) {
      docPdf.setFont('helvetica', 'bold'); docPdf.text(`Padre: ${f.fullName}`, leftX, y);
      docPdf.setFont('helvetica', 'normal'); docPdf.text(`Céd: ${f.nationalId || 'N/A'} | Tel: ${f.phone1 || 'N/A'} ${f.phone2 ? '/ ' + f.phone2 : ''} | ${f.email || ''}`, leftX + 45, y);
      y += 5.5;
    }
    if (g.fullName) {
      docPdf.setFont('helvetica', 'bold'); docPdf.text(`Encargado: ${g.fullName} (${g.relationship || 'Legal'})`, leftX, y);
      docPdf.setFont('helvetica', 'normal'); docPdf.text(`Céd: ${g.nationalId || 'N/A'} | Tel: ${g.phone1 || 'N/A'} | ${g.email || ''}`, leftX + 45, y);
      y += 5.5;
    }
    y += 4;

    // Sección III: Estado Documentos
    docPdf.setFillColor(241, 245, 249);
    docPdf.rect(margin, y, pageWidth - margin * 2, 7, 'F');
    docPdf.setTextColor(127, 29, 29);
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(10);
    docPdf.text('III. ESTADO DE DOCUMENTACIÓN ADJUNTA', margin + 3, y + 5);
    y += 11;

    docPdf.setFontSize(8.5);
    const docM = st.documents?.minorId?.status === 'COMPLETED' ? 'COMPLETADO' : (st.documents?.minorId?.status === 'PENDING' ? 'PENDIENTE' : 'N/A');
    const docB = st.documents?.bautismo?.status === 'COMPLETED' ? 'COMPLETADO' : (st.documents?.bautismo?.status === 'PENDING' ? 'PENDIENTE' : 'N/A');
    const docC = st.documents?.comunion?.status === 'COMPLETED' ? 'COMPLETADO' : (st.documents?.comunion?.status === 'PENDING' ? 'PENDIENTE' : 'N/A');

    docPdf.setFont('helvetica', 'normal');
    docPdf.text(`• Cédula Menor: ${docM}    • Constancia Bautismo: ${docB}    • Comprobante Comunión: ${docC}`, leftX, y);
    y += 12;

    // Sección IV: Firma del Encargado
    docPdf.setFillColor(241, 245, 249);
    docPdf.rect(margin, y, pageWidth - margin * 2, 7, 'F');
    docPdf.setTextColor(127, 29, 29);
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(10);
    docPdf.text('IV. FIRMA DE CONFORMIDAD Y DECLARACIÓN JURADA', margin + 3, y + 5);
    y += 12;

    const signatureData = st.family?.guardian?.signatureData;
    const signatureUrl = st.family?.guardian?.signatureUrl;

    const loadImageAsCleanPng = (srcUrl) => {
      return new Promise((resolve) => {
        if (!srcUrl) return resolve(null);
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.src = srcUrl;
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width || 300;
            canvas.height = img.naturalHeight || img.height || 150;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          } catch (err) {
            console.warn('Canvas conversion error:', err);
            resolve(null);
          }
        };
        img.onerror = () => {
          resolve(null);
        };
        setTimeout(() => resolve(null), 1500);
      });
    };

    let cleanSigB64 = null;
    if (signatureData && signatureData.startsWith('data:image/')) {
      cleanSigB64 = await loadImageAsCleanPng(signatureData);
    }
    if (!cleanSigB64 && signatureUrl) {
      cleanSigB64 = await loadImageAsCleanPng(signatureUrl);
    }

    if (cleanSigB64) {
      try {
        docPdf.addImage(cleanSigB64, 'PNG', pageWidth / 2 - 30, y, 60, 24);
        y += 26;
      } catch (imgErr) {
        console.warn('Error renderizando firma en docPdf:', imgErr);
        docPdf.setFont('helvetica', 'italic');
        docPdf.text('[ Firma Digital Registrada en Sistema ]', pageWidth / 2, y + 10, { align: 'center' });
        y += 18;
      }
    } else {
      docPdf.setFont('helvetica', 'italic');
      docPdf.text('[ Firma Digital Registrada en Sistema ]', pageWidth / 2, y + 10, { align: 'center' });
      y += 18;
    }

    docPdf.setDrawColor(148, 163, 184);
    docPdf.line(pageWidth / 2 - 35, y, pageWidth / 2 + 35, y);
    docPdf.setFont('helvetica', 'bold');
    docPdf.setFontSize(8.5);
    docPdf.setTextColor(51, 65, 85);
    docPdf.text('Firma del Encargado / Tutor Legal', pageWidth / 2, y + 4, { align: 'center' });

    // Pie de página
    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(7.5);
    docPdf.setTextColor(100, 116, 139);
    docPdf.text(`Documento emitido el ${new Date().toLocaleDateString('es-CR')} | AsisCate Parroquial`, margin, 285);

    return docPdf;
  };

  const handleDownloadExpediente = async (st) => {
    try {
      const pdf = await generateSinglePageExpedientePdf(st);
      pdf.save(`Expediente_${(st.fullName || st.name || 'Estudiante').replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error('Error generando PDF expediente:', err);
      alert('No se pudo generar el expediente en PDF.');
    }
  };

  const handlePrintExpediente = async (st) => {
    try {
      const pdf = await generateSinglePageExpedientePdf(st);
      const blobUrl = pdf.output('bloburl');
      const printWin = window.open(blobUrl, '_blank');
      if (printWin) {
        printWin.focus();
      }
    } catch (err) {
      console.error('Error imprimiendo expediente:', err);
      alert('No se pudo abrir la ventana de impresión.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado y Control General de Apertura de Matrículas */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-800/40 border border-slate-700/60 p-5 rounded-2xl">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white">Dashboard Administrativo de Matrícula</h2>
          <p className="text-xs sm:text-sm text-slate-400">Control general de matrículas, recaudación y asignación de grupos.</p>
        </div>

        {/* Switch Control Habilitar / Deshabilitar Módulo de Matrículas (Persistido) & Permisos de Usuarios */}
        <div className="flex flex-col gap-2 items-end">
          <div className="flex items-center gap-3 bg-slate-900/80 px-4 py-2.5 rounded-xl border border-slate-700">
            <span className="text-xs font-bold text-slate-300">
              Módulo de Matrículas:
            </span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(isEnrollmentEnabled)}
                onChange={(e) => handleToggleEnrollment(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
            <span className={`text-xs font-black ${isEnrollmentEnabled ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isEnrollmentEnabled ? 'HABILITADO' : 'DESHABILITADO'}
            </span>
            <button
              type="button"
              onClick={() => setIsUsersPermissionOpen(!isUsersPermissionOpen)}
              className="ml-2 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 text-amber-300 px-3 py-1 rounded-lg font-bold transition flex items-center gap-1"
            >
              👥 Permisos por Usuario {isUsersPermissionOpen ? '▲' : '▼'}
            </button>
          </div>

          {/* Menú Desplegable de Permisos Específicos por Usuario */}
          {isUsersPermissionOpen && (
            <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-2 shadow-xl z-20">
              <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
                <span className="text-xs font-bold text-amber-400">Permiso Individual de Matrícula</span>
                <span className="text-[10px] text-slate-400">Marque para permitir acceso</span>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {allUsers.map(u => {
                  const hasPermission = u.canEnroll !== false;
                  return (
                    <label key={u.id} className="flex items-center justify-between p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 cursor-pointer text-xs">
                      <div className="truncate pr-2">
                        <span className="font-bold text-white block truncate">{u.name || u.email}</span>
                        <span className="text-[10px] text-slate-400 truncate">{u.role || 'Catequista'} · {u.email}</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={hasPermission}
                        onChange={(e) => handleToggleUserEnrollment(u, e.target.checked)}
                        className="rounded text-red-800 focus:ring-red-800 w-4 h-4 cursor-pointer"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filtro de Ciclo Catequético */}
      <div className={`${cardBgClass} p-4 rounded-xl border border-slate-700/60 flex items-center justify-between gap-4 flex-wrap`}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-300">📅 Ciclo Catequético:</span>
          <select
            value={selectedCycle}
            onChange={(e) => setSelectedCycle(e.target.value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-bold text-amber-400 ${inputBgClass}`}
          >
            <option value={`${currentYear - 1}-${currentYear}`}>{`${currentYear - 1}-${currentYear}`}</option>
            <option value={`${currentYear}-${currentYear + 1}`}>{`${currentYear}-${currentYear + 1}`}</option>
            <option value={`${currentYear + 1}-${currentYear + 2}`}>{`${currentYear + 1}-${currentYear + 2}`}</option>
          </select>
        </div>

        <div className="text-xs text-slate-400">
          Mostrando métricas y datos correspondientes al período <strong className="text-white">{selectedCycle}</strong>
        </div>
      </div>

      {/* Métricas de Recaudación y Matrícula */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recaudación por Contribución/Matrícula Exclusiva */}
        <div className={`${cardBgClass} p-6 rounded-2xl border border-slate-700/60 space-y-3 relative overflow-hidden`}>
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recaudación Neta Parroquial</span>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Contribución/Matrícula
            </span>
          </div>
          <div className="text-3xl sm:text-4xl font-black text-emerald-400">
            ₡{totalRecaudadoContribucion.toLocaleString('es-CR')}
          </div>
          <p className="text-xs text-slate-400">
            Monto acumulado deduciendo automáticamente el costo del libro en inscripciones combinadas.
          </p>
        </div>

        {/* Total de Catequizandos Inscritos */}
        <div className={`${cardBgClass} p-6 rounded-2xl border border-slate-700/60 space-y-3`}>
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total de Catequizandos</span>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-sky-500/10 text-sky-400 border border-sky-500/20">
              Período {selectedCycle}
            </span>
          </div>
          <div className="text-3xl sm:text-4xl font-black text-sky-400">
            {cycleStudents.length} <span className="text-sm font-normal text-slate-400">matriculados</span>
          </div>
          <p className="text-xs text-slate-400">
            Conteo de catequizandos inscritos en el ciclo catequético seleccionado.
          </p>
        </div>
      </div>

      {/* Desglose Gráfico de Matriculados por Nivel */}
      <div className={`${cardBgClass} p-6 rounded-2xl border border-slate-700/60 space-y-4`}>
        <div className="flex justify-between items-center border-b border-slate-700/60 pb-2">
          <h3 className="text-base font-bold text-white">
            Matriculados por Nivel ({selectedCycle})
          </h3>
          <span className="text-xs text-slate-400">Toca cualquier nivel para explorar sus expedientes</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {levelsList.map(lvl => {
            const count = studentsByLevel[lvl];
            const pct = Math.round((count / maxStudentsInLevel) * 100);

            return (
              <div
                key={lvl}
                onClick={() => setSelectedLevelModal(lvl)}
                className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 hover:border-amber-500/50 transition cursor-pointer group space-y-2"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-300 group-hover:text-amber-400 transition truncate max-w-[170px]">
                    {lvl}
                  </span>
                  <span className="text-lg font-black text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                    {count}
                  </span>
                </div>

                {/* Barra gráfica de progreso */}
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-amber-500 to-red-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${count > 0 ? Math.max(pct, 6) : 0}%` }}
                  />
                </div>

                <div className="text-[10px] text-slate-400 text-right font-medium">
                  Ver {count} {count === 1 ? 'expediente' : 'expedientes'} →
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Asistente de Creación Masiva / Asignación a Grupo */}
      <div className={`${cardBgClass} p-6 rounded-2xl border border-slate-700/60 space-y-4`}>
        <div className="border-b border-slate-700/60 pb-2">
          <h3 className="text-lg font-bold text-red-700 dark:text-red-400">⚡ Asistente de Asignación y Creación Masiva de Grupos</h3>
          <p className="text-xs text-slate-400">Agrupa automáticamente a los catequizandos sin grupo en el nivel seleccionado.</p>
        </div>

        {creationMessage && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs rounded-xl font-bold">
            {creationMessage}
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">1. Nivel a Agrupar</label>
              <select
                value={targetLevel}
                onChange={(e) => {
                  setTargetLevel(e.target.value);
                  setSelectedExistingGroupId('');
                }}
                className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`}
              >
                {levelsList.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">2. Tipo de Acción</label>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setGroupChoiceMode('NEW')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition border ${
                    groupChoiceMode === 'NEW'
                      ? 'bg-red-800 text-white border-red-700'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  + Crear Nuevo Grupo
                </button>
                <button
                  type="button"
                  onClick={() => setGroupChoiceMode('EXISTING')}
                  className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition border ${
                    groupChoiceMode === 'EXISTING'
                      ? 'bg-red-800 text-white border-red-700'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  Usar Grupo Existente
                </button>
              </div>
            </div>

            <div>
              {groupChoiceMode === 'NEW' ? (
                <>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">3. Nombre / Sección del Nuevo Grupo</label>
                  <input
                    type="text"
                    value={groupNameSuffix}
                    onChange={(e) => setGroupNameSuffix(e.target.value)}
                    placeholder="Ej: Sección A, Sábado Mañana"
                    className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`}
                  />
                </>
              ) : (
                <>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">3. Seleccionar Grupo Existente ({targetLevel})</label>
                  <select
                    value={selectedExistingGroupId}
                    onChange={(e) => setSelectedExistingGroupId(e.target.value)}
                    className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`}
                  >
                    <option value="">-- Seleccionar grupo existente --</option>
                    {existingGroupsForLevel.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleMassiveGroupAction}
              disabled={isCreatingGroups}
              className="bg-red-800 hover:bg-red-900 text-white font-bold py-2.5 px-6 rounded-xl text-sm transition shadow-lg disabled:bg-slate-700"
            >
              {isCreatingGroups ? 'Procesando...' : (groupChoiceMode === 'NEW' ? '⚡ Crear Grupo e Insertar Alumnos' : '⚡ Asignar Alumnos a Grupo Seleccionado')}
            </button>
          </div>
        </div>
      </div>

      {/* MODAL 1: Lista de Expedientes por Nivel */}
      {selectedLevelModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className={`${cardBgClass} rounded-2xl p-6 max-w-2xl w-full shadow-2xl space-y-4 my-8`}>
            <div className="flex justify-between items-center border-b border-slate-700 pb-2">
              <div>
                <h3 className="text-lg font-bold text-white">Expedientes en {selectedLevelModal}</h3>
                <p className="text-xs text-slate-400">Ciclo Catequético {selectedCycle}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLevelModal(null)}
                className="text-slate-400 hover:text-white text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {(() => {
              const levelStudents = cycleStudents.filter(s => (s.level || 'Primer Nivel') === selectedLevelModal);

              if (levelStudents.length === 0) {
                return (
                  <div className="py-8 text-center text-slate-400 text-sm">
                    No hay catequizandos registrados en este nivel para el ciclo {selectedCycle}.
                  </div>
                );
              }

              return (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {levelStudents.map(st => (
                    <div
                      key={st.id}
                      className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-bold text-white">{st.fullName || st.name}</p>
                        <p className="text-xs text-slate-400">
                          Edad: {st.age ?? 'N/A'} años · Tel: {st.phone || 'Sin tel'} · Parroquia: {st.parish || 'El Carmen'}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedStudentDetail(st)}
                        className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition self-start sm:self-auto"
                      >
                        📂 Abrir Expediente Completo
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* MODAL 2: Detalle Completo del Expediente + Imprimir & Descargar PDF */}
      {selectedStudentDetail && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className={`${cardBgClass} rounded-2xl p-6 max-w-2xl w-full shadow-2xl space-y-4 my-8`}>
            <div className="flex justify-between items-center border-b border-slate-700 pb-2">
              <div>
                <h3 className="text-lg font-bold text-amber-400">Expediente Digital del Catequizando</h3>
                <p className="text-xs text-slate-400">{selectedStudentDetail.fullName || selectedStudentDetail.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudentDetail(null)}
                className="text-slate-400 hover:text-white text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs max-h-[70vh] overflow-y-auto pr-1">
              {/* Sección I */}
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 space-y-2">
                <h4 className="font-bold text-red-400 uppercase text-xs">I. Datos del Catequizando</h4>
                <div className="grid grid-cols-2 gap-2 text-slate-300">
                  <div><strong>Nombre:</strong> {selectedStudentDetail.fullName || selectedStudentDetail.name}</div>
                  <div><strong>Nivel:</strong> {selectedStudentDetail.level}</div>
                  <div><strong>Fecha de Nacimiento:</strong> {selectedStudentDetail.birthDate || 'N/A'} ({selectedStudentDetail.age} años)</div>
                  <div><strong>Identificación:</strong> {selectedStudentDetail.idType || 'NACIONAL'} - {selectedStudentDetail.nationalId || 'N/A'}</div>
                  <div><strong>Ciclo:</strong> {selectedStudentDetail.cycle || '2026-2027'}</div>
                  <div><strong>Parroquia / Diaconía:</strong> {selectedStudentDetail.parish || 'El Carmen'} ({selectedStudentDetail.diocesis || 'General'})</div>
                </div>
              </div>

              {/* Sección II */}
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 space-y-2">
                <h4 className="font-bold text-red-400 uppercase text-xs">II. Familiares y Encargados</h4>
                <div className="space-y-1 text-slate-300">
                  {selectedStudentDetail.family?.mother?.fullName && (
                    <div><strong>Madre:</strong> {selectedStudentDetail.family.mother.fullName} (Céd: {selectedStudentDetail.family.mother.nationalId}) · Tel: {selectedStudentDetail.family.mother.phone1}</div>
                  )}
                  {selectedStudentDetail.family?.father?.fullName && (
                    <div><strong>Padre:</strong> {selectedStudentDetail.family.father.fullName} (Céd: {selectedStudentDetail.family.father.nationalId}) · Tel: {selectedStudentDetail.family.father.phone1}</div>
                  )}
                  {selectedStudentDetail.family?.guardian?.fullName && (
                    <div><strong>Encargado Legal:</strong> {selectedStudentDetail.family.guardian.fullName} ({selectedStudentDetail.family.guardian.relationship}) · Tel: {selectedStudentDetail.family.guardian.phone1}</div>
                  )}
                </div>
              </div>

              {/* Sección III */}
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 space-y-2">
                <h4 className="font-bold text-red-400 uppercase text-xs">III. Documentos Faltantes y Estado</h4>
                <div className="flex gap-4 text-slate-300">
                  <div><strong>Cédula Menor:</strong> {selectedStudentDetail.documents?.minorId?.status || 'COMPLETED'}</div>
                  <div><strong>Bautismo:</strong> {selectedStudentDetail.documents?.bautismo?.status || 'COMPLETED'}</div>
                  <div><strong>Comunión:</strong> {selectedStudentDetail.documents?.comunion?.status || 'COMPLETED'}</div>
                </div>
              </div>

              {/* Sección IV: Firma */}
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 space-y-2 text-center">
                <h4 className="font-bold text-red-400 uppercase text-xs">IV. Firma Digital Registrada</h4>
                {selectedStudentDetail.family?.guardian?.signatureData || selectedStudentDetail.family?.guardian?.signatureUrl ? (
                  <img
                    src={selectedStudentDetail.family?.guardian?.signatureData || selectedStudentDetail.family?.guardian?.signatureUrl}
                    alt="Firma del Encargado"
                    className="max-h-24 mx-auto border border-slate-700 rounded-lg p-1 bg-white"
                  />
                ) : (
                  <p className="text-slate-400 italic">Firma registrada en sistema digital.</p>
                )}
              </div>
            </div>

            {/* Acciones Editar / Eliminar / Imprimir / Descargar PDF */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-2 border-t border-slate-700 pt-3">
              <div className="flex gap-2 w-full sm:w-auto">
                {typeof handleStartEditStudent === 'function' && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = selectedStudentDetail;
                      setSelectedStudentDetail(null);
                      setSelectedLevelModal(null);
                      handleStartEditStudent(target);
                    }}
                    className="bg-slate-700 hover:bg-slate-600 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center justify-center gap-1 flex-1 sm:flex-initial"
                  >
                    ✏️ Editar Catequizando
                  </button>
                )}
                {typeof handleDeleteStudent === 'function' && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = selectedStudentDetail;
                      setSelectedStudentDetail(null);
                      handleDeleteStudent(target);
                    }}
                    className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-bold px-3 py-2 rounded-xl text-xs flex items-center justify-center gap-1 flex-1 sm:flex-initial"
                  >
                    🗑️ Eliminar Expediente
                  </button>
                )}
              </div>

              <div className="flex gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => handlePrintExpediente(selectedStudentDetail)}
                  className="bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 font-bold px-3 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 flex-1 sm:flex-initial"
                >
                  🖨️ Imprimir PDF (1 Pág)
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadExpediente(selectedStudentDetail)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 flex-1 sm:flex-initial"
                >
                  📄 Descargar PDF (1 Pág)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
