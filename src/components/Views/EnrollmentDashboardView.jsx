import { useState } from 'react';
import { collection, addDoc, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { jsPDF } from 'jspdf';

const loadFaviconAsPng = async () => {
  const response = await fetch('/favicon.svg');
  if (!response.ok) return null;
  const svgText = await response.text();
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128; canvas.height = 128;
      canvas.getContext('2d').drawImage(image, 0, 0, 128, 128);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => resolve(null);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  });
};

export default function EnrollmentDashboardView({
  currentUser,
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
  fetchAllData,
  groupScheduleOptions = { days: [], times: [], rooms: [] }
}) {
  const currentYear = new Date().getFullYear();
  const [selectedCycle, setSelectedCycle] = useState(`${currentYear}-${currentYear + 1}`);

  // Estado menú desplegable de permisos por usuario
  const [isUsersPermissionOpen, setIsUsersPermissionOpen] = useState(false);

  // Modales
  const [selectedLevelModal, setSelectedLevelModal] = useState(null);
  const [selectedStudentDetail, setSelectedStudentDetail] = useState(null);
  const [showBookControl, setShowBookControl] = useState(false);

  // Asistente de Creación/Asignación Masiva
  const [targetLevel, setTargetLevel] = useState('Primer Nivel');
  const [groupChoiceMode, setGroupChoiceMode] = useState('NEW'); // 'NEW' | 'EXISTING'
  const [selectedExistingGroupId, setSelectedExistingGroupId] = useState('');
  const [groupNameSuffix, setGroupNameSuffix] = useState('Sección A');
  const [massGroupCount, setMassGroupCount] = useState(1);
  const [massGroupSchedules, setMassGroupSchedules] = useState([{ day: 'Sábado', time: '', room: '' }]);
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

  const updateMassGroupCount = (value) => {
    const nextCount = Math.max(1, Math.min(20, Number(value) || 1));
    setMassGroupCount(nextCount);
    setMassGroupSchedules(previous => Array.from({ length: nextCount }, (_, index) => previous[index] || ({ day: 'Sábado', time: '', room: '' })));
  };

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
  const cycleStudentsRaw = students.filter(s => {
    if (!s.cycle) return true;
    return s.cycle === selectedCycle;
  });
  const cycleStudents = Array.from(cycleStudentsRaw.reduce((map, student) => {
    const normalizedName = String(student.fullName || student.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const key = `${normalizedName}|${student.level || 'Primer Nivel'}|${student.cycle || selectedCycle}`;
    const current = map.get(key);
    const score = Object.values(student).filter(value => value !== null && value !== undefined && String(value).trim() !== '').length;
    const currentScore = current ? Object.values(current).filter(value => value !== null && value !== undefined && String(value).trim() !== '').length : -1;
    const currentCreatedAt = current?.createdAt ? new Date(current.createdAt).getTime() : 0;
    const studentCreatedAt = student?.createdAt ? new Date(student.createdAt).getTime() : 0;
    if (!current || score > currentScore || (score === currentScore && studentCreatedAt >= currentCreatedAt)) map.set(key, student);
    return map;
  }, new Map()).values());

  // Conteo de catequizandos por Nivel
  const studentsByLevel = levelsList.reduce((acc, level) => {
    acc[level] = cycleStudents.filter(s => (s.level || 'Primer Nivel') === level).length;
    return acc;
  }, {});

  const maxStudentsInLevel = Math.max(...Object.values(studentsByLevel), 1);

  // 3. Grupos existentes para el nivel seleccionado
  const existingGroupsForLevel = groups.filter(g => (g.level || 'Primer Nivel') === targetLevel);

  // 4. Recaudación Neta Parroquial (deduciendo costo de libro si aplica)
  const cyclePaymentRecords = paymentRecords.filter((record) => {
    if (record.cycle && record.cycle !== selectedCycle) return false;
    // La recaudación del dashboard de matrículas solo incluye pagos generados
    // por el módulo de matrícula: matrícula, libro o matrícula + libro.
    const concept = String(record.concept || '').toLowerCase();
    return concept.includes('matrícula') || concept.includes('matricula') || concept.includes('libro');
  });
  const getPaymentAmount = (record) => Number(record.amount || record.totalAmount || 0);
  const getNetContribution = (record) => {
      const amount = getPaymentAmount(record);
      const concept = String(record.concept || '').toLowerCase();
      const linkedStudent = students.find(student => student.id === record.studentId);
      const linkedGroup = groups.find(group => group.id === record.groupId);
      const level = linkedStudent?.level || record.level || linkedGroup?.level || record.groupName || '';
      const isHighLevel = ['Sexto Nivel', 'Septimo Nivel', 'Confirma', '6to Nivel', '7mo Nivel'].some(value => String(level).toLowerCase().includes(value.toLowerCase()));
      const bookCost = isHighLevel ? 4000 : 3500;

      // Un pago exclusivamente de libro no es recaudación parroquial neta.
      if (concept.includes('libro') && !concept.includes('matrícula') && !concept.includes('matricula')) return 0;
      if (concept.includes('libro')) return Math.max(0, amount - bookCost);
      if (record.contributionAmount !== undefined) return Number(record.contributionAmount);
      return amount;
  };

  const calculateByMethod = (records, getAmount) => records.reduce((totals, record) => {
    const method = String(record.paymentMethod || '').toUpperCase();
    const amount = getAmount(record);
    if (method.includes('SINPE')) totals.sinpe += amount;
    else if (method.includes('EFECTIVO')) totals.efectivo += amount;
    else totals.otros += amount;
    totals.total += amount;
    return totals;
  }, { sinpe: 0, efectivo: 0, otros: 0, total: 0 });

  const netRevenue = calculateByMethod(cyclePaymentRecords, getNetContribution);

  const bookPaymentCandidates = cyclePaymentRecords.filter((record) => {
    const hasBook = Number(record.bookAmount || 0) > 0 || /libro/i.test(record.concept || '');
    return hasBook;
  });
  // Un catequizando solo aparece una vez aunque se haya corregido o reimpreso un recibo.
  const bookPaymentsForCycle = Array.from(new Map(bookPaymentCandidates.map((record) => [record.studentId || record.studentName || record.id, record])).values());
  const totalBooksToDeliver = bookPaymentsForCycle.length;
  const getBookAmount = (record) => Number(record.bookAmount || 0) || (/libro/i.test(record.concept || '') ? Math.max(0, getPaymentAmount(record) - Number(record.contributionAmount || 0)) : 0);
  const bookRevenue = calculateByMethod(bookPaymentsForCycle, getBookAmount);
  const booksByLevel = levelsList.reduce((acc, level) => {
    acc[level] = bookPaymentsForCycle.filter((record) => (students.find((student) => student.id === record.studentId)?.level || record.level || record.groupName) === level);
    return acc;
  }, {});

  const addPdfHeader = async (pdf, title, subtitle) => {
    const pageWidth = pdf.internal.pageSize.getWidth();
    const logo = await loadFaviconAsPng();
    if (logo) pdf.addImage(logo, 'PNG', 14, 10, 14, 14);
    pdf.setFillColor(127, 29, 29);
    pdf.rect(32, 10, pageWidth - 46, 14, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15);
    pdf.text(title, 36, 19);
    pdf.setTextColor(55, 65, 81); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
    pdf.text(subtitle, 14, 32);
    pdf.text(`Emitido: ${new Date().toLocaleDateString('es-CR')}`, pageWidth - 55, 32);
  };

  const addPdfFooter = (pdf) => {
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    pdf.setDrawColor(203, 213, 225); pdf.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
    pdf.setTextColor(100, 116, 139); pdf.setFontSize(7.5); pdf.setFont('helvetica', 'normal');
    pdf.text('AsisCate - Sistema Parroquial', 14, pageHeight - 7);
  };

  const generateBooksSummaryPdf = async () => {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    await addPdfHeader(pdf, 'AsisCate - Control de Libros', `Ciclo catequético: ${selectedCycle}`);
    pdf.setFillColor(248, 250, 252); pdf.roundedRect(14, 40, 182, 18, 3, 3, 'F');
    pdf.setTextColor(127, 29, 29); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.text(`Total de libros a entregar: ${totalBooksToDeliver}`, 20, 51);
    let y = 70;
    pdf.setFillColor(127, 29, 29); pdf.rect(14, y, 182, 8, 'F'); pdf.setTextColor(255, 255, 255); pdf.setFontSize(9); pdf.text('NIVEL', 20, y + 5.5); pdf.text('LIBROS', 175, y + 5.5, { align: 'right' }); y += 8;
    levelsList.forEach((level, index) => { if (index % 2 === 0) { pdf.setFillColor(248, 250, 252); pdf.rect(14, y, 182, 8, 'F'); } pdf.setTextColor(55, 65, 81); pdf.setFont('helvetica', 'normal'); pdf.text(level, 20, y + 5.5); pdf.setFont('helvetica', 'bold'); pdf.text(String(booksByLevel[level].length), 175, y + 5.5, { align: 'right' }); y += 8; });
    addPdfFooter(pdf);
    pdf.save(`Libros_por_nivel_${selectedCycle}.pdf`);
  };

  const generateBookListPdf = async (level) => {
    const records = booksByLevel[level] || [];
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    await addPdfHeader(pdf, 'AsisCate - Entrega de Libros', `${level} · Ciclo catequético: ${selectedCycle}`);
    let y = 42;
    pdf.setFillColor(127, 29, 29); pdf.rect(14, y, 182, 8, 'F'); pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.text('N°', 18, y + 5.5); pdf.text('CATEQUIZANDO', 30, y + 5.5); pdf.text('RECIBO', 175, y + 5.5, { align: 'right' }); y += 8;
    records.forEach((record, index) => {
      const student = students.find((item) => item.id === record.studentId);
      if (index % 2 === 0) { pdf.setFillColor(248, 250, 252); pdf.rect(14, y, 182, 8, 'F'); }
      pdf.setTextColor(55, 65, 81); pdf.setFont('helvetica', 'normal'); pdf.text(String(index + 1), 18, y + 5.5); pdf.text(String(record.studentName || student?.fullName || student?.name || 'Sin nombre').slice(0, 65), 30, y + 5.5); pdf.text(String(record.receiptNumber || record.receiptNum || 'N/A'), 175, y + 5.5, { align: 'right' });
      y += 8;
      if (y > 275 && index < records.length - 1) { addPdfFooter(pdf); pdf.addPage(); y = 18; }
    });
    addPdfFooter(pdf);
    pdf.save(`Lista_libros_${level.replace(/[^a-z0-9]+/gi, '_')}_${selectedCycle}.pdf`);
  };

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
      if (groupChoiceMode === 'NEW' || !targetGroupId) {
        if (massGroupSchedules.slice(0, massGroupCount).some(schedule => !schedule.day || !schedule.time || !schedule.room)) {
          alert('Completa el día, horario y salón de cada grupo antes de continuar.');
          setIsCreatingGroups(false);
          return;
        }
        const matchedParroquia = currentUser?.parroquiaId || (parroquias[0]?.id || '');
        const matchedDiaconia = currentUser?.diaconiaId || (diaconias[0]?.id || '');
        const groupCount = Math.min(massGroupCount, unassignedStudents.length);
        const chunkSize = Math.ceil(unassignedStudents.length / groupCount);
        const createdGroups = [];
        for (let index = 0; index < groupCount; index += 1) {
          const schedule = massGroupSchedules[index];
          const sectionName = groupCount === 1 ? groupNameSuffix : `${groupNameSuffix} ${index + 1}`;
          const newGroupData = {
            name: `${targetLevel} - ${sectionName}`,
            level: targetLevel,
            year: selectedCycle,
            parroquiaId: matchedParroquia,
            diaconiaId: matchedDiaconia,
            scheduleDay: schedule.day,
            scheduleTime: schedule.time,
            room: schedule.room,
            createdBy: currentUser?.uid || currentUser?.id || 'system',
            createdAt: new Date().toISOString()
          };
          const groupDocRef = await addDoc(collection(db, 'groups'), newGroupData);
          const chunk = unassignedStudents.slice(index * chunkSize, (index + 1) * chunkSize);
          await Promise.all(chunk.map(student => updateDoc(doc(db, 'students', student.id), { groupId: groupDocRef.id })));
          createdGroups.push({ id: groupDocRef.id, ...newGroupData, studentIds: chunk.map(student => student.id) });
        }
        if (typeof setGroups === 'function') setGroups(prev => [...prev, ...createdGroups.map(group => {
          const groupData = { ...group };
          delete groupData.studentIds;
          return groupData;
        })]);
        if (typeof setStudents === 'function') {
          setStudents(prev => prev.map(student => {
            const assignedGroup = createdGroups.find(group => group.studentIds.includes(student.id));
            return assignedGroup ? { ...student, groupId: assignedGroup.id } : student;
          }));
        }
        setCreationMessage(`¡Se distribuyeron ${unassignedStudents.length} catequizandos en ${createdGroups.length} grupo(s)!`);
      } else {
        const matched = groups.find(g => g.id === targetGroupId);
        if (!matched) throw new Error('Grupo existente no encontrado');
        await Promise.all(unassignedStudents.map(student => updateDoc(doc(db, 'students', student.id), { groupId: targetGroupId })));
        if (typeof setStudents === 'function') setStudents(prev => prev.map(student => unassignedStudents.some(item => item.id === student.id) ? { ...student, groupId: targetGroupId } : student));
        setCreationMessage(`¡Se asignaron ${unassignedStudents.length} catequizandos con éxito al grupo "${matched.name}"!`);
      }
      setTimeout(() => setCreationMessage(null), 6000);
    } catch (err) {
      console.error('Error en asignación de grupos:', err);
      alert('Ocurrió un error al procesar los grupos.');
    } finally {
      setIsCreatingGroups(false);
    }
  };

  const handleChangeStudentGroup = async (student, nextGroupId) => {
    const nextGroup = groups.find(group => group.id === nextGroupId);
    if (!student?.id || !nextGroup) return;
    try {
      await updateDoc(doc(db, 'students', student.id), { groupId: nextGroup.id, level: nextGroup.level || student.level || 'Primer Nivel' });
      const updatedStudent = { ...student, groupId: nextGroup.id, level: nextGroup.level || student.level || 'Primer Nivel' };
      if (typeof setStudents === 'function') setStudents(previous => previous.map(item => item.id === student.id ? updatedStudent : item));
      setSelectedStudentDetail(updatedStudent);
    } catch (error) {
      console.error('Error cambiando grupo del expediente:', error);
      alert('No se pudo cambiar el grupo del catequizando.');
    }
  };

  // 6. Generador de Expediente PDF (Una sola página con la imagen de la firma incrustada)
  const generateSinglePageExpedientePdf = async (st) => {
    const docPdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = docPdf.internal.pageSize.getWidth();
    const margin = 12;

    const loadImageAsCleanPng = (srcUrl) => new Promise((resolve) => {
      if (!srcUrl) return resolve(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width || 300;
          canvas.height = img.naturalHeight || img.height || 150;
          canvas.getContext('2d').drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch (err) {
          console.warn('No se pudo preparar la imagen para el PDF:', err);
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = srcUrl;
      setTimeout(() => resolve(null), 1500);
    });

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
    const photoData = st.photoData || (st.photoUrl ? await loadImageAsCleanPng(st.photoUrl) : null);
    const studentInfoX = photoData ? leftX + 31 : leftX;

    if (photoData) {
      try {
        docPdf.addImage(photoData, 'PNG', leftX, y - 2, 25, 31);
      } catch (imgErr) {
        console.warn('No se pudo incluir la foto en el PDF:', imgErr);
      }
    }

    docPdf.setFont('helvetica', 'bold'); docPdf.text('Nombre completo:', studentInfoX, y);
    docPdf.setFont('helvetica', 'normal'); docPdf.text(String(st.fullName || st.name || 'N/A'), studentInfoX + 32, y);
    docPdf.setFont('helvetica', 'bold'); docPdf.text('Nivel:', rightX, y);
    docPdf.setFont('helvetica', 'normal'); docPdf.text(String(st.level || 'N/A'), rightX + 14, y);
    y += 6;

    docPdf.setFont('helvetica', 'bold'); docPdf.text('Fecha nacimiento:', studentInfoX, y);
    docPdf.setFont('helvetica', 'normal'); docPdf.text(`${st.birthDate || 'N/A'} (${st.age ?? 'N/A'} años)`, studentInfoX + 32, y);
    docPdf.setFont('helvetica', 'bold'); docPdf.text('Identificación:', rightX, y);
    docPdf.setFont('helvetica', 'normal'); docPdf.text(`${st.idType || 'NACIONAL'}: ${st.nationalId || 'N/A'}`, rightX + 24, y);
    y += 6;

    docPdf.setFont('helvetica', 'bold'); docPdf.text('Ciclo / Parroquia:', studentInfoX, y);
    docPdf.setFont('helvetica', 'normal'); docPdf.text(`${st.cycle || '2026-2027'} | ${st.parish || 'El Carmen'} (${st.diocesis || 'General'})`, studentInfoX + 32, y);
    y += 6;

    docPdf.setFont('helvetica', 'bold'); docPdf.text('Dirección / Notas:', studentInfoX, y);
    docPdf.setFont('helvetica', 'normal'); docPdf.text(`${st.address || 'Sin dirección'} | Med: ${st.medicalNotes || 'N/A'}`, studentInfoX + 32, y);
    y = Math.max(y + 10, photoData ? 73 : y + 10);

    docPdf.setFontSize(8);
    docPdf.setFont('helvetica', 'normal');
    const educationalInfo = `Género: ${st.gender || 'N/A'} | Nacimiento: ${st.birthPlace || 'N/A'} | Centro educativo: ${st.educationCenter || 'N/A'} | Grado: ${st.schoolGrade || 'N/A'}`;
    docPdf.text(docPdf.splitTextToSize(educationalInfo, pageWidth - margin * 2 - 6), leftX, y);
    y += 8;
    const specialNeeds = [
      ['Adecuación curricular', st.curricularAdaptation, st.curricularAdaptationDetails],
      ['Conducta', st.behaviorIssue, st.behaviorIssueDetails],
      ['Impedimento físico', st.physicalImpairment, st.physicalImpairmentDetails]
    ].map(([label, value, details]) => `${label}: ${value === 'SI' ? `Sí${details ? ` (${details})` : ''}` : 'No'}`).join(' | ');
    docPdf.text(docPdf.splitTextToSize(specialNeeds, pageWidth - margin * 2 - 6), leftX, y);
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
    const familyDetails = `Estado civil: ${st.maritalStatus || 'N/A'} | Hermanos: ${st.siblingCount || 'N/A'}${st.siblingDetails ? ` (${st.siblingDetails})` : ''}`;
    docPdf.setFont('helvetica', 'normal');
    docPdf.text(docPdf.splitTextToSize(familyDetails, pageWidth - margin * 2 - 6), leftX, y);
    y += 5.5;
    if (st.authorizedPickupPeople) {
      docPdf.text(docPdf.splitTextToSize(`Autorizados para retirar: ${st.authorizedPickupPeople}`, pageWidth - margin * 2 - 6), leftX, y);
      y += 9;
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
    const docM = st.documents?.minorId?.status === 'COMPLETED' ? 'COMPLETADO' : 'PENDIENTE';
    const docB = st.documents?.bautismo?.status === 'COMPLETED' ? 'COMPLETADO' : 'PENDIENTE';
    const docC = st.documents?.comunion?.status === 'COMPLETED' ? 'COMPLETADO' : 'PENDIENTE';

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

    docPdf.setFont('helvetica', 'normal');
    docPdf.setFontSize(7.5);
    docPdf.text('Compromiso de formación en la fe: ' + (st.acceptsCatechesisCommitment ? 'ACEPTADO' : 'No registrado'), leftX, y);
    y += 5;

    const signatureData = st.family?.guardian?.signatureData;
    const signatureUrl = st.family?.guardian?.signatureUrl;

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

  const formatDocumentStatus = (status) => status === 'COMPLETED' ? 'COMPLETADO' : 'PENDIENTE';

  return (
    <div className="space-y-6">
      {/* Encabezado y Control General de Apertura de Matrículas */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-100 dark:bg-slate-800/40 border border-slate-300 dark:border-slate-700/60 p-5 rounded-2xl">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">Dashboard Administrativo de Matrícula</h2>
          <p className="text-xs sm:text-sm text-slate-400">Control general de matrículas, recaudación y asignación de grupos.</p>
        </div>

        {/* Switch Control Habilitar / Deshabilitar Módulo de Matrículas (Persistido) & Permisos de Usuarios */}
        <div className="flex flex-col gap-2 items-end">
          <div className="flex items-center gap-3 bg-white dark:bg-slate-900/80 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
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
      <div className={`${cardBgClass} p-4 rounded-xl border border-slate-300 dark:border-slate-700/60 flex items-center justify-between gap-4 flex-wrap`}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">📅 Ciclo Catequético:</span>
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recaudación por Contribución/Matrícula Exclusiva */}
        <div className={`${cardBgClass} p-6 rounded-2xl border border-slate-300 dark:border-slate-700/60 space-y-3 relative overflow-hidden`}>
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Recaudación Neta Parroquial</span>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Contribución/Matrícula
            </span>
          </div>
          <div className="text-3xl sm:text-4xl font-black text-emerald-400">₡{netRevenue.total.toLocaleString('es-CR')}</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-slate-100 dark:bg-slate-900/60 p-2"><span className="block text-slate-500 dark:text-slate-400">SINPE</span><strong className="text-emerald-600 dark:text-emerald-300">₡{netRevenue.sinpe.toLocaleString('es-CR')}</strong></div>
            <div className="rounded-lg bg-slate-100 dark:bg-slate-900/60 p-2"><span className="block text-slate-500 dark:text-slate-400">Efectivo</span><strong className="text-emerald-600 dark:text-emerald-300">₡{netRevenue.efectivo.toLocaleString('es-CR')}</strong></div>
          </div>
          {netRevenue.otros > 0 && <p className="text-xs text-slate-400">Otros medios: ₡{netRevenue.otros.toLocaleString('es-CR')}</p>}
        </div>

        {/* Total de Catequizandos Inscritos */}
        <div className={`${cardBgClass} p-6 rounded-2xl border border-slate-300 dark:border-slate-700/60 space-y-3`}>
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
      <div className={`${cardBgClass} p-6 rounded-2xl border border-slate-300 dark:border-slate-700/60 space-y-4`}>
        <div className="flex justify-between items-center border-b border-slate-700/60 pb-2">
          <h3 className="text-base font-bold text-slate-800 dark:text-white">
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
                className="bg-slate-100 dark:bg-slate-900/80 p-4 rounded-xl border border-slate-300 dark:border-slate-800 hover:border-amber-500/50 transition cursor-pointer group space-y-2"
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
                <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
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
      <div className={`${cardBgClass} p-6 rounded-2xl border border-slate-300 dark:border-slate-700/60 space-y-4`}>
        <div className="border-b border-slate-300 dark:border-slate-700/60 pb-2">
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
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
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
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
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

          {groupChoiceMode === 'NEW' && (
            <div className="space-y-3 rounded-xl border border-slate-300 dark:border-slate-700 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-xs font-bold text-slate-400 uppercase">Cantidad de grupos a crear</label>
                <input type="number" min="1" max="20" value={massGroupCount} onChange={event => updateMassGroupCount(event.target.value)} className={`w-28 rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
              </div>
              <div className="space-y-2">
                {massGroupSchedules.slice(0, massGroupCount).map((schedule, index) => (
                  <div key={index} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                    <span className="text-xs font-bold text-slate-400">Grupo {index + 1}</span>
                    <select value={schedule.day} onChange={event => setMassGroupSchedules(previous => previous.map((item, itemIndex) => itemIndex === index ? { ...item, day: event.target.value } : item))} className={`rounded-lg px-3 py-2 text-sm ${inputBgClass}`}><option value="">Día...</option>{groupScheduleOptions.days.map(day => <option key={day} value={day}>{day}</option>)}</select>
                    <select value={schedule.time} onChange={event => setMassGroupSchedules(previous => previous.map((item, itemIndex) => itemIndex === index ? { ...item, time: event.target.value } : item))} className={`rounded-lg px-3 py-2 text-sm ${inputBgClass}`}><option value="">Horario...</option>{groupScheduleOptions.times.map(time => <option key={time} value={time}>{time}</option>)}</select>
                    <select value={schedule.room} onChange={event => setMassGroupSchedules(previous => previous.map((item, itemIndex) => itemIndex === index ? { ...item, room: event.target.value } : item))} className={`rounded-lg px-3 py-2 text-sm ${inputBgClass}`}><option value="">Salón...</option>{groupScheduleOptions.rooms.map(room => <option key={room} value={room}>{room}</option>)}</select>
                  </div>
                ))}
              </div>
            </div>
          )}

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

      <div className={`${cardBgClass} rounded-2xl border border-slate-300 dark:border-slate-700/60 overflow-hidden`}>
        <button type="button" onClick={() => setShowBookControl((visible) => !visible)} className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-5 text-left hover:bg-slate-100 dark:hover:bg-slate-800/30 transition">
          <div><h3 className="text-base font-bold text-slate-800 dark:text-white">📚 Control de libros por entregar</h3><p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Oculto por defecto; se genera desde los recibos con libro del ciclo.</p></div>
          <span className="text-xs font-bold text-amber-400">{showBookControl ? 'Ocultar ▲' : `Mostrar (${totalBooksToDeliver}) ▼`}</span>
        </button>
        {showBookControl && (
          <div className="border-t border-slate-300 dark:border-slate-700/60 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-2"><span className="text-xs text-amber-300">Total de libros a entregar/comprar: </span><strong className="text-xl text-amber-400">{totalBooksToDeliver}</strong></div>
              <button type="button" onClick={generateBooksSummaryPdf} className="bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold px-3 py-2 rounded-lg text-xs">📄 PDF: total por nivel</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3"><span className="block text-slate-400">Recaudado por libros</span><strong className="text-lg text-emerald-400">₡{bookRevenue.total.toLocaleString('es-CR')}</strong></div>
              <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-3"><span className="block text-slate-500 dark:text-slate-400">SINPE</span><strong className="text-lg text-sky-600 dark:text-sky-300">₡{bookRevenue.sinpe.toLocaleString('es-CR')}</strong></div>
              <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-3"><span className="block text-slate-500 dark:text-slate-400">Efectivo</span><strong className="text-lg text-amber-600 dark:text-amber-300">₡{bookRevenue.efectivo.toLocaleString('es-CR')}</strong></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[570px] text-left text-xs">
                <thead className="text-slate-500 dark:text-slate-400 uppercase border-b border-slate-300 dark:border-slate-700"><tr><th className="px-3 py-2">Nivel</th><th className="px-3 py-2 text-center">Libros</th><th className="px-3 py-2 text-right">Lista</th></tr></thead>
                <tbody>{levelsList.map((level) => <tr key={level} className="border-b border-slate-200 dark:border-slate-800/80 text-slate-700 dark:text-slate-200"><td className="px-3 py-2 font-semibold">{level}</td><td className="px-3 py-2 text-center text-amber-500 dark:text-amber-400 font-bold">{booksByLevel[level].length}</td><td className="px-3 py-2 text-right"><button type="button" disabled={!booksByLevel[level].length} onClick={() => generateBookListPdf(level)} className="text-sky-600 dark:text-sky-300 hover:text-sky-700 dark:hover:text-sky-200 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed">📄 PDF de catequizandos</button></td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}
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
                <div className="flex gap-3 items-start">
                  {(selectedStudentDetail.photoData || selectedStudentDetail.photoUrl) && (
                    <img src={selectedStudentDetail.photoData || selectedStudentDetail.photoUrl} alt={`Foto de ${selectedStudentDetail.fullName || selectedStudentDetail.name || 'catequizando'}`} className="h-28 w-24 rounded-lg object-cover border border-slate-600 bg-slate-800" />
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-300 flex-1">
                  <div><strong>Nombre:</strong> {selectedStudentDetail.fullName || selectedStudentDetail.name}</div>
                  <div><strong>Nivel:</strong> {selectedStudentDetail.level}</div>
                  <div><strong>Fecha de Nacimiento:</strong> {selectedStudentDetail.birthDate || 'N/A'} ({selectedStudentDetail.age} años)</div>
                  <div><strong>Identificación:</strong> {selectedStudentDetail.idType || 'NACIONAL'} - {selectedStudentDetail.nationalId || 'N/A'}</div>
                  <div><strong>Género:</strong> {selectedStudentDetail.gender || 'N/A'}</div>
                  <div><strong>Lugar de nacimiento:</strong> {selectedStudentDetail.birthPlace || 'N/A'}</div>
                  <div><strong>Centro educativo:</strong> {selectedStudentDetail.educationCenter || 'N/A'}</div>
                  <div><strong>Grado:</strong> {selectedStudentDetail.schoolGrade || 'N/A'}</div>
                  <div><strong>Ciclo:</strong> {selectedStudentDetail.cycle || '2026-2027'}</div>
                  <div><strong>Parroquia / Diaconía:</strong> {selectedStudentDetail.parish || 'El Carmen'} ({selectedStudentDetail.diocesis || 'General'})</div>
                  <div className="sm:col-span-2"><strong>Grupo:</strong> {groups.find(group => group.id === selectedStudentDetail.groupId)?.name || 'Sin grupo'}
                    {groups.filter(group => {
                      const sameLevel = !selectedStudentDetail.level || !group.level || group.level === selectedStudentDetail.level;
                      const sameCycle = !selectedStudentDetail.cycle || !group.year || group.year === selectedStudentDetail.cycle;
                      return sameLevel && sameCycle;
                    }).length > 1 && (
                      <select value={selectedStudentDetail.groupId || ''} onChange={event => handleChangeStudentGroup(selectedStudentDetail, event.target.value)} className="ml-2 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-white">
                        <option value="">Cambiar grupo...</option>
                        {groups.filter(group => {
                          const sameLevel = !selectedStudentDetail.level || !group.level || group.level === selectedStudentDetail.level;
                          const sameCycle = !selectedStudentDetail.cycle || !group.year || group.year === selectedStudentDetail.cycle;
                          return sameLevel && sameCycle;
                        }).map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
                      </select>
                    )}
                  </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-300 pt-1">
                  <div><strong>Adecuación curricular:</strong> {selectedStudentDetail.curricularAdaptation === 'SI' ? `Sí. ${selectedStudentDetail.curricularAdaptationDetails || ''}` : 'No'}</div>
                  <div><strong>Conducta:</strong> {selectedStudentDetail.behaviorIssue === 'SI' ? `Sí. ${selectedStudentDetail.behaviorIssueDetails || ''}` : 'No'}</div>
                  <div><strong>Impedimento físico:</strong> {selectedStudentDetail.physicalImpairment === 'SI' ? `Sí. ${selectedStudentDetail.physicalImpairmentDetails || ''}` : 'No'}</div>
                </div>
              </div>

              {/* Sección II */}
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 space-y-2">
                <h4 className="font-bold text-red-400 uppercase text-xs">II. Familiares y Encargados</h4>
                  <div className="space-y-1 text-slate-700 dark:text-slate-300">
                  <div><strong>Estado civil:</strong> {selectedStudentDetail.maritalStatus || 'N/A'} · <strong>Hermanos:</strong> {selectedStudentDetail.siblingCount || 'N/A'}{selectedStudentDetail.siblingDetails ? ` (${selectedStudentDetail.siblingDetails})` : ''}</div>
                  {selectedStudentDetail.authorizedPickupPeople && <div><strong>Autorizados para retirar:</strong> {selectedStudentDetail.authorizedPickupPeople}</div>}
                  {selectedStudentDetail.family?.mother?.fullName && (
                    <div><strong className="text-slate-900 dark:text-white">Madre:</strong> {selectedStudentDetail.family.mother.fullName} (Céd: {selectedStudentDetail.family.mother.nationalId}) · Tel: {selectedStudentDetail.family.mother.phone1}</div>
                  )}
                  {selectedStudentDetail.family?.father?.fullName && (
                    <div><strong className="text-slate-900 dark:text-white">Padre:</strong> {selectedStudentDetail.family.father.fullName} (Céd: {selectedStudentDetail.family.father.nationalId}) · Tel: {selectedStudentDetail.family.father.phone1}</div>
                  )}
                  {selectedStudentDetail.family?.guardian?.fullName && (
                    <div><strong className="text-slate-900 dark:text-white">Encargado Legal:</strong> {selectedStudentDetail.family.guardian.fullName} ({selectedStudentDetail.family.guardian.relationship}) · Tel: {selectedStudentDetail.family.guardian.phone1}</div>
                  )}
                </div>
              </div>

              {/* Sección III */}
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 space-y-2">
                <h4 className="font-bold text-red-400 uppercase text-xs">III. Documentos Faltantes y Estado</h4>
                <div className="flex gap-4 text-slate-300">
                  <div><strong>Cédula Menor:</strong> {formatDocumentStatus(selectedStudentDetail.documents?.minorId?.status)}</div>
                  <div><strong>Bautismo:</strong> {formatDocumentStatus(selectedStudentDetail.documents?.bautismo?.status)}</div>
                  <div><strong>Comunión:</strong> {formatDocumentStatus(selectedStudentDetail.documents?.comunion?.status)}</div>
                </div>
              </div>

              {/* Sección IV: Firma */}
              <div className="bg-slate-900/60 p-3 rounded-xl border border-slate-800 space-y-2 text-center">
                <h4 className="font-bold text-red-400 uppercase text-xs">IV. Firma Digital Registrada</h4>
                <p className={`text-xs font-semibold ${selectedStudentDetail.acceptsCatechesisCommitment ? 'text-emerald-400' : 'text-amber-400'}`}>
                  Compromiso de formación en la fe: {selectedStudentDetail.acceptsCatechesisCommitment ? 'Aceptado' : 'No registrado'}
                </p>
                <p className="commitment-text text-left text-xs leading-relaxed">
                  ME COMPROMETO A CUMPLIR CON LA FORMACIÓN EN LA FE Y PARTICIPAR EN LO QUE SE REQUIERE EN LA CATEQUESIS, ENCUENTROS FAMILIARES Y MISAS DE NIÑOS, PARA QUE MI HIJO O HIJA CREZCA ESPIRITUALMENTE COMO HIJO DE DIOS Y APRENDA A VIVIR CRISTIANAMENTE.
                </p>
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
