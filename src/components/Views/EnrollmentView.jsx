import React, { useState, useRef, useEffect } from 'react';
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { APPS_SCRIPT_URL } from '../../utils/constants';
import { compressImage, fileToBase64, generateIDCardPdf } from '../../utils/documentProcessor';
import { validateBirthDate, validateNationalId, validatePhone, validateEmail } from '../../utils/validators';

const LEVELS = [
  'Cate-Kinder',
  'Primer Nivel',
  'Segundo Nivel',
  'Tercer Nivel (Primera Comunión)',
  'Cuarto Nivel',
  'Quinto Nivel',
  'Sexto Nivel',
  'Septimo Nivel',
  'Confirma',
];

export default function EnrollmentView({
  currentUser,
  parroquias = [],
  diaconias = [],
  groups = [],
  paymentRecords = [],
  setPaymentRecords,
  handlePrintPaymentReceipt,
  handleGeneratePaymentProofPdf,
  handleViewPaymentQr,
  onNavigate,
  cardBgClass = 'bg-white border-slate-200 text-slate-800',
  inputBgClass = 'bg-white border-slate-300 text-slate-800',
  initialStudent = null,
  themeMode = 'light',
  readOnly = false
}) {
  // Cálculo automático del ciclo catequético
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth(); // 0 = Enero, 3 = Abril
  const defaultCycle = currentMonth <= 3 
    ? `${currentYear - 1}-${currentYear}` 
    : `${currentYear}-${currentYear + 1}`;

  const [cycle, setCycle] = useState(initialStudent?.cycle || defaultCycle);
  const [selectedParroquiaId, setSelectedParroquiaId] = useState(initialStudent?.parroquiaId || currentUser?.parroquiaId || '');
  const [selectedDiaconiaId, setSelectedDiaconiaId] = useState(initialStudent?.diaconiaId || currentUser?.diaconiaId || '');

  // Sincronizar selección inicial de Parroquia y Diaconía según currentUser
  useEffect(() => {
    if (currentUser?.parroquiaId) {
      setSelectedParroquiaId(currentUser.parroquiaId);
    } else if (parroquias.length > 0 && !selectedParroquiaId) {
      setSelectedParroquiaId(parroquias[0].id);
    }
  }, [currentUser, parroquias]);

  useEffect(() => {
    if (currentUser?.diaconiaId) {
      setSelectedDiaconiaId(currentUser.diaconiaId);
    } else if (selectedParroquiaId) {
      const filtered = diaconias.filter(d => d.parroquiaId === selectedParroquiaId);
      if (filtered.length > 0) {
        setSelectedDiaconiaId(filtered[0].id);
      } else {
        setSelectedDiaconiaId('');
      }
    }
  }, [currentUser, selectedParroquiaId, diaconias]);

  // Sección I: Datos del Catequizando
  const [student, setStudent] = useState({
    fullName: initialStudent?.fullName || initialStudent?.name || '',
    idType: initialStudent?.idType || 'NACIONAL',
    nationalId: initialStudent?.nationalId || '',
    birthDate: initialStudent?.birthDate || '',
    age: initialStudent?.age || 0,
    phone: initialStudent?.phone || '',
    level: initialStudent?.level || 'Primer Nivel',
    gender: initialStudent?.gender || '',
    birthPlace: initialStudent?.birthPlace || '',
    educationCenter: initialStudent?.educationCenter || '',
    schoolGrade: initialStudent?.schoolGrade || '',
    curricularAdaptation: initialStudent?.curricularAdaptation || 'NO',
    curricularAdaptationDetails: initialStudent?.curricularAdaptationDetails || '',
    behaviorIssue: initialStudent?.behaviorIssue || 'NO',
    behaviorIssueDetails: initialStudent?.behaviorIssueDetails || '',
    physicalImpairment: initialStudent?.physicalImpairment || 'NO',
    physicalImpairmentDetails: initialStudent?.physicalImpairmentDetails || '',
    medicalNotes: initialStudent?.medicalNotes || '',
    address: initialStudent?.address || '',
    maritalStatus: initialStudent?.maritalStatus || '',
    siblingCount: initialStudent?.siblingCount || 'N/A',
    siblingDetails: initialStudent?.siblingDetails || '',
    authorizedPickupPeople: initialStudent?.authorizedPickupPeople || '',
    acceptsCatechesisCommitment: Boolean(initialStudent?.acceptsCatechesisCommitment)
  });

  const [studentPhotoFile, setStudentPhotoFile] = useState(null);
  const [studentPhotoPreview, setStudentPhotoPreview] = useState(initialStudent?.photoData || initialStudent?.photoUrl || '');

  // Sección II: Familiares / Encargados
  const [mother, setMother] = useState({
    fullName: initialStudent?.family?.mother?.fullName || '',
    idType: initialStudent?.family?.mother?.idType || 'NACIONAL',
    nationalId: initialStudent?.family?.mother?.nationalId || '',
    phone1: initialStudent?.family?.mother?.phone1 || '',
    phone2: initialStudent?.family?.mother?.phone2 || '',
    email: initialStudent?.family?.mother?.email || ''
  });
  const [father, setFather] = useState({
    fullName: initialStudent?.family?.father?.fullName || '',
    idType: initialStudent?.family?.father?.idType || 'NACIONAL',
    nationalId: initialStudent?.family?.father?.nationalId || '',
    phone1: initialStudent?.family?.father?.phone1 || '',
    phone2: initialStudent?.family?.father?.phone2 || '',
    email: initialStudent?.family?.father?.email || ''
  });
  const [guardian, setGuardian] = useState({
    fullName: initialStudent?.family?.guardian?.fullName || '',
    idType: initialStudent?.family?.guardian?.idType || 'NACIONAL',
    nationalId: initialStudent?.family?.guardian?.nationalId || '',
    phone1: initialStudent?.family?.guardian?.phone1 || '',
    phone2: initialStudent?.family?.guardian?.phone2 || '',
    email: initialStudent?.family?.guardian?.email || '',
    relationship: initialStudent?.family?.guardian?.relationship || ''
  });

  // Archivos y estados "Queda pendiente de entregar"
  const [motherIdFiles, setMotherIdFiles] = useState([]);
  const [motherIdPending, setMotherIdPending] = useState(!initialStudent?.family?.mother?.idCardUrl);

  const [fatherIdFiles, setFatherIdFiles] = useState([]);
  const [fatherIdPending, setFatherIdPending] = useState(!initialStudent?.family?.father?.idCardUrl);

  const [guardianIdFiles, setGuardianIdFiles] = useState([]);
  const [guardianIdPending, setGuardianIdPending] = useState(!initialStudent?.family?.guardian?.idCardUrl);

  const [minorIdFiles, setMinorIdFiles] = useState([]);
  const [minorIdPending, setMinorIdPending] = useState(initialStudent?.documents?.minorId?.status !== 'COMPLETED');

  const [baptismFile, setBaptismFile] = useState(null);
  const [baptismPending, setBaptismPending] = useState(initialStudent?.documents?.bautismo?.status !== 'COMPLETED');

  const [communionFile, setCommunionFile] = useState(null);
  const [communionPending, setCommunionPending] = useState(initialStudent?.documents?.comunion?.status !== 'COMPLETED');

  // Estado N/A de Alergias / Padecimientos
  const [medicalNotesNa, setMedicalNotesNa] = useState(initialStudent?.medicalNotes === 'N/A');

  // Mensaje flotante / Alerta de éxito
  const [successToast, setSuccessToast] = useState(null);

  const renderExistingDocumentLink = (url, label = 'Descargar archivo') => {
    if (!readOnly || !url) return null;
    const urls = Array.isArray(url) ? url : [url];
    return (
      <div className="flex flex-wrap gap-2">
        {urls.filter(Boolean).map((item, index) => (
          <a key={`${item}-${index}`} href={item} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg bg-sky-700 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-sky-800">
            📥 {urls.length > 1 ? `${label} ${index + 1}` : label}
          </a>
        ))}
      </div>
    );
  };

  // Manejar cambio de archivos y actualizar el estado de pendiente
  const handleFileChange = (setter, pendingSetter, files) => {
    const fileList = Array.isArray(files) ? files : (files ? [files] : []);
    if (fileList.length > 0) {
      setter(Array.isArray(files) ? files : files);
      pendingSetter(false);
    } else {
      setter(Array.isArray(files) ? [] : null);
      pendingSetter(true);
    }
  };

  const handleRemoveFiles = (setter, pendingSetter, isArray = true) => {
    if (isArray) {
      setter([]);
    } else {
      setter(null);
    }
    pendingSetter(true);
  };

  // Función para reiniciar el formulario tras matricular a una persona y hacer scroll al inicio
  const resetForm = () => {
    setStudent({
      fullName: '',
      idType: 'NACIONAL',
      nationalId: '',
      birthDate: '',
      age: 0,
      phone: '',
      level: 'Primer Nivel',
      gender: '',
      birthPlace: '',
      educationCenter: '',
      schoolGrade: '',
      curricularAdaptation: 'NO',
      curricularAdaptationDetails: '',
      behaviorIssue: 'NO',
      behaviorIssueDetails: '',
      physicalImpairment: 'NO',
      physicalImpairmentDetails: '',
      medicalNotes: '',
      address: '',
      maritalStatus: '',
      siblingCount: 'N/A',
      siblingDetails: '',
      authorizedPickupPeople: '',
      acceptsCatechesisCommitment: false
    });
    setStudentPhotoFile(null);
    setStudentPhotoPreview('');
    setMedicalNotesNa(false);
    setMother({ fullName: '', idType: 'NACIONAL', nationalId: '', phone1: '', phone2: '', email: '' });
    setFather({ fullName: '', idType: 'NACIONAL', nationalId: '', phone1: '', phone2: '', email: '' });
    setGuardian({ fullName: '', idType: 'NACIONAL', nationalId: '', phone1: '', phone2: '', email: '', relationship: 'Otro' });
    setMotherIdFiles([]);
    setMotherIdPending(true);
    setFatherIdFiles([]);
    setFatherIdPending(true);
    setGuardianIdFiles([]);
    setGuardianIdPending(true);
    setMinorIdFiles([]);
    setMinorIdPending(true);
    setBaptismFile(null);
    setBaptismPending(true);
    setCommunionFile(null);
    setCommunionPending(true);
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setSignatureData(null);
    setShowPaymentModal(false);
    setGeneratedReceipt(null);
    setRegisteredStudentId(null);

    // Regresar suavemente al principio del formulario
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Firma
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [signatureData, setSignatureData] = useState(initialStudent?.family?.guardian?.signatureData || null);

  const handleStudentPhotoChange = (file) => {
    setStudentPhotoFile(file || null);
    setStudentPhotoPreview(file ? URL.createObjectURL(file) : (initialStudent?.photoData || initialStudent?.photoUrl || ''));
  };

  // Modal de Pago y Recibo
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [registeredStudentId, setRegisteredStudentId] = useState(null);
  const [paymentOption, setPaymentOption] = useState('MATRICULA'); // MATRICULA | LIBRO | MATRICULA_LIBRO
  const [customAmount, setCustomAmount] = useState(3000);
  const [paymentMethod, setPaymentMethod] = useState('EFECTIVO');
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [generatedReceipt, setGeneratedReceipt] = useState(null);

  const documentCount = [
    [mother.fullName, mother.nationalId, mother.phone1, mother.email].some(value => String(value || '').trim()),
    [father.fullName, father.nationalId, father.phone1, father.email].some(value => String(value || '').trim()),
    [guardian.fullName, guardian.nationalId, guardian.phone1, guardian.email].some(value => String(value || '').trim()),
    Boolean(student.birthDate && student.age >= 12),
    true,
    ['Cuarto Nivel', 'Quinto Nivel', 'Sexto Nivel', 'Septimo Nivel', 'Confirma'].includes(student.level)
  ].filter(Boolean).length;
  const documentCardSpanClass = documentCount === 1 ? 'lg:col-span-6' : documentCount === 2 ? 'lg:col-span-3' : 'lg:col-span-2';

  const getPaymentConcept = (option = paymentOption) => {
    if (option === 'LIBRO') return 'Pago de libro';
    if (option === 'MATRICULA_LIBRO') return 'Pago de matrícula + libro';
    return 'Pago de matrícula';
  };

  // Calcular Edad automáticamente
  useEffect(() => {
    if (student.birthDate) {
      const birth = new Date(student.birthDate);
      const today = new Date();
      let calculatedAge = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        calculatedAge--;
      }
      setStudent((prev) => ({ ...prev, age: calculatedAge }));
    }
  }, [student.birthDate]);

  // Entre 12 y 17 años la identificación por defecto es cédula de menor;
  // a partir de los 18 se usa cédula nacional. DIMEX y pasaporte se respetan.
  useEffect(() => {
    setStudent((prev) => {
      if (prev.age >= 12 && prev.age <= 17 && prev.idType === 'NACIONAL') return { ...prev, idType: 'MENOR' };
      if (prev.age >= 18 && prev.idType === 'MENOR') return { ...prev, idType: 'NACIONAL' };
      return prev;
    });
  }, [student.age]);

  // Actualizar monto según nivel y opción de pago
  useEffect(() => {
    const isHighLevel = ['Sexto Nivel', 'Septimo Nivel', 'Confirma'].includes(student.level);
    const bookPrice = isHighLevel ? 4000 : 3500;

    if (paymentOption === 'SIN_PAGO') {
      setCustomAmount(0);
    } else if (paymentOption === 'MATRICULA') {
      setCustomAmount(3000);
    } else if (paymentOption === 'LIBRO') {
      setCustomAmount(bookPrice);
    } else {
      setCustomAmount(3000 + bookPrice);
    }
  }, [paymentOption, student.level]);

  // Manejadores Canvas Firma
  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;

    ctx.lineTo(x, y);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      const canvas = canvasRef.current;
      setSignatureData(canvas.toDataURL('image/png'));
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureData(null);
  };

  // Subida de archivos a Google Drive vía Apps Script
  const uploadToDrive = async (base64, fileName, contentType = 'application/pdf') => {
    if (!base64 || !APPS_SCRIPT_URL) return null;
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'uploadFile',
          fileName: `${student.fullName}_${fileName}`,
          fileBase64: base64,
          contentType: contentType
        })
      });
      const res = await response.json();
      return res.status === 'success' ? res.fileUrl : null;
    } catch (err) {
      console.error('Error al subir archivo a Drive:', err);
      return null;
    }
  };

  // Procesador de Cédulas (si son fotos crea PDF centrado)
  const processIDCard = async (files, label) => {
    if (!files || files.length === 0) return null;
    if (files[0].type === 'application/pdf') {
      const b64 = await fileToBase64(files[0]);
      return await uploadToDrive(b64, `${label}.pdf`, 'application/pdf');
    } else {
      const b64Images = [];
      for (const file of files) {
        const compressed = await compressImage(file);
        b64Images.push(compressed);
      }
      const pdfBase64 = await generateIDCardPdf(b64Images);
      return await uploadToDrive(pdfBase64, `${label}.pdf`, 'application/pdf');
    }
  };

  // Validación y Envío del Formulario
  const handleSubmitEnrollment = async (e) => {
    e.preventDefault();
    const isEditing = Boolean(initialStudent?.id);

    // En edición se permite guardar únicamente los cambios realizados, sin
    // volver a exigir los campos obligatorios de una matrícula nueva.
    if (!isEditing) {
      // 1. Validar Nombre completo del catequizando
      if (!student.fullName || student.fullName.trim().length < 3) {
        alert('Por favor ingrese el nombre completo del catequizando (mínimo 3 caracteres).');
        return;
      }

      // 2. Validar Fecha de nacimiento (>= 1900 y <= hoy)
      const birthVal = validateBirthDate(student.birthDate);
      if (!birthVal.valid) {
        alert(`Fecha de nacimiento del catequizando no válida: ${birthVal.message}`);
        return;
      }

      // 3. Validar Cédula del menor (si aplica por edad >= 12)
      if (student.birthDate && student.age >= 12 && student.nationalId) {
        const minorIdVal = validateNationalId(student.nationalId, student.idType, 'Cédula de Menor');
        if (!minorIdVal.valid) {
          alert(minorIdVal.message);
          return;
        }
      }
    }

    // 4. Validar Teléfono del catequizando (si se ingresó)
    if (student.phone) {
      const studentPhoneVal = validatePhone(student.phone, 'catequizando');
      if (!studentPhoneVal.valid) {
        alert(studentPhoneVal.message);
        return;
      }
    }

    // 5. Validar al menos un familiar/encargado con datos básicos (Nombre, Cédula y Teléfono)
    const isMotherFilled = Boolean(mother.fullName || mother.nationalId || mother.phone1);
    const isFatherFilled = Boolean(father.fullName || father.nationalId || father.phone1);
    const isGuardianFilled = Boolean(guardian.fullName || guardian.nationalId || guardian.phone1);

    const isMotherComplete = mother.fullName && mother.nationalId && mother.phone1;
    const isFatherComplete = father.fullName && father.nationalId && father.phone1;
    const isGuardianComplete = guardian.fullName && guardian.nationalId && guardian.phone1;

    if (!isEditing && !isMotherComplete && !isFatherComplete && !isGuardianComplete) {
      alert('Debe completar la información básica (Nombre completo, Cédula y Teléfono 1) de al menos uno de los tres encargados (Mamá, Papá o Encargado Legal).');
      return;
    }

    // Validaciones específicas para Mamá si se llenó información
    if (isMotherFilled) {
      if (mother.nationalId) {
        const val = validateNationalId(mother.nationalId, mother.idType, 'Identificación de la Madre');
        if (!val.valid) { alert(val.message); return; }
      }
      if (mother.phone1) {
        const val = validatePhone(mother.phone1, 'Teléfono 1 de la Madre');
        if (!val.valid) { alert(val.message); return; }
      }
      if (mother.phone2) {
        const val = validatePhone(mother.phone2, 'Teléfono 2 de la Madre');
        if (!val.valid) { alert(val.message); return; }
      }
      if (mother.email) {
        const val = validateEmail(mother.email, 'Correo electrónico de la Madre');
        if (!val.valid) { alert(val.message); return; }
      }
    }

    // Validaciones específicas para Papá si se llenó información
    if (isFatherFilled) {
      if (father.nationalId) {
        const val = validateNationalId(father.nationalId, father.idType, 'Identificación del Padre');
        if (!val.valid) { alert(val.message); return; }
      }
      if (father.phone1) {
        const val = validatePhone(father.phone1, 'Teléfono 1 del Padre');
        if (!val.valid) { alert(val.message); return; }
      }
      if (father.phone2) {
        const val = validatePhone(father.phone2, 'Teléfono 2 del Padre');
        if (!val.valid) { alert(val.message); return; }
      }
      if (father.email) {
        const val = validateEmail(father.email, 'Correo electrónico del Padre');
        if (!val.valid) { alert(val.message); return; }
      }
    }

    // Validaciones específicas para Encargado Legal si se llenó información
    if (isGuardianFilled) {
      if (guardian.nationalId) {
        const val = validateNationalId(guardian.nationalId, guardian.idType, 'Identificación del Encargado Legal');
        if (!val.valid) { alert(val.message); return; }
      }
      if (guardian.phone1) {
        const val = validatePhone(guardian.phone1, 'Teléfono 1 del Encargado Legal');
        if (!val.valid) { alert(val.message); return; }
      }
      if (guardian.phone2) {
        const val = validatePhone(guardian.phone2, 'Teléfono 2 del Encargado Legal');
        if (!val.valid) { alert(val.message); return; }
      }
      if (guardian.email) {
        const val = validateEmail(guardian.email, 'Correo electrónico del Encargado Legal');
        if (!val.valid) { alert(val.message); return; }
      }
    }

    // Validar Cédula de menor adjunta o pendiente si tiene 12+ años
    if (!isEditing && student.birthDate && student.age >= 12 && minorIdFiles.length === 0 && !minorIdPending) {
      alert('Para mayores de 12 años debe adjuntar la Cédula de Menor o marcarla como pendiente de entregar.');
      return;
    }

    // Validar Firma
    const existingSignatureData = initialStudent?.family?.guardian?.signatureData || null;
    const existingSignatureUrl = initialStudent?.family?.guardian?.signatureUrl || null;
    if (!isEditing && !signatureData && !existingSignatureData && !existingSignatureUrl) {
      alert('Es obligatoria la firma digital del encargado.');
      return;
    }

    if (!isEditing && !student.acceptsCatechesisCommitment) {
      alert('Debe aceptar el compromiso de formación en la fe para completar la matrícula.');
      return;
    }

    setIsSaving(true);

    try {
      // Obtener nombres de Parroquia y Diaconía seleccionadas
      const matchedParroquia = parroquias.find(p => p.id === selectedParroquiaId);
      const matchedDiaconia = diaconias.find(d => d.id === selectedDiaconiaId);

      const parishName = matchedParroquia ? matchedParroquia.name : 'Parroquia no especificada';
      const diaconiaName = matchedDiaconia ? matchedDiaconia.name : 'Diaconía no especificada';

      // 1. Procesamiento y Subida de Archivos
      const motherIdUrl = motherIdPending ? null : (await processIDCard(motherIdFiles, 'Cedula_Mama')) || initialStudent?.family?.mother?.idCardUrl || null;
      const fatherIdUrl = fatherIdPending ? null : (await processIDCard(fatherIdFiles, 'Cedula_Papa')) || initialStudent?.family?.father?.idCardUrl || null;
      const guardianIdUrl = guardianIdPending ? null : (await processIDCard(guardianIdFiles, 'Cedula_Encargado')) || initialStudent?.family?.guardian?.idCardUrl || null;
      const minorIdUrl = (student.age >= 12 && !minorIdPending) ? (await processIDCard(minorIdFiles, 'Cedula_Menor')) || initialStudent?.documents?.minorId?.url || null : null;

      // La foto es opcional; al actualizar se conserva la existente si no se eligió otra.
      let photoUrl = initialStudent?.photoUrl || null;
      let photoData = initialStudent?.photoData || null;
      if (studentPhotoFile) {
        // Una versión liviana queda en el expediente para verla y usarla en el PDF,
        // incluso si el enlace de Drive no permite lectura CORS en el navegador.
        const compressedPhoto = await compressImage(studentPhotoFile, 400, 0.55);
        photoData = compressedPhoto;
        photoUrl = await uploadToDrive(compressedPhoto.split(',')[1], 'Foto_Catequizando.jpg', 'image/jpeg');
      }

      // Se conserva la firma anterior al editar; solo se sube cuando se dibuja una nueva.
      let signatureUrl = existingSignatureUrl;
      let signatureDataToSave = signatureData || existingSignatureData;
      if (signatureData?.startsWith('data:image/')) {
        const signatureCleanB64 = signatureData.split(',')[1];
        signatureUrl = await uploadToDrive(signatureCleanB64, 'Firma.png', 'image/png');
      }

      // Subir Bautismo
      let baptismUrl = initialStudent?.documents?.bautismo?.url || null;
      if (!baptismPending && baptismFile) {
        const b64 = baptismFile.type === 'application/pdf' ? await fileToBase64(baptismFile) : (await compressImage(baptismFile)).split(',')[1];
        baptismUrl = await uploadToDrive(b64, 'Bautismo.pdf', baptismFile.type);
      }

      // Subir Comunión
      let communionUrl = initialStudent?.documents?.comunion?.url || null;
      if (!communionPending && communionFile) {
        const b64 = communionFile.type === 'application/pdf' ? await fileToBase64(communionFile) : (await compressImage(communionFile)).split(',')[1];
        communionUrl = await uploadToDrive(b64, 'Comunion.pdf', communionFile.type);
      }

      // 2. Guardar en Firestore
      const studentData = {
        // Se conserva `fullName` para el expediente y `name` para los módulos
        // operativos (asistencia, grupos y carnet QR).
        name: student.fullName,
        fullName: student.fullName,
        idType: (student.birthDate && student.age >= 12) ? student.idType : null,
        nationalId: (student.birthDate && student.age >= 12) ? student.nationalId : null,
        birthDate: student.birthDate,
        age: student.age,
        phone: student.phone || null,
        level: student.level,
        gender: student.gender || null,
        birthPlace: student.birthPlace || '',
        educationCenter: student.educationCenter || '',
        schoolGrade: student.schoolGrade || '',
        curricularAdaptation: student.curricularAdaptation || 'NO',
        curricularAdaptationDetails: student.curricularAdaptation === 'SI' ? student.curricularAdaptationDetails || '' : '',
        behaviorIssue: student.behaviorIssue || 'NO',
        behaviorIssueDetails: student.behaviorIssue === 'SI' ? student.behaviorIssueDetails || '' : '',
        physicalImpairment: student.physicalImpairment || 'NO',
        physicalImpairmentDetails: student.physicalImpairment === 'SI' ? student.physicalImpairmentDetails || '' : '',
        medicalNotes: student.medicalNotes || '',
        address: student.address || '',
        maritalStatus: student.maritalStatus || '',
        siblingCount: student.siblingCount || 'N/A',
        siblingDetails: student.siblingCount !== 'N/A' ? student.siblingDetails || '' : '',
        authorizedPickupPeople: student.authorizedPickupPeople || '',
        acceptsCatechesisCommitment: isEditing
          ? Boolean(student.acceptsCatechesisCommitment || initialStudent?.acceptsCatechesisCommitment)
          : true,
        photoUrl,
        photoData,
        cycle: cycle,
        parish: parishName,
        parroquiaId: selectedParroquiaId,
        diocesis: diaconiaName,
        diaconiaId: selectedDiaconiaId,
        family: {
          mother: { ...mother, idCardUrl: motherIdUrl, idCardPending: motherIdPending },
          father: { ...father, idCardUrl: fatherIdUrl, idCardPending: fatherIdPending },
          guardian: { ...guardian, idCardUrl: guardianIdUrl, idCardPending: guardianIdPending, signatureUrl, signatureData: signatureDataToSave }
        },
        documents: {
          minorId: { status: minorIdPending ? 'PENDING' : (minorIdUrl ? 'COMPLETED' : 'NOT_REQUIRED'), url: minorIdUrl },
          bautismo: { status: baptismPending ? 'PENDING' : (baptismUrl ? 'COMPLETED' : 'NOT_REQUIRED'), url: baptismUrl },
          comunion: { status: communionPending ? 'PENDING' : (communionUrl ? 'COMPLETED' : 'NOT_REQUIRED'), url: communionUrl }
        },
        bookPaid: false,
        status: 'ACTIVO',
        ...(isEditing ? {} : { createdAt: serverTimestamp() })
      };

      if (initialStudent?.id) {
        await updateDoc(doc(db, 'students', initialStudent.id), studentData);
        setIsSaving(false);
        alert('¡Los datos del expediente han sido actualizados con éxito!');
        if (typeof onNavigate === 'function') onNavigate('dashboard');
      } else {
        const docRef = await addDoc(collection(db, 'students'), studentData);
        setRegisteredStudentId(docRef.id);
        setIsSaving(false);
        setShowPaymentModal(true); // Abrir modal de pago automáticamente
      }

    } catch (err) {
      console.error('Error al matricular:', err);
      alert('Ocurrió un error al procesar la matrícula. Por favor intente de nuevo.');
      setIsSaving(false);
    }
  };

  // Procesar Pago y Generar Recibo
  const handleConfirmPayment = async () => {
    setIsSaving(true);
    try {
      const receiptNum = `REC-${Math.floor(100000 + Math.random() * 900000)}`;
      const isHighLevel = ['Sexto Nivel', 'Septimo Nivel', 'Confirma'].includes(student.level);
      const bookPrice = isHighLevel ? 4000 : 3500;

      let bookPaid = false;
      let contributionAmount = customAmount;

      if (paymentOption === 'MATRICULA_LIBRO') {
        bookPaid = true;
        contributionAmount = Math.max(0, customAmount - bookPrice);
      } else if (paymentOption === 'LIBRO') {
        bookPaid = true;
        contributionAmount = 0;
      }

      const paymentRecord = {
        studentId: registeredStudentId,
        studentName: student.fullName,
        receiptNumber: receiptNum,
        concept: getPaymentConcept(),
        totalAmount: Number(customAmount),
        contributionAmount: contributionAmount,
        bookAmount: bookPaid ? bookPrice : 0,
        paymentMethod: paymentMethod,
        cycle: cycle,
        date: new Date().toISOString()
      };

      await addDoc(collection(db, 'payments'), paymentRecord);

      const receiptObj = {
        receiptNum,
        studentName: student.fullName,
        amount: customAmount,
        concept: paymentRecord.concept,
        paymentMethod,
        date: new Date().toLocaleDateString('es-CR')
      };

      setGeneratedReceipt(receiptObj);
      setIsSaving(false);

    } catch (err) {
      console.error('Error al registrar pago:', err);
      alert('Error al registrar el pago.');
      setIsSaving(false);
    }
  };

  // Enviar Recibo por Correo Vía Apps Script (con PDF adjunto)
  const handleSendEmailReceipt = async () => {
    const emailList = [mother.email, father.email, guardian.email].filter((e) => e && e.trim() !== '');
    if (emailList.length === 0) {
      alert('No hay correos registrados en los datos de la familia para enviar el recibo.');
      return;
    }

    if (!APPS_SCRIPT_URL) {
      alert('Servicio de correo no configurado (falta APPS_SCRIPT_URL).');
      return;
    }

    setIsSendingEmail(true);

    try {
      let receiptNumber = generatedReceipt?.receiptNumber || '000001';
      const formattedNum = String(receiptNumber).padStart(6, '0');

      const matchedParroquia = parroquias.find(p => p.id === selectedParroquiaId);
      const parishName = matchedParroquia ? matchedParroquia.name : 'El Carmen';

      let pdfBase64 = '';

      // Generar PDF base64 del comprobante oficial térmico con QR y logo si hay comprobante generado
      if (generatedReceipt) {
        try {
          const { jsPDF } = await import('jspdf');
          const { toPng } = await import('html-to-image');

          const record = {
            id: generatedReceipt.id || `payment-${Date.now()}`,
            receiptNumber: receiptNumber,
            studentName: student.fullName,
            invoiceName: student.fullName,
            groupName: '',
            concept: getPaymentConcept(),
            amount: Number(customAmount),
            paymentMethod: paymentMethod,
            dateTime: new Date().toISOString(),
            date: new Date().toISOString().split('T')[0],
            issuedBy: currentUser?.fullName || currentUser?.displayName || 'Usuario'
          };

          const payloadQr = JSON.stringify({
            type: 'payment-proof',
            paymentId: record.id,
            studentName: record.studentName,
            invoiceName: record.invoiceName,
            concept: record.concept,
            amount: record.amount,
            dateTime: record.dateTime,
            issuedBy: record.issuedBy,
            paymentMethod: record.paymentMethod
          });

          const rawQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(payloadQr)}`;
          let qrUrl = rawQrUrl;
          try {
            const qrRes = await fetch(rawQrUrl);
            if (qrRes.ok) {
              const qrBlob = await qrRes.blob();
              qrUrl = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(qrBlob);
              });
            }
          } catch (e) {
            console.warn('QR fetch error for receipt:', e);
          }

          const dateValue = new Date(record.dateTime);
          const dateText = dateValue.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
          const timeText = dateValue.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', hour12: true });
          const totalText = `₡${record.amount.toLocaleString('es-CR')}`;

          const receiptHtml = `
            <div style="width: 300px; max-width: 300px; margin: 0 auto; padding: 14px 12px; font-family: 'Courier New', Courier, monospace, Arial, sans-serif; color: #000; background: #fff; font-size: 11px; line-height: 1.35; box-sizing: border-box; text-align: left;">
              <div style="text-align: center; position: relative; padding-top: 2px; padding-bottom: 8px; border-bottom: 1.5px dashed #000;">
                <div style="position: absolute; top: 0; right: 0; font-size: 11.5px; font-weight: 700; letter-spacing: 0.5px;">N° ${formattedNum}</div>
                <img src="/favicon.svg" style="width: 42px; height: 42px; margin: 0 auto 4px; display: block;" alt="AsisCate" />
                <div style="font-size: 13.5px; font-weight: 800; margin: 2px 0 1px; text-transform: uppercase; letter-spacing: 0.5px;">COMPROBANTE DE PAGO</div>
                <div style="font-size: 9.5px; color: #333; margin: 0 0 2px;">Parroquia Nuestra Señora de ${parishName}</div>
              </div>

              <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dashed #444; font-size: 10px;">
                <span><strong>Fecha:</strong> ${dateText}</span>
                <span><strong>Hora:</strong> ${timeText}</span>
              </div>

              <div style="padding: 6px 0; border-bottom: 1.5px dashed #000;">
                <div style="margin-bottom: 5px;">
                  <span style="display: block; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #333;">A nombre de:</span>
                  <span style="font-size: 11px; font-weight: 700; word-break: break-word;">${record.invoiceName}</span>
                </div>
                <div style="margin-bottom: 5px;">
                  <span style="display: block; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #333;">Concepto:</span>
                  <span style="font-size: 11px; word-break: break-word;">${record.concept}</span>
                </div>
                <div style="margin-bottom: 5px;">
                  <span style="display: block; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #333;">Método de pago:</span>
                  <span style="font-size: 11px; word-break: break-word;">${record.paymentMethod}</span>
                </div>
                <div style="margin-bottom: 5px;">
                  <span style="display: block; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #333;">Factura emitida por:</span>
                  <span style="font-size: 11px; word-break: break-word;">${record.issuedBy}</span>
                </div>
              </div>

              <div style="padding: 7px 0; border-bottom: 1.5px dashed #000; display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; font-weight: 800;">
                <span>TOTAL PAGADO:</span>
                <span style="font-size: 14.5px;">${totalText}</span>
              </div>

              <div style="text-align: center; padding: 8px 0 4px;">
                <img src="${qrUrl}" style="width: 95px; height: 95px; margin: 0 auto; display: block; border: 1px solid #d1d5db; padding: 3px;" alt="QR Verificación" />
                <div style="font-size: 8px; color: #666; margin-top: 3px;">Escanear para verificar comprobante</div>
              </div>

              <div style="text-align: center; font-size: 9px; color: #333; margin-top: 6px; line-height: 1.4;">
                <div style="font-weight: 700;">¡Muchas gracias por su aporte!</div>
                <div>Documento válido como comprobante oficial.</div>
                <div style="font-weight: 700; margin-top: 2px; color: #7f1d1d;">AsisCate • Sistema Parroquial</div>
              </div>
            </div>
          `;

          const container = document.createElement('div');
          container.style.position = 'fixed';
          container.style.left = '0';
          container.style.top = '0';
          container.style.width = '300px';
          container.style.opacity = '0';
          container.style.pointerEvents = 'none';
          container.style.zIndex = '-9999';
          container.style.backgroundColor = '#ffffff';
          container.innerHTML = receiptHtml;
          document.body.appendChild(container);

          const ticketEl = container.firstElementChild || container;
          const imgs = Array.from(ticketEl.querySelectorAll('img'));
          await Promise.all(imgs.map(img => {
            if (img.complete && img.naturalWidth > 0) return Promise.resolve();
            return new Promise((res) => {
              img.onload = res;
              img.onerror = res;
              setTimeout(res, 600);
            });
          }));

          await new Promise(res => setTimeout(res, 80));

          const dataUrl = await toPng(ticketEl, {
            cacheBust: true,
            pixelRatio: 2,
            backgroundColor: '#ffffff'
          });

          if (container.parentNode) {
            container.parentNode.removeChild(container);
          }

          const img = new Image();
          img.src = dataUrl;
          await new Promise(resolve => {
            if (img.complete && img.naturalWidth > 0) resolve();
            else {
              img.onload = resolve;
              img.onerror = resolve;
              setTimeout(resolve, 500);
            }
          });

          const pdfWidthMm = 80;
          const imgAspectRatio = (img.naturalHeight || 500) / (img.naturalWidth || 300);
          const pdfHeightMm = Math.round(pdfWidthMm * imgAspectRatio);

          const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: [pdfWidthMm, pdfHeightMm]
          });

          pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidthMm, pdfHeightMm, undefined, 'FAST');

          pdfBase64 = pdf.output('datauristring').split(',')[1];
        } catch (pdfErr) {
          console.warn('No se pudo generar base64 del PDF térmico para el correo:', pdfErr);
        }
      }

      const payload = {
        action: 'sendReceiptEmail',
        recipients: emailList,
        studentName: student.fullName,
        receiptNumber: formattedNum,
        amount: customAmount,
        paymentMethod: paymentMethod,
        concept: getPaymentConcept(),
        cycle: cycle,
        parish: parishName,
        pdfBase64: pdfBase64
      };

      await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });

      alert(`¡Correo enviado con éxito adjuntando el comprobante PDF a: ${emailList.join(', ')}!`);
    } catch (err) {
      console.error('Error enviando correo:', err);
      alert('Se envió la petición de recibo a los encargados.');
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Diaconías filtradas según parroquia seleccionada
  const availableDiaconias = diaconias.filter(d => d.parroquiaId === selectedParroquiaId);

  return (
    <div className="space-y-6 relative">
      {/* Toast Flotante Fijo */}
      {successToast && (
        <div className="fixed top-20 right-4 sm:right-6 z-50 max-w-md bg-emerald-600 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center justify-between gap-3 text-sm font-semibold animate-bounce border-2 border-emerald-400">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🎉</span>
            <span>{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast(null)} className="text-white hover:text-emerald-200 text-xs font-bold px-2 py-1 bg-emerald-700/50 rounded-lg">
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">Expediente Digital de Matrícula</h2>
          <p className="text-xs sm:text-sm text-slate-400">Inscripción y gestión de expedientes parroquiales.</p>
        </div>
      </div>

      <form onSubmit={handleSubmitEnrollment} className="space-y-6">
        <fieldset disabled={readOnly} className="space-y-6">
        {/* SECCIÓN CONFIGURACIÓN GENERAL */}
        <div className={`${cardBgClass} p-4 sm:p-6 rounded-xl border shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4`}>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Ciclo Catequético *</label>
            <select value={cycle} onChange={(e) => setCycle(e.target.value)} className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`}>
              <option value={`${currentYear - 1}-${currentYear}`}>{`${currentYear - 1}-${currentYear}`}</option>
              <option value={`${currentYear}-${currentYear + 1}`}>{`${currentYear}-${currentYear + 1}`}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nivel al que se Matricula *</label>
            <select value={student.level} onChange={(e) => setStudent({ ...student, level: e.target.value })} className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`}>
              {LEVELS.map((lvl) => (<option key={lvl} value={lvl}>{lvl}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Parroquia *</label>
            <select
              value={selectedParroquiaId}
              onChange={(e) => {
                const newPId = e.target.value;
                setSelectedParroquiaId(newPId);
                const firstDiaconia = diaconias.find(d => d.parroquiaId === newPId);
                setSelectedDiaconiaId(firstDiaconia ? firstDiaconia.id : '');
              }}
              className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`}
            >
              <option value="">Seleccione una parroquia...</option>
              {parroquias.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Diaconía *</label>
            <select
              value={selectedDiaconiaId}
              onChange={(e) => setSelectedDiaconiaId(e.target.value)}
              className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`}
            >
              <option value="">Seleccione una diaconía...</option>
              {availableDiaconias.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* SECCIÓN I: DATOS DEL CATEQUIZANDO */}
        <div className={`${cardBgClass} p-4 sm:p-6 rounded-xl border shadow-sm space-y-4`}>
          <h3 className="text-base sm:text-lg font-bold border-b border-slate-700 pb-2 text-red-700 dark:text-red-400">Sección I: Datos del Catequizando</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:row-span-2 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-500 p-3 bg-slate-800/20">
              <span className="text-xs font-bold text-slate-400 uppercase mb-2">Foto opcional</span>
              {studentPhotoPreview ? (
                <img src={studentPhotoPreview} alt="Vista previa del catequizando" className="h-28 w-24 object-cover rounded-lg border border-slate-500" />
              ) : (
                <div className="h-28 w-24 rounded-lg bg-slate-700/70 flex items-center justify-center text-3xl" aria-label="Sin foto">👤</div>
              )}
              {!readOnly && <input type="file" accept="image/*" onChange={(e) => handleStudentPhotoChange(e.target.files?.[0])} className="mt-3 w-full text-xs text-slate-400" />}
              {studentPhotoPreview && <button type="button" onClick={() => handleStudentPhotoChange(null)} className="mt-2 text-xs text-rose-400 hover:underline">Quitar foto nueva</button>}
            </div>
            <div className="md:col-span-2">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className={student.level !== 'Cate-Kinder' && student.level !== 'Primer Nivel' && student.level !== 'Segundo Nivel' ? 'sm:col-span-3' : 'sm:col-span-4'}>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nombre Completo *</label>
                  <input required type="text" value={student.fullName} onChange={(e) => setStudent({ ...student, fullName: e.target.value })} className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
                </div>
                {student.level !== 'Cate-Kinder' && student.level !== 'Primer Nivel' && student.level !== 'Segundo Nivel' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Teléfono</label>
                    <input type="text" value={student.phone} onChange={(e) => setStudent({ ...student, phone: e.target.value })} className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1 flex justify-between items-center">
                <span>Fecha de Nacimiento *</span>
                {Boolean(student.birthDate) && (
                  <span className="text-emerald-500 font-bold normal-case text-xs">({student.age} años)</span>
                )}
              </label>
              <input
                required
                type="date"
                min="1900-01-01"
                max={new Date().toISOString().split('T')[0]}
                value={student.birthDate}
                onChange={(e) => setStudent({ ...student, birthDate: e.target.value })}
                className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Género *</label>
              <div className="flex gap-5 rounded-lg px-3 py-2 border border-slate-600/70">
                {['Masculino', 'Femenino'].map((option) => (
                  <label key={option} className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input required type="radio" name="student-gender" value={option} checked={student.gender === option} onChange={(e) => setStudent({ ...student, gender: e.target.value })} className="text-red-800 focus:ring-red-800" />
                    {option}
                  </label>
                ))}
              </div>
            </div>

            {/* Campos de identificación: siempre quedan juntos y cambian según la edad. */}
            {Boolean(student.birthDate && student.age >= 12) && (
              <div className="md:col-span-3 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-amber-500 uppercase mb-1">Tipo de Identificación *</label>
                  <select value={student.idType} onChange={(e) => setStudent({ ...student, idType: e.target.value })} className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`}>
                    {student.age >= 18 ? <option value="NACIONAL">Cédula Nacional</option> : <option value="MENOR">Cédula de Menor</option>}
                    <option value="DIMEX">DIMEX</option>
                    <option value="PASAPORTE">Pasaporte</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-amber-500 uppercase mb-1">Número de Identificación *</label>
                  <input required type="text" value={student.nationalId} onChange={(e) => setStudent({ ...student, nationalId: e.target.value })} className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
                </div>
              </div>
            )}

            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Dirección de Residencia *</label>
              <input required type="text" value={student.address} onChange={(e) => setStudent({ ...student, address: e.target.value })} className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Lugar de nacimiento</label>
              <input type="text" value={student.birthPlace} onChange={(e) => setStudent({ ...student, birthPlace: e.target.value })} className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Centro educativo</label>
              <input type="text" value={student.educationCenter} onChange={(e) => setStudent({ ...student, educationCenter: e.target.value })} className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Grado que cursa</label>
              <input type="text" value={student.schoolGrade} onChange={(e) => setStudent({ ...student, schoolGrade: e.target.value })} className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
            </div>
            <div className="md:col-span-3 space-y-1">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-bold text-slate-400 uppercase">Alergias / Padecimientos o Notas Médicas</label>
                <label className="inline-flex items-center text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={medicalNotesNa}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setMedicalNotesNa(checked);
                      if (checked) {
                        setStudent((prev) => ({ ...prev, medicalNotes: 'N/A' }));
                      } else {
                        setStudent((prev) => ({ ...prev, medicalNotes: '' }));
                      }
                    }}
                    className="mr-1.5 rounded text-red-800 focus:ring-red-800"
                  />
                  <span>N/A (Ninguna)</span>
                </label>
              </div>
              <textarea
                rows="2"
                disabled={medicalNotesNa}
                value={student.medicalNotes}
                onChange={(e) => setStudent({ ...student, medicalNotes: e.target.value })}
                placeholder={medicalNotesNa ? 'Ninguna (N/A)' : 'Describa cualquier alergia, condición médica especial o notas...'}
                className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass} ${medicalNotesNa ? 'opacity-60 cursor-not-allowed' : ''}`}
              />
            </div>

            <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              ['curricularAdaptation', 'curricularAdaptationDetails', '¿Posee alguna adecuación curricular?'],
              ['behaviorIssue', 'behaviorIssueDetails', '¿Posee algún problema de conducta?'],
              ['physicalImpairment', 'physicalImpairmentDetails', '¿Tiene algún impedimento físico?']
            ].map(([answerKey, detailsKey, question], index, questions) => (
              <div key={answerKey} className={`rounded-xl border border-slate-600/70 p-3 ${questions.length % 2 === 1 && index === questions.length - 1 ? 'md:col-span-2 md:w-1/2 md:justify-self-center' : ''}`}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <span className="text-sm font-medium flex-1">{question}</span>
                  <div className="flex gap-4 text-sm">
                    {['SI', 'NO'].map((answer) => (
                      <label key={answer} className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" name={answerKey} value={answer} checked={student[answerKey] === answer} onChange={(e) => setStudent({ ...student, [answerKey]: e.target.value, ...(e.target.value === 'NO' ? { [detailsKey]: '' } : {}) })} className="text-red-800 focus:ring-red-800" />
                        {answer === 'SI' ? 'Sí' : 'No'}
                      </label>
                    ))}
                  </div>
                </div>
                {student[answerKey] === 'SI' && (
                  <textarea rows="3" value={student[detailsKey]} onChange={(e) => setStudent({ ...student, [detailsKey]: e.target.value })} placeholder="Indique los detalles" className={`mt-3 w-full rounded-lg px-3 py-2 text-sm resize-y ${inputBgClass}`} />
                )}
              </div>
            ))}
            </div>
          </div>
        </div>

        {/* SECCIÓN II: DATOS DE LA FAMILIA */}
        <div className={`${cardBgClass} p-4 sm:p-6 rounded-xl border shadow-sm space-y-4`}>
          <div className="border-b border-slate-700 pb-2">
            <h3 className="text-base sm:text-lg font-bold text-red-700 dark:text-red-400">Sección II: Datos de la Familia</h3>
            <p className="text-xs text-slate-400 mt-0.5">* Complete obligatoriamente al menos uno de los tres encargados.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Estado civil</label>
              <select value={student.maritalStatus} onChange={(e) => setStudent({ ...student, maritalStatus: e.target.value })} className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`}>
                <option value="">Seleccione una opción</option>
                <option>Soltero(a)</option><option>Casado(a)</option><option>Unión libre</option><option>Divorciado(a)</option><option>Viudo(a)</option><option>Separado(a)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Cantidad de hermanos</label>
              <select value={student.siblingCount} onChange={(e) => setStudent({ ...student, siblingCount: e.target.value, ...(e.target.value === 'N/A' ? { siblingDetails: '' } : {}) })} className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`}>
                <option value="N/A">N/A (no tiene)</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, '9+'].map((count) => <option key={count} value={count}>{count}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Detalle de hermanos (opcional)</label>
              <input type="text" disabled={student.siblingCount === 'N/A'} value={student.siblingDetails} onChange={(e) => setStudent({ ...student, siblingDetails: e.target.value })} placeholder="Ej.: 2 mayores y 1 menor" className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass} ${student.siblingCount === 'N/A' ? 'opacity-60 cursor-not-allowed' : ''}`} />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Personas autorizadas para retirar al niño</label>
              <textarea rows="2" value={student.authorizedPickupPeople} onChange={(e) => setStudent({ ...student, authorizedPickupPeople: e.target.value })} placeholder="Indique los nombres completos" className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
            </div>
          </div>

          {/* MADRE */}
          <div className="border border-slate-300 dark:border-slate-700/60 p-3.5 rounded-xl space-y-3 bg-slate-50 dark:bg-slate-800/20">
            <h4 className="font-semibold text-sm text-slate-700 dark:text-slate-200">Datos de la Madre</h4>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <input placeholder="Nombre completo" value={mother.fullName} onChange={(e) => setMother({ ...mother, fullName: e.target.value })} className={`md:col-span-2 rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
              <select aria-label="Tipo de identificación de la madre" value={mother.idType} onChange={(e) => setMother({ ...mother, idType: e.target.value })} className={`md:col-span-2 rounded-lg px-3 py-2 text-sm ${inputBgClass}`}><option value="NACIONAL">Cédula Nacional</option><option value="DIMEX">DIMEX</option><option value="PASAPORTE">Pasaporte</option></select>
              <input placeholder="Número de identificación" value={mother.nationalId} onChange={(e) => setMother({ ...mother, nationalId: e.target.value })} className={`md:col-span-2 rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
              <input placeholder="Teléfono principal" value={mother.phone1} onChange={(e) => setMother({ ...mother, phone1: e.target.value })} className={`md:col-span-2 rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
              <input placeholder="Teléfono secundario (Opcional)" value={mother.phone2} onChange={(e) => setMother({ ...mother, phone2: e.target.value })} className={`md:col-span-2 rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
              <input placeholder="Correo electrónico" type="email" value={mother.email} onChange={(e) => setMother({ ...mother, email: e.target.value })} className={`md:col-span-2 rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
            </div>
          </div>

          {/* PADRE */}
          <div className="border border-slate-300 dark:border-slate-700/60 p-3.5 rounded-xl space-y-3 bg-slate-50 dark:bg-slate-800/20">
            <h4 className="font-semibold text-sm text-slate-700 dark:text-slate-200">Datos del Padre</h4>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <input placeholder="Nombre completo" value={father.fullName} onChange={(e) => setFather({ ...father, fullName: e.target.value })} className={`md:col-span-2 rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
              <select aria-label="Tipo de identificación del padre" value={father.idType} onChange={(e) => setFather({ ...father, idType: e.target.value })} className={`md:col-span-2 rounded-lg px-3 py-2 text-sm ${inputBgClass}`}><option value="NACIONAL">Cédula Nacional</option><option value="DIMEX">DIMEX</option><option value="PASAPORTE">Pasaporte</option></select>
              <input placeholder="Número de identificación" value={father.nationalId} onChange={(e) => setFather({ ...father, nationalId: e.target.value })} className={`md:col-span-2 rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
              <input placeholder="Teléfono principal" value={father.phone1} onChange={(e) => setFather({ ...father, phone1: e.target.value })} className={`md:col-span-2 rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
              <input placeholder="Teléfono secundario (Opcional)" value={father.phone2} onChange={(e) => setFather({ ...father, phone2: e.target.value })} className={`md:col-span-2 rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
              <input placeholder="Correo electrónico" type="email" value={father.email} onChange={(e) => setFather({ ...father, email: e.target.value })} className={`md:col-span-2 rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
            </div>
          </div>

          {/* ENCARGADO LEGAL */}
          <div className="border border-slate-300 dark:border-slate-700/60 p-3.5 rounded-xl space-y-3 bg-slate-50 dark:bg-slate-800/20">
            <h4 className="font-semibold text-sm text-slate-700 dark:text-slate-200">Encargado Legal (Si aplica)</h4>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <input placeholder="Nombre completo" value={guardian.fullName} onChange={(e) => setGuardian({ ...guardian, fullName: e.target.value })} className={`md:col-span-2 rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
              <select aria-label="Tipo de identificación del encargado" value={guardian.idType} onChange={(e) => setGuardian({ ...guardian, idType: e.target.value })} className={`md:col-span-2 rounded-lg px-3 py-2 text-sm ${inputBgClass}`}><option value="NACIONAL">Cédula Nacional</option><option value="DIMEX">DIMEX</option><option value="PASAPORTE">Pasaporte</option></select>
              <input placeholder="Número de identificación" value={guardian.nationalId} onChange={(e) => setGuardian({ ...guardian, nationalId: e.target.value })} className={`md:col-span-2 rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
              <input placeholder="Parentesco" value={guardian.relationship} onChange={(e) => setGuardian({ ...guardian, relationship: e.target.value })} className={`md:col-span-2 rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
              <input placeholder="Teléfono principal" value={guardian.phone1} onChange={(e) => setGuardian({ ...guardian, phone1: e.target.value })} className={`md:col-span-2 rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
              <input placeholder="Teléfono secundario (Opcional)" value={guardian.phone2} onChange={(e) => setGuardian({ ...guardian, phone2: e.target.value })} className={`md:col-span-2 rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
              <input placeholder="Correo electrónico" type="email" value={guardian.email} onChange={(e) => setGuardian({ ...guardian, email: e.target.value })} className={`md:col-span-6 rounded-lg px-3 py-2 text-sm ${inputBgClass}`} />
            </div>
          </div>
        </div>

        {/* SECCIÓN III: DOCUMENTOS Y ADJUNTOS */}
        <div className={`${cardBgClass} p-4 sm:p-6 rounded-xl border shadow-sm space-y-4`}>
          <h3 className="text-base sm:text-lg font-bold border-b border-slate-700 pb-2 text-red-700 dark:text-red-400">Sección III: Documentación</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">

            {/* Cédula Mamá */}
            {Boolean([mother.fullName, mother.nationalId, mother.phone1, mother.email].some(value => String(value || '').trim())) && <div className={`border border-slate-300 dark:border-slate-700/60 p-3 rounded-xl space-y-2 ${documentCardSpanClass}`}>
              <label className="block text-xs font-bold text-slate-400 uppercase">Cédula Mamá (Fotos Frente/Reverso o PDF)</label>
              {!readOnly && <input
                type="file"
                multiple
                accept="image/*,application/pdf"
                onChange={(e) => handleFileChange(setMotherIdFiles, setMotherIdPending, Array.from(e.target.files))}
                className="w-full text-xs text-slate-400"
              />}
              {motherIdFiles.length > 0 && (
                <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg text-xs">
                  <span className="text-emerald-400 font-semibold truncate max-w-[200px]">
                    📎 {motherIdFiles.length} archivo(s): {motherIdFiles.map(f => f.name).join(', ')}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFiles(setMotherIdFiles, setMotherIdPending, true)}
                    className="text-rose-400 hover:text-rose-300 text-xs font-bold ml-2"
                  >
                    Eliminar ✕
                  </button>
                </div>
              )}
              <p className={`text-xs font-semibold ${motherIdPending ? 'text-amber-400' : 'text-emerald-400'}`}>{motherIdPending ? 'Pendiente de entregar' : 'Adjunto listo'}</p>
              {renderExistingDocumentLink(initialStudent?.family?.mother?.idCardUrl)}
            </div>}

            {/* Cédula Papá */}
            {Boolean([father.fullName, father.nationalId, father.phone1, father.email].some(value => String(value || '').trim())) && <div className={`border border-slate-300 dark:border-slate-700/60 p-3 rounded-xl space-y-2 ${documentCardSpanClass}`}>
              <label className="block text-xs font-bold text-slate-400 uppercase">Cédula Papá (Fotos Frente/Reverso o PDF)</label>
              {!readOnly && <input
                type="file"
                multiple
                accept="image/*,application/pdf"
                onChange={(e) => handleFileChange(setFatherIdFiles, setFatherIdPending, Array.from(e.target.files))}
                className="w-full text-xs text-slate-400"
              />}
              {fatherIdFiles.length > 0 && (
                <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg text-xs">
                  <span className="text-emerald-400 font-semibold truncate max-w-[200px]">
                    📎 {fatherIdFiles.length} archivo(s): {fatherIdFiles.map(f => f.name).join(', ')}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFiles(setFatherIdFiles, setFatherIdPending, true)}
                    className="text-rose-400 hover:text-rose-300 text-xs font-bold ml-2"
                  >
                    Eliminar ✕
                  </button>
                </div>
              )}
              <p className={`text-xs font-semibold ${fatherIdPending ? 'text-amber-400' : 'text-emerald-400'}`}>{fatherIdPending ? 'Pendiente de entregar' : 'Adjunto listo'}</p>
              {renderExistingDocumentLink(initialStudent?.family?.father?.idCardUrl)}
            </div>}

            {/* Cédula Encargado */}
            {Boolean([guardian.fullName, guardian.nationalId, guardian.phone1, guardian.email].some(value => String(value || '').trim())) && <div className={`border border-slate-300 dark:border-slate-700/60 p-3 rounded-xl space-y-2 ${documentCardSpanClass}`}>
              <label className="block text-xs font-bold text-slate-400 uppercase">Cédula Encargado (Fotos Frente/Reverso o PDF)</label>
              {!readOnly && <input
                type="file"
                multiple
                accept="image/*,application/pdf"
                onChange={(e) => handleFileChange(setGuardianIdFiles, setGuardianIdPending, Array.from(e.target.files))}
                className="w-full text-xs text-slate-400"
              />}
              {guardianIdFiles.length > 0 && (
                <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg text-xs">
                  <span className="text-emerald-400 font-semibold truncate max-w-[200px]">
                    📎 {guardianIdFiles.length} archivo(s): {guardianIdFiles.map(f => f.name).join(', ')}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFiles(setGuardianIdFiles, setGuardianIdPending, true)}
                    className="text-rose-400 hover:text-rose-300 text-xs font-bold ml-2"
                  >
                    Eliminar ✕
                  </button>
                </div>
              )}
              <p className={`text-xs font-semibold ${guardianIdPending ? 'text-amber-400' : 'text-emerald-400'}`}>{guardianIdPending ? 'Pendiente de entregar' : 'Adjunto listo'}</p>
              {renderExistingDocumentLink(initialStudent?.family?.guardian?.idCardUrl)}
            </div>}

            {/* Cédula Menor: Solo si birthDate está definida y la edad es >= 12 años */}
            {Boolean(student.birthDate && student.age >= 12) && (
              <div className={`border border-amber-500/50 bg-amber-500/10 p-3 rounded-xl space-y-2 ${documentCardSpanClass}`}>
                <label className="block text-xs font-bold text-slate-400 uppercase">
                  Cédula de Menor <span className="text-rose-400 font-bold">* (Obligatorio por edad)</span>
                </label>
                {!readOnly && <input
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  onChange={(e) => handleFileChange(setMinorIdFiles, setMinorIdPending, Array.from(e.target.files))}
                  className="w-full text-xs text-slate-400"
                />}
                {minorIdFiles.length > 0 && (
                  <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg text-xs">
                    <span className="text-emerald-400 font-semibold truncate max-w-[200px]">
                      📎 {minorIdFiles.length} archivo(s): {minorIdFiles.map(f => f.name).join(', ')}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFiles(setMinorIdFiles, setMinorIdPending, true)}
                      className="text-rose-400 hover:text-rose-300 text-xs font-bold ml-2"
                    >
                      Eliminar ✕
                    </button>
                  </div>
                )}
                <p className={`text-xs font-semibold ${minorIdPending ? 'text-amber-400' : 'text-emerald-400'}`}>{minorIdPending ? 'Pendiente de entregar' : 'Adjunto listo'}</p>
                {renderExistingDocumentLink(initialStudent?.documents?.minorId?.url)}
              </div>
            )}

            {/* Constancia de Bautismo */}
            <div className={`border border-slate-300 dark:border-slate-700/60 p-3 rounded-xl space-y-2 ${documentCardSpanClass}`}>
              <label className="block text-xs font-bold text-slate-400 uppercase">Constancia de Bautismo (Requerido de 1º a Confirma)</label>
              {!readOnly && <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => handleFileChange(setBaptismFile, setBaptismPending, e.target.files[0])}
                className="w-full text-xs text-slate-400"
              />}
              {baptismFile && (
                <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg text-xs">
                  <span className="text-emerald-400 font-semibold truncate max-w-[300px]">
                    📎 Archivo: {baptismFile.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFiles(setBaptismFile, setBaptismPending, false)}
                    className="text-rose-400 hover:text-rose-300 text-xs font-bold ml-2"
                  >
                    Eliminar ✕
                  </button>
                </div>
              )}
              <p className={`text-xs font-semibold ${baptismPending ? 'text-amber-400' : 'text-emerald-400'}`}>{baptismPending ? 'Pendiente de entregar' : 'Adjunto listo'}</p>
              {renderExistingDocumentLink(initialStudent?.documents?.bautismo?.url)}
            </div>

            {/* Prueba de Primera Comunión */}
            {['Cuarto Nivel', 'Quinto Nivel', 'Sexto Nivel', 'Septimo Nivel', 'Confirma'].includes(student.level) && (
              <div className={`border border-sky-500/30 bg-sky-500/10 p-3 rounded-xl space-y-2 ${documentCardSpanClass}`}>
                <label className="block text-xs font-bold text-sky-400 uppercase">Prueba de Primera Comunión (Certificado o Foto)</label>
                {!readOnly && <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => handleFileChange(setCommunionFile, setCommunionPending, e.target.files[0])}
                  className="w-full text-xs text-slate-400"
                />}
                {communionFile && (
                  <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg text-xs">
                    <span className="text-emerald-400 font-semibold truncate max-w-[300px]">
                      📎 Archivo: {communionFile.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFiles(setCommunionFile, setCommunionPending, false)}
                      className="text-rose-400 hover:text-rose-300 text-xs font-bold ml-2"
                    >
                      Eliminar ✕
                    </button>
                  </div>
                )}
                <p className={`text-xs font-semibold ${communionPending ? 'text-amber-400' : 'text-emerald-400'}`}>{communionPending ? 'Pendiente de entregar' : 'Adjunto listo'}</p>
                {renderExistingDocumentLink(initialStudent?.documents?.comunion?.url)}
              </div>
            )}
          </div>
        </div>

        {/* SECCIÓN IV: FIRMA DIGITAL */}
        <div className={`${cardBgClass} p-4 sm:p-6 rounded-xl border shadow-sm space-y-3`}>
          <div className="border-b border-slate-700 pb-2">
            <h3 className="text-base sm:text-lg font-bold text-red-700 dark:text-red-400">Sección IV: Firma Digital del Encargado *</h3>
            <p className="text-xs text-slate-400 mt-0.5">Firme con el dedo en pantallas táctiles o con el mouse.</p>
          </div>

          <div className="flex flex-col items-center pt-2">
            {initialStudent && (signatureData || initialStudent?.family?.guardian?.signatureUrl) && (
              <div className="mb-3 text-center">
                <p className="text-xs text-slate-400 mb-1">Firma actualmente registrada</p>
                <img src={signatureData || initialStudent?.family?.guardian?.signatureUrl} alt="Firma registrada" className="max-h-20 mx-auto rounded border border-slate-600 bg-white p-1" />
              </div>
            )}
            <canvas
              ref={canvasRef}
              width={400}
              height={160}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className="border-2 border-dashed border-slate-600 bg-white rounded-xl touch-none"
            />
            <button type="button" onClick={clearCanvas} className="mt-2 text-xs text-rose-400 hover:underline font-semibold">
              Limpiar firma
            </button>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 text-xs sm:text-sm cursor-pointer">
            <input
              required
              type="checkbox"
              checked={student.acceptsCatechesisCommitment}
              onChange={(e) => setStudent({ ...student, acceptsCatechesisCommitment: e.target.checked })}
              className="mt-0.5 rounded text-red-800 focus:ring-red-800"
            />
            <span className="leading-relaxed text-slate-200">
              <strong className="text-amber-700 dark:text-amber-300">Acepto el compromiso de formación en la fe.</strong> <span className="commitment-text" style={{ color: themeMode === 'dark' ? '#ffffff' : '#000000' }}>ME COMPROMETO A CUMPLIR CON LA FORMACIÓN EN LA FE Y PARTICIPAR EN LO QUE SE REQUIERE EN LA CATEQUESIS, ENCUENTROS FAMILIARES Y MISAS DE NIÑOS, PARA QUE MI HIJO O HIJA CREZCA ESPIRITUALMENTE COMO HIJO DE DIOS Y APRENDA A VIVIR CRISTIANAMENTE.</span>
            </span>
          </label>
        </div>

        {/* BOTÓN ENVIAR: oculto cuando el expediente está en modo solo lectura */}
        {!readOnly && (
          <div className="text-center pt-2">
            <button
              type="submit"
              disabled={isSaving}
              className="bg-red-800 hover:bg-red-900 disabled:bg-slate-700 text-white font-bold py-3 px-8 rounded-xl text-base shadow-lg transition duration-150 active:scale-95"
            >
              {isSaving ? 'Procesando Expediente...' : (initialStudent ? 'Guardar cambios' : 'Completar Matrícula')}
            </button>
          </div>
        )}
        </fieldset>
      </form>

      {/* MODAL DE PAGO AUTOMÁTICO VINCULADO AL MÓDULO DE PAGOS Y RECIBOS CON QR */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className={`${cardBgClass} rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4`}>
            <div className="flex justify-between items-center border-b border-slate-700 pb-2">
              <h3 className="text-lg font-bold">Registrar Pago de Matrícula</h3>
              <button
                type="button"
                onClick={() => {
                  const studentName = generatedReceipt?.studentName || student.fullName;
                  resetForm();
                  setSuccessToast(`¡Matrícula de ${studentName} completada con éxito! Formulario listo para un nuevo registro.`);
                  setTimeout(() => setSuccessToast(null), 6000);
                }}
                className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>

            {!generatedReceipt ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nombre del Catequizando</label>
                  <input type="text" disabled value={student.fullName} className={`w-full rounded-lg px-3 py-2 text-sm font-semibold opacity-75 ${inputBgClass}`} />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Concepto de Cobro</label>
                  <select value={paymentOption} onChange={(e) => setPaymentOption(e.target.value)} className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`}>
                    <option value="MATRICULA">Solo Matrícula (₡3,000)</option>
                    <option value="LIBRO">Solo Libro ({['Sexto Nivel', 'Septimo Nivel', 'Confirma'].includes(student.level) ? '₡4,000' : '₡3,500'})</option>
                    <option value="MATRICULA_LIBRO">Matrícula + Libro ({['Sexto Nivel', 'Septimo Nivel', 'Confirma'].includes(student.level) ? '₡7,000' : '₡6,500'})</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Monto a Cobrar (₡)</label>
                  <input type="number" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} className={`w-full rounded-lg px-3 py-2 text-lg font-bold text-red-500 ${inputBgClass}`} />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Método de Pago</label>
                  <div className="flex gap-4">
                    <label className="inline-flex items-center text-xs sm:text-sm cursor-pointer">
                      <input type="radio" value="EFECTIVO" checked={paymentMethod === 'EFECTIVO'} onChange={() => setPaymentMethod('EFECTIVO')} className="mr-2 text-red-800 focus:ring-red-800" />
                      Efectivo
                    </label>
                    <label className="inline-flex items-center text-xs sm:text-sm cursor-pointer">
                      <input type="radio" value="SINPE" checked={paymentMethod === 'SINPE'} onChange={() => setPaymentMethod('SINPE')} className="mr-2 text-red-800 focus:ring-red-800" />
                      SINPE Móvil
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      const studentName = student.fullName;
                      resetForm();
                      setSuccessToast(`¡Matrícula de ${studentName} completada con éxito! Formulario listo para un nuevo registro.`);
                      setTimeout(() => setSuccessToast(null), 6000);
                    }}
                    className="px-4 py-2 text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
                  >
                    Omitir Pago
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setIsSaving(true);
                      try {
                        const now = new Date();
                        const recordsList = Array.isArray(paymentRecords) ? paymentRecords : [];
                        const maxReceiptNum = recordsList.reduce((max, r) => {
                          const num = r.receiptNumber !== undefined && r.receiptNumber !== null
                            ? Number(r.receiptNumber)
                            : Number(String(r.id).replace(/\D/g, '').slice(-6) || 0);
                          return Math.max(max, isNaN(num) ? 0 : num);
                        }, 0);
                        const nextNum = maxReceiptNum > 0 ? maxReceiptNum + 1 : 1;

                        const matchedParroquia = parroquias.find(p => p.id === selectedParroquiaId);
                        const parishName = matchedParroquia ? matchedParroquia.name : '';
                        const isHighLevel = ['Sexto Nivel', 'Septimo Nivel', 'Confirma'].includes(student.level);
                        const bookPrice = isHighLevel ? 4000 : 3500;
                        const includesBook = paymentOption === 'LIBRO' || paymentOption === 'MATRICULA_LIBRO';
                        const contributionAmount = paymentOption === 'LIBRO'
                          ? 0
                          : paymentOption === 'MATRICULA_LIBRO'
                            ? Math.max(0, Number(customAmount) - bookPrice)
                            : Number(customAmount);

                        const newPaymentRecord = {
                          id: `payment-${Date.now()}`,
                          receiptNumber: nextNum,
                          studentId: registeredStudentId || '',
                          studentName: student.fullName,
                          invoiceName: student.fullName,
                          groupId: '',
                          groupName: student.level,
                          parish: parishName,
                          concept: getPaymentConcept(),
                          amount: Number(customAmount),
                          contributionAmount,
                          bookAmount: includesBook ? bookPrice : 0,
                          bookPaid: includesBook,
                          currency: 'CRC',
                          paymentMethod: paymentMethod === 'EFECTIVO' ? 'Efectivo' : 'Sinpe',
                          dateTime: now.toISOString(),
                          date: now.toISOString().split('T')[0],
                          issuedBy: currentUser?.fullName || currentUser?.displayName || 'Usuario',
                          createdBy: currentUser?.uid || currentUser?.id || 'system',
                          withoutMatricula: false
                        };

                        // 1. Guardar en Firestore colección 'payments'
                        try {
                          await addDoc(collection(db, 'payments'), newPaymentRecord);
                        } catch (dbErr) {
                          console.warn('No se pudo guardar pago en Firestore:', dbErr);
                        }

                        // 2. Actualizar estado local si está disponible
                        if (typeof setPaymentRecords === 'function') {
                          setPaymentRecords(prev => [newPaymentRecord, ...(Array.isArray(prev) ? prev : [])]);
                        }

                        setGeneratedReceipt(newPaymentRecord);
                        setIsSaving(false);
                      } catch (err) {
                        console.error('Error procesando pago de matrícula:', err);
                        alert('No se pudo completar el registro del pago.');
                        setIsSaving(false);
                      }
                    }}
                    disabled={isSaving}
                    className="bg-red-800 text-white font-bold px-4 py-2 rounded-lg hover:bg-red-900 text-xs sm:text-sm transition"
                  >
                    {isSaving ? 'Procesando...' : 'Generar Recibo'}
                  </button>
                </div>
              </div>
            ) : (
              /* VISTA DEL RECIBO GENERADO CON FORMATO Y ACCIONES DEL MÓDULO DE PAGOS */
              <div className="space-y-4">
                <div className="border border-slate-700 p-4 rounded-xl bg-slate-800/30 text-center space-y-1">
                  <h4 className="font-bold text-base text-emerald-500 mb-1">¡Matrícula y Pago Registrados!</h4>
                  <p className="text-xs font-mono text-slate-400">Recibo N° {String(generatedReceipt.receiptNumber).padStart(6, '0')}</p>
                  <p className="text-sm font-semibold text-slate-200">{generatedReceipt.studentName}</p>
                  <p className="text-2xl font-black text-emerald-400 my-2">₡{Number(generatedReceipt.amount).toLocaleString('es-CR')}</p>
                  <p className="text-xs text-slate-400">{generatedReceipt.concept} ({generatedReceipt.paymentMethod})</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {typeof handleViewPaymentQr === 'function' && (
                    <button
                      type="button"
                      onClick={() => handleViewPaymentQr(generatedReceipt)}
                      className="bg-sky-600/20 hover:bg-sky-600/30 text-sky-400 border border-sky-500/30 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1"
                    >
                      🖼️ Ver Comprobante QR
                    </button>
                  )}
                  {typeof handleGeneratePaymentProofPdf === 'function' && (
                    <button
                      type="button"
                      onClick={() => handleGeneratePaymentProofPdf(generatedReceipt)}
                      className="bg-violet-600/20 hover:bg-violet-600/30 text-violet-400 border border-violet-500/30 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1"
                    >
                      📄 Descargar PDF
                    </button>
                  )}
                  {typeof handlePrintPaymentReceipt === 'function' && (
                    <button
                      type="button"
                      onClick={() => handlePrintPaymentReceipt(generatedReceipt)}
                      className="col-span-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border border-amber-500/30 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1"
                    >
                      🖨️ Imprimir Comprobante Oficial (Ticket + QR)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSendEmailReceipt}
                    disabled={isSendingEmail}
                    className="col-span-2 bg-sky-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-sky-700 transition"
                  >
                    {isSendingEmail ? 'Enviando...' : '📧 Enviar por Correo a Encargados'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const studentName = generatedReceipt.studentName;
                      resetForm();
                      setSuccessToast(`¡Matrícula y Pago de ${studentName} guardados! Listo para matricular a otra persona.`);
                      setTimeout(() => setSuccessToast(null), 6000);
                    }}
                    className="col-span-2 bg-emerald-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-emerald-700 transition mt-1"
                  >
                    Finalizar y Matricular a otra persona
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
