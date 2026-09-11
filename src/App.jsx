import { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { toPng } from 'html-to-image';
import { auth, db, googleProvider, microsoftProvider } from './config/firebase';
import { AssistantWidget } from './components/AssistantWidget';
import { AuthModal } from './components/AuthModal';
import { QrModal } from './components/Modals/QrModal';
import { ScannerModal } from './components/Modals/ScannerModal';
import { MaintenanceModal } from './components/Modals/MaintenanceModal';
import { AsisCateLogo } from './components/Shared/AsisCateLogo';
import { CountryCodeSelect } from './components/Shared/CountryCodeSelect';
const DashboardView = lazy(() => import('./components/Views/DashboardView').then(module => ({ default: module.DashboardView })));
const GroupsView = lazy(() => import('./components/Views/GroupsView').then(module => ({ default: module.GroupsView })));
const ReportsView = lazy(() => import('./components/Views/ReportsView').then(module => ({ default: module.ReportsView })));
const InventoryView = lazy(() => import('./components/Views/InventoryView').then(module => ({ default: module.InventoryView })));
const PaymentsView = lazy(() => import('./components/Views/PaymentsView').then(module => ({ default: module.PaymentsView })));
const UserManagementView = lazy(() => import('./components/Views/UserManagementView').then(module => ({ default: module.UserManagementView })));
import { APPS_SCRIPT_URL, levelOptions } from './utils/constants';
const EnrollmentView = lazy(() => import('./components/Views/EnrollmentView'));
const EnrollmentDashboardView = lazy(() => import('./components/Views/EnrollmentDashboardView'));
import { validatePhoneNumber, COUNTRY_CODES } from './utils/validators';
import { useInstallPrompt } from './hooks/useInstallPrompt';
import { useAuthSession } from './hooks/useAuthSession';
import { useRoleScope } from './hooks/useRoleScope';
import { useVisibleGroups } from './hooks/useVisibleGroups';
import { useVisibleStudents } from './hooks/useVisibleStudents';
import { useVisiblePayments } from './hooks/useVisiblePayments';
import { useVisibleInventory } from './hooks/useVisibleInventory';
import { useDashboardAttendance } from './hooks/useDashboardAttendance';
import { useRealtimeSubscriptions } from './hooks/useRealtimeSubscriptions';
import { useRoleAccess } from './hooks/useRoleAccess';
import { usePrimaryDataCache } from './hooks/usePrimaryDataCache';
import { useInventoryCleanup } from './hooks/useInventoryCleanup';
import { usePersistedState } from './hooks/usePersistedState';
import { mapSnapshotDocs, normalizeStudentRecord, sortPaymentRecords } from './services/firestoreDataMappers';
import { savePaymentRecord } from './services/paymentService';
import { resolveUserProfile } from './services/userProfileService';
import { loadXlsx } from './services/spreadsheetService';
import { hasDuplicateGroup, hasDuplicateReservation, isRecentDuplicatePayment, sameNormalized } from './utils/recordValidation';
import { 
  signInWithPopup, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut, 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  addDoc, 
  getDocs, 
  updateDoc,
  deleteDoc
} from 'firebase/firestore';
import JSZip from 'jszip';

const loadFaviconAsPng = async () => {
  const response = await fetch('/favicon.svg');
  if (!response.ok) throw new Error('No se pudo cargar el favicon.');

  const svgText = await response.text();
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, 128, 128);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = reject;
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  });
};

const DEFAULT_GROUP_SCHEDULE_OPTIONS = {
  days: ['Sábado'],
  times: ['08:00-10:00', '10:30-12:30'],
  rooms: ['Salón principal']
};

const normalizeLoadedScheduleDays = (days) => {
  const standardDays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const values = Array.isArray(days) ? days.filter(Boolean) : [];
  // Migra la configuración predeterminada anterior (los siete días) al sábado.
  return values.length === standardDays.length && standardDays.every(day => values.includes(day)) ? ['Sábado'] : values;
};

const normalizeLoadedScheduleTimes = (times) => {
  const values = Array.isArray(times) ? times.filter(time => time && time !== '14:00-16:00') : [];
  return values.length ? values : DEFAULT_GROUP_SCHEDULE_OPTIONS.times;
};

const getScheduleGroupLabel = (group) => {
  let name = String(group?.name || 'Grupo').trim();
  name = name.replace(/\s*\(\s*\d{4}\s*-\s*\d{4}\s*\)\s*$/, '').trim();
  const level = String(group?.level || '').trim();
  if (level && name.toLowerCase() === level.toLowerCase()) {
    return name;
  }
  if (level && name.toLowerCase().startsWith(level.toLowerCase())) {
    name = name.slice(level.length).replace(/^\s*[-–—:]\s*/, '').trim();
  }
  return name || 'Grupo';
};

const isAllowedNavbarColor = (hex) => {
  if (!hex || typeof hex !== 'string') return false;
  const normalized = hex.replace('#', '');
  const fullHex = normalized.length === 3 ? normalized.split('').map(ch => ch + ch).join('') : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(fullHex)) return false;
  const r = parseInt(fullHex.slice(0, 2), 16);
  const g = parseInt(fullHex.slice(2, 4), 16);
  const b = parseInt(fullHex.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 245;
};

export default function App() {
  const [userData, setUserData] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [activeViewMode, setActiveViewMode] = useState('catequista'); 
  const [themeMode, setThemeMode] = useState('light'); // 'light' | 'dark'
  const [navbarColor, setNavbarColor] = useState('#7f1d1d');
  const [isOnline, setIsOnline] = useState(() => navigator.onLine !== false);
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openNavMenu, setOpenNavMenu] = useState(null);
  const [appToasts, setAppToasts] = useState([]);
  const [appModal, setAppModal] = useState(null);
  const { installPromptEvent, isAppInstalled, installApp } = useInstallPrompt();

  const notify = useCallback((message, type = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setAppToasts(previous => [...previous, { id, message: String(message), type }]);
    window.setTimeout(() => setAppToasts(previous => previous.filter(item => item.id !== id)), 3000);
  }, []);

  const showAppModal = useCallback((message, options = {}) => {
    setAppModal({ message: String(message), title: options.title || 'Aviso', confirm: options.confirm === true, onConfirm: options.onConfirm });
  }, []);

  const handleInstallApp = async () => {
    const prompted = await installApp();
    if (!prompted) {
      showAppModal('El navegador todavía no ha habilitado la instalación automática. Abre esta página en Chrome o Edge, espera unos segundos y usa el icono de instalación de la barra de direcciones o el menú “Instalar AsisCate”.', { title: 'Instalar AsisCate' });
    }
  };

  useEffect(() => {
    const nativeAlert = window.alert;
    window.alert = (message) => notify(message, 'error');
    return () => { window.alert = nativeAlert; };
  }, [notify]);

  // Estados para Modal de Onboarding
  const [modalParroquiaId, setModalParroquiaId] = useState('');
  const [modalDiaconiaId, setModalDiaconiaId] = useState('');
  const [userPhoneCode, setUserPhoneCode] = useState('+506');
  const [userPhoneNumber, setUserPhoneNumber] = useState('');
  const [savingTerritory, setSavingTerritory] = useState(false);
  const [isTerritoryModalSkipped, setIsTerritoryModalSkipped] = useState(false);

  // Datos
  const [isEnrollmentEnabled, setIsEnrollmentEnabled] = useState(true);
  const [parroquias, setParroquias] = useState([]);
  const [diaconias, setDiaconias] = useState([]);
  const [groupScheduleOptions, setGroupScheduleOptions] = useState(DEFAULT_GROUP_SCHEDULE_OPTIONS);
  const [groupScheduleOptionsByDiaconia, setGroupScheduleOptionsByDiaconia] = useState({});
  const [scheduleOptionsDraft, setScheduleOptionsDraft] = useState(DEFAULT_GROUP_SCHEDULE_OPTIONS);
  const [scheduleOptionInputs, setScheduleOptionInputs] = useState({ days: '', times: '', rooms: '' });
  const [editingScheduleOption, setEditingScheduleOption] = useState(null);
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [allowedEmails, setAllowedEmails] = useState([]);
  const [newAllowedEmailInput, setNewAllowedEmailInput] = useState('');

  // Navegación
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isUserNameModalOpen, setIsUserNameModalOpen] = useState(false);
  const [userNameDraft, setUserNameDraft] = useState('');

  // Formularios
  const [newParroquiaName, setNewParroquiaName] = useState('');
  const [newDiaconiaName, setNewDiaconiaName] = useState('');
  const [selectedParroquiaForDiaconia, setSelectedParroquiaForDiaconia] = useState('');

  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupLevel, setNewGroupLevel] = useState('Cate-Kinder');
  const [newGroupYear, setNewGroupYear] = useState('2026-2027');
  const [newGroupParroquia, setNewGroupParroquia] = useState('');
  const [newGroupDiaconia, setNewGroupDiaconia] = useState('');
  const [newGroupDay, setNewGroupDay] = useState('Sábado');
  const [newGroupTime, setNewGroupTime] = useState('');
  const [newGroupRoom, setNewGroupRoom] = useState('');
  const [schedulePreviewHtml, setSchedulePreviewHtml] = useState('');
  const [isSchedulePreviewOpen, setIsSchedulePreviewOpen] = useState(false);
  const [selectedGroupForStudent, setSelectedGroupForStudent] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentParentEmail, setNewStudentParentEmail] = useState('');
  const [newStudentParentPhone, setNewStudentParentPhone] = useState('');
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [editStudentName, setEditStudentName] = useState('');
  const [editStudentParentEmail, setEditStudentParentEmail] = useState('');
  const [editStudentParentPhone, setEditStudentParentPhone] = useState('');

  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceType, setAttendanceType] = useState('encuentro');
  const [attendanceLabel, setAttendanceLabel] = useState('');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [generalDiaconiaId, setGeneralDiaconiaId] = useState('');
  const diaconiaSelectorModeRef = useRef(null);
  // El coordinador general trabaja como un coordinador de la diaconía
  // seleccionada en el navbar. La ubicación real de su usuario no se cambia.
  const { effectiveDiaconiaId, effectiveParroquiaId, canManageScheduleOptions } = useRoleScope({
    activeViewMode,
    userData,
    diaconias,
    generalDiaconiaId
  });
  const [reportStudentIds, setReportStudentIds] = useState(null);
  const [maintenanceGroup, setMaintenanceGroup] = useState(null);
  const [maintenanceMode, setMaintenanceMode] = useState('view');
  const [isAddStudentFormOpen, setIsAddStudentFormOpen] = useState(false);
  const [messageModal, setMessageModal] = useState(null);
  const [isSendingAttendanceEmail, setIsSendingAttendanceEmail] = useState(false);
  const [reportSubTab, setReportSubTab] = useState('asistencia');
  const [reportFilters, setReportFilters] = useState({ dateFrom: '', dateTo: '', search: '' });
  const [reportAttendanceType, setReportAttendanceType] = useState('all');
  const [certificateFilters, setCertificateFilters] = useState({ search: '', scope: 'all' });
  const [selectedCertificateIds, setSelectedCertificateIds] = useState([]);
  const [attendanceDateEditor, setAttendanceDateEditor] = useState(null);
  const [certificateLetterDate, setCertificateLetterDate] = useState(new Date().toISOString().split('T')[0]);
  const [dashboardGroupId, setDashboardGroupId] = useState('');
  const [dashboardDate, setDashboardDate] = useState('');
  const [dashboardAttendanceType, setDashboardAttendanceType] = useState('all');
  const [dashboardPanelOpen, setDashboardPanelOpen] = useState(false);
  const [certificateGenerationType, setCertificateGenerationType] = useState('asistencia');
  const [certificateSearchType, setCertificateSearchType] = useState('all');
  const [certificateSearch, setCertificateSearch] = useState('');
  const [certificatePage, setCertificatePage] = useState(1);
  const [certificatePageSize, setCertificatePageSize] = useState(10);
  const [certificateGenerationOpen, setCertificateGenerationOpen] = useState(true);
  const [certificateSearchOpen, setCertificateSearchOpen] = useState(true);


  const [issuedCertificates, setIssuedCertificates] = useState([]);
  const [generatedCertificates, setGeneratedCertificates] = usePersistedState('asiscate-generated-certificates', []);
  const [levelCertificateHistory, setLevelCertificateHistory] = usePersistedState('asiscate-level-certificates', []);
  const [attendanceLetterHistory, setAttendanceLetterHistory] = usePersistedState('asiscate-attendance-letters', []);
  const [levelCertificateFilters, setLevelCertificateFilters] = useState({ year: 'all', level: 'all', search: '' });
  const [inventoryItems, setInventoryItems] = usePersistedState('asiscate-inventory', () => [
    { id: 'material-1', name: 'Biblia del catequista', category: 'Material', stock: 6, unit: 'pza' },
    { id: 'material-2', name: 'Fichas de trabajo', category: 'Papelería', stock: 20, unit: 'pza' }
  ]);
  const [inventoryAssets, setInventoryAssets] = usePersistedState('asiscate-inventory-assets', () => [
    { id: 'asset-1', name: 'Micrófono portátil', category: 'Equipo audiovisual', stock: 2, unit: 'unidad', showTogether: false },
    { id: 'asset-2', name: 'Proyector', category: 'Equipo', stock: 1, unit: 'unidad', showTogether: false }
  ]);
  const [inventoryReservations, setInventoryReservations] = usePersistedState('asiscate-inventory-reservations', () => [
    { id: 'demo-res-1', itemId: 'demo-1', itemName: 'Biblia del catequista', reservedBy: 'María', date: new Date().toISOString().split('T')[0], slot: '08:00-10:00', quantity: 1, status: 'confirmado' }
  ]);
  const [inventoryReservationForm, setInventoryReservationForm] = useState({
    itemId: '',
    date: new Date().toISOString().split('T')[0],
    slot: '08:00-10:00',
    quantity: '1'
  });
  const [inventoryAssetForm, setInventoryAssetForm] = useState({ name: '', stock: '1', showTogether: false });
  const [editingInventoryItemId, setEditingInventoryItemId] = useState(null);
  const [editingInventoryAssetId, setEditingInventoryAssetId] = useState(null);
  const [editingInventoryReservationId, setEditingInventoryReservationId] = useState(null);
  const [paymentRecords, setPaymentRecords] = useState([]);
  useEffect(() => {
    // Los pagos dejaron de utilizar almacenamiento local; elimina cualquier
    // caché antiguo que pudiera mezclarse con la colección de Firestore.
    localStorage.removeItem('asiscate-payments');
  }, []);
  const [inventoryForm, setInventoryForm] = useState({ name: '', stock: '1' });
  const [inventoryDateFilters, setInventoryDateFilters] = useState({ dateFrom: '', dateTo: '' });
  const [inventoryShowDateSummary, setInventoryShowDateSummary] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    groupId: '',
    studentId: '',
    studentName: '',
    concept: '',
    amount: '',
    paymentMethod: 'Efectivo',
    withoutMatricula: false,
    invoiceName: ''
  });
  const [paymentFilters, setPaymentFilters] = useState({ search: '', groupId: 'all', date: '' });
  const [paymentCurrentPage, setPaymentCurrentPage] = useState(1);
  const [showGroupPaymentTracker, setShowGroupPaymentTracker] = useState(false);
  const [trackerGroupId, setTrackerGroupId] = useState('');
  const [qrModal, setQrModal] = useState(null);
  const [paymentProofModal, setPaymentProofModal] = useState(null);
  const [qrCardLoading, setQrCardLoading] = useState(false);
  const [scannerModal, setScannerModal] = useState(null);
  const [deleteDateTarget, setDeleteDateTarget] = useState(null);
  const videoRef = useRef(null);
  const qrCardRef = useRef(null);
  const attendanceDateInitializedRef = useRef(false);
  const attendanceLabelSaveTimeoutRef = useRef(null);

  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupLevel, setEditGroupLevel] = useState('Cate-Kinder');
  const [editGroupYear, setEditGroupYear] = useState('2026-2027');
  const [editGroupDay, setEditGroupDay] = useState('');
  const [editGroupTime, setEditGroupTime] = useState('');
  const [editGroupRoom, setEditGroupRoom] = useState('');
  const [editGroupCatechists, setEditGroupCatechists] = useState([]);
  const [editGroupVisibleForCatechists, setEditGroupVisibleForCatechists] = useState(true);

  const [excelPreview, setExcelPreview] = useState([]);
  const [excelTargetGroupId, setExcelTargetGroupId] = useState('');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false);
  const [editingEnrollmentStudent, setEditingEnrollmentStudent] = useState(null);
  const [editingEnrollmentReadOnly, setEditingEnrollmentReadOnly] = useState(false);

  // Autenticación extendida (Correo/Contraseña, Microsoft, Google)
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [emailAuthInput, setEmailAuthInput] = useState('');
  const [passwordAuthInput, setPasswordAuthInput] = useState('');
  const [nameAuthInput, setNameAuthInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  useEffect(() => {
    const handleConnectionChange = () => setIsOnline(navigator.onLine !== false);
    window.addEventListener('online', handleConnectionChange);
    window.addEventListener('offline', handleConnectionChange);
    return () => {
      window.removeEventListener('online', handleConnectionChange);
      window.removeEventListener('offline', handleConnectionChange);
    };
  }, []);

  useEffect(() => {
    const handleOutsideNavbarMenuClick = (event) => {
      if (!event.target.closest('[data-navbar-menu]')) {
        setOpenNavMenu(null);
      }
    };

    document.addEventListener('mousedown', handleOutsideNavbarMenuClick);
    return () => document.removeEventListener('mousedown', handleOutsideNavbarMenuClick);
  }, []);

  useEffect(() => {
    document.title = 'AsisCate';
  }, []);

  usePrimaryDataCache({
    parroquias,
    diaconias,
    groups,
    students,
    users: allUsers
  });

  useInventoryCleanup({
    activeTab,
    userRole,
    inventoryItems,
    inventoryReservations,
    setInventoryItems,
    setInventoryReservations
  });

  const fetchAndResolveUser = async (currentUser) => {
    try {
      const { profile, role } = await resolveUserProfile(db, currentUser);
      setUserData(profile);
      setUserPhoneCode(profile.phoneCode || '+506');
      setUserPhoneNumber(profile.phoneNumber || '');
      setModalParroquiaId(profile.parroquiaId || '');
      setModalDiaconiaId(profile.diaconiaId || '');
      setThemeMode(profile.theme || 'light');
      if (isAllowedNavbarColor(profile.navbarColor)) setNavbarColor(profile.navbarColor);
      return role;
    } catch (error) {
      console.error('Error resolviendo usuario:', error);
      return 'catequista';
    }
  };

  const fetchAllData = useCallback(async () => {
    try {
      try {
        const configSnap = await getDoc(doc(db, 'config', 'enrollment'));
        if (configSnap.exists()) {
          setIsEnrollmentEnabled(configSnap.data().enabled !== false);
        }
      } catch (cErr) {
        console.warn('No se pudo cargar estado de matrícula:', cErr);
      }

      try {
        const scheduleSnap = await getDoc(doc(db, 'config', 'groupSchedule'));
        if (scheduleSnap.exists()) {
          const savedOptions = scheduleSnap.data();
          const nextOptions = {
            days: normalizeLoadedScheduleDays(savedOptions.days).length ? normalizeLoadedScheduleDays(savedOptions.days) : DEFAULT_GROUP_SCHEDULE_OPTIONS.days,
            times: normalizeLoadedScheduleTimes(savedOptions.times),
            rooms: Array.isArray(savedOptions.rooms) && savedOptions.rooms.length ? savedOptions.rooms : DEFAULT_GROUP_SCHEDULE_OPTIONS.rooms
          };
          setGroupScheduleOptions(nextOptions);
          setScheduleOptionsDraft(nextOptions);
        }
      } catch (scheduleError) {
        console.warn('No se pudieron cargar las opciones de horarios:', scheduleError);
      }

      try {
        const diaconiaSchedulesSnap = await getDocs(collection(db, 'diaconiaSchedules'));
        const scheduleMap = {};
        diaconiaSchedulesSnap.docs.forEach(scheduleDoc => {
          const saved = scheduleDoc.data() || {};
          scheduleMap[scheduleDoc.id] = {
            days: normalizeLoadedScheduleDays(saved.days).length ? normalizeLoadedScheduleDays(saved.days) : DEFAULT_GROUP_SCHEDULE_OPTIONS.days,
            times: normalizeLoadedScheduleTimes(saved.times),
            rooms: Array.isArray(saved.rooms) && saved.rooms.length ? saved.rooms : DEFAULT_GROUP_SCHEDULE_OPTIONS.rooms
          };
        });
        setGroupScheduleOptionsByDiaconia(scheduleMap);
      } catch (scheduleError) {
        console.warn('No se pudieron cargar los horarios por diaconía:', scheduleError);
      }

      const parroquiasSnap = await getDocs(collection(db, 'parroquias'));
      const nextParroquias = mapSnapshotDocs(parroquiasSnap);
      setParroquias(nextParroquias);

      const diaconiasSnap = await getDocs(collection(db, 'diaconias'));
      const nextDiaconias = mapSnapshotDocs(diaconiasSnap);
      setDiaconias(nextDiaconias);

      const usersSnap = await getDocs(collection(db, 'users'));
      const nextUsers = mapSnapshotDocs(usersSnap);
      setAllUsers(nextUsers);

      if (user) {
        const currentUserFreshData = nextUsers.find(u => u.id === user.uid);
        if (currentUserFreshData) {
          setUserData(currentUserFreshData);
        }
      }

      try {
        const allowedEmailsSnap = await getDocs(collection(db, 'allowedEmails'));
        const nextAllowedEmails = mapSnapshotDocs(allowedEmailsSnap);
        setAllowedEmails(nextAllowedEmails);
      } catch (e) {
        console.warn('No se pudo cargar allowedEmails:', e);
      }

      const groupsSnap = await getDocs(collection(db, 'groups'));
      const nextGroups = mapSnapshotDocs(groupsSnap);
      setGroups(nextGroups);

      const studentsSnap = await getDocs(collection(db, 'students'));
      const nextStudents = studentsSnap.docs.map(normalizeStudentRecord);
      setStudents(nextStudents);

      const paymentsSnap = await getDocs(collection(db, 'payments'));
      const nextPaymentRecords = sortPaymentRecords(mapSnapshotDocs(paymentsSnap));
      setPaymentRecords(nextPaymentRecords);

      const inventoryItemsSnap = await getDocs(collection(db, 'inventoryItems'));
      const inventoryAssetsSnap = await getDocs(collection(db, 'inventoryAssets'));
      const inventoryReservationsSnap = await getDocs(collection(db, 'inventoryReservations'));
      const today = new Date().toISOString().split('T')[0];
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const certificatesSnap = await getDocs(collection(db, 'certificates'));
      const nextCertificates = mapSnapshotDocs(certificatesSnap);
      setIssuedCertificates(nextCertificates);

      const inventoryDocs = mapSnapshotDocs(inventoryItemsSnap);
      const assetDocs = mapSnapshotDocs(inventoryAssetsSnap);
      const reservationDocs = mapSnapshotDocs(inventoryReservationsSnap);
      const expiredMaterials = inventoryDocs.filter(item => item.createdAt && new Date(item.createdAt) < oneYearAgo);
      const expiredReservations = reservationDocs.filter(reservation => reservation.date && reservation.date < today);

      await Promise.all([
        ...expiredMaterials.map(item => deleteDoc(doc(db, 'inventoryItems', item.id))),
        ...expiredReservations.map(reservation => deleteDoc(doc(db, 'inventoryReservations', reservation.id)))
      ]);

      setInventoryItems(inventoryDocs.filter(item => !expiredMaterials.some(expired => expired.id === item.id)));
      setInventoryAssets(assetDocs);
      setInventoryReservations(reservationDocs.filter(reservation => !expiredReservations.some(expired => expired.id === reservation.id)));
      setIsOnline(true);
    } catch (error) {
      console.error("Error cargando Firestore:", error);
      setIsOnline(false);

      try {
        const cachedParroquias = JSON.parse(localStorage.getItem('asiscate-parroquias-cache') || '[]');
        const cachedDiaconias = JSON.parse(localStorage.getItem('asiscate-diaconias-cache') || '[]');
        const cachedUsers = JSON.parse(localStorage.getItem('asiscate-users-cache') || '[]');
        const cachedGroups = JSON.parse(localStorage.getItem('asiscate-groups-cache') || '[]');
        const cachedStudents = JSON.parse(localStorage.getItem('asiscate-students-cache') || '[]');

        setParroquias(cachedParroquias);
        setDiaconias(cachedDiaconias);
        setAllUsers(cachedUsers);
        setGroups(cachedGroups);
        setStudents(cachedStudents);
      } catch (cacheError) {
        console.warn('No se pudieron restaurar los datos en caché:', cacheError);
      }
    }
  }, []);

  const { user, loading, setLoading } = useAuthSession({
    resolveUser: fetchAndResolveUser,
    loadData: fetchAllData,
    onResolved: (resolvedRole) => {
      setUserRole(resolvedRole);
      const initialView = resolvedRole === 'admin'
        ? 'admin'
        : (resolvedRole === 'coordinadorGeneral'
          ? 'coordinadorGeneral'
          : (resolvedRole === 'coordinador' ? 'coordinador' : 'catequista'));
      setActiveViewMode(initialView);
    },
    onSignedOut: () => {
      setUserData(null);
      setUserRole(null);
      setGroups([]);
      setStudents([]);
      setAllUsers([]);
    }
  });

  useRealtimeSubscriptions({ user, setIssuedCertificates, setPaymentRecords, setIsEnrollmentEnabled });

  const isTerritoryPending = Boolean(user && userData && (!userData.parroquiaId || !userData.diaconiaId || !userData.phoneNumber));
  const isUserUnapproved = Boolean(user && userData && userData.approved === false);
  const isUserInactive = Boolean(user && userData && userData.active === false);

  useEffect(() => {
    const selectedOptions = effectiveDiaconiaId
      ? groupScheduleOptionsByDiaconia[effectiveDiaconiaId]
      : null;
    const nextOptions = selectedOptions || DEFAULT_GROUP_SCHEDULE_OPTIONS;
    setGroupScheduleOptions(nextOptions);
    setScheduleOptionsDraft(nextOptions);
    setScheduleOptionInputs({ days: '', times: '', rooms: '' });
  }, [effectiveDiaconiaId, groupScheduleOptionsByDiaconia]);

  useEffect(() => {
    const availableTimes = groupScheduleOptions.times || [];
    setInventoryReservationForm(previous => ({
      ...previous,
      slot: availableTimes.includes(previous.slot) ? previous.slot : (availableTimes[0] || previous.slot)
    }));
  }, [groupScheduleOptions.times]);

  // Mantiene una diaconía válida para el selector del coordinador general.
  // Si se eliminó la selección o cambió la parroquia disponible, se toma la
  // primera diaconía permitida sin modificar la ubicación del usuario.
  useEffect(() => {
    if (activeViewMode !== 'coordinadorGeneral' && activeViewMode !== 'admin') return;
    if (!userData) return;
    const availableDiaconias = diaconias.filter(diaconia => (
      userRole === 'admin' || !userData?.parroquiaId || diaconia.parroquiaId === userData.parroquiaId
    ));
    const modeChanged = diaconiaSelectorModeRef.current !== activeViewMode;
    if (modeChanged || !availableDiaconias.some(diaconia => diaconia.id === generalDiaconiaId)) {
      const preferredDiaconiaId = userData.diaconiaId && availableDiaconias.some(diaconia => diaconia.id === userData.diaconiaId)
        ? userData.diaconiaId
        : availableDiaconias[0]?.id || '';
      setGeneralDiaconiaId(preferredDiaconiaId);
    }
    diaconiaSelectorModeRef.current = activeViewMode;
  }, [activeViewMode, diaconias, generalDiaconiaId, userData?.diaconiaId, userData?.parroquiaId, userRole]);

  const handleSaveInitialTerritory = async (e) => {
    e.preventDefault();
    if (!modalParroquiaId || !modalDiaconiaId) {
      showAppModal('Debes seleccionar tanto la parroquia como la diaconía.', { title: 'Datos incompletos' });
      return;
    }

    const phoneResult = validatePhoneNumber(userPhoneCode, userPhoneNumber);
    if (!phoneResult.valid) {
      showAppModal(phoneResult.message, { title: 'Teléfono inválido' });
      return;
    }

    try {
      setSavingTerritory(true);
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        parroquiaId: modalParroquiaId,
        diaconiaId: modalDiaconiaId,
        phoneCode: userPhoneCode,
        phoneNumber: phoneResult.rawDigits,
        phone: phoneResult.formatted
      });

      setUserData(prev => ({
        ...prev,
        parroquiaId: modalParroquiaId,
        diaconiaId: modalDiaconiaId,
        phoneCode: userPhoneCode,
        phoneNumber: phoneResult.rawDigits,
        phone: phoneResult.formatted
      }));
      await fetchAllData();
      showAppModal('La configuración se guardó correctamente.', { title: 'Preferencias actualizadas' });
    } catch (error) {
      console.error("Error guardando selección inicial:", error);
      alert("Error al guardar la selección. Intenta nuevamente.");
    } finally {
      setSavingTerritory(false);
    }
  };

  const handleSaveUserName = async () => {
    if (!user) return;

    const phoneResult = validatePhoneNumber(userPhoneCode, userPhoneNumber);
    if (!phoneResult.valid) {
      alert(phoneResult.message);
      return;
    }

    try {
      const updates = {
        phoneCode: userPhoneCode,
        phoneNumber: phoneResult.rawDigits,
        phone: phoneResult.formatted
      };
      if (userNameDraft.trim()) {
        updates.name = userNameDraft.trim();
        await updateProfile(user, { displayName: userNameDraft.trim() }).catch(() => {});
      }
      if (modalParroquiaId) {
        updates.parroquiaId = modalParroquiaId;
      }
      if (modalDiaconiaId) {
        updates.diaconiaId = modalDiaconiaId;
      }

      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, updates);
      setUserData(prev => ({ ...prev, ...updates }));
      await fetchAllData();
      setIsUserNameModalOpen(false);
      setIsTerritoryModalSkipped(false);
    } catch (err) {
      console.error("Error guardando preferencias de usuario:", err);
      alert("No se pudieron guardar las preferencias.");
    }
  };

  const handleResetUserName = () => {
    if (!user) return;
    const defaultName = user.displayName || user.email?.split('@')[0] || 'Usuario';
    setUserNameDraft(defaultName);
  };

  const handleResetNavbarColor = async () => {
    setNavbarColor('#7f1d1d');
    if (user) {
      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, { navbarColor: '#7f1d1d' });
      } catch (err) {
        console.error("Error reseteando color del navbar:", err);
      }
    }
  };

  const darkenHex = (hex, amount = 0.16) => {
    const safeHex = hex.replace('#', '');
    const normalized = safeHex.length === 3 ? safeHex.split('').map(ch => ch + ch).join('') : safeHex;
    const num = parseInt(normalized, 16);
    const r = Math.max(0, Math.min(255, Math.round(((num >> 16) & 255) * (1 - amount))));
    const g = Math.max(0, Math.min(255, Math.round(((num >> 8) & 255) * (1 - amount))));
    const b = Math.max(0, Math.min(255, Math.round((num & 255) * (1 - amount))));
    return `#${[r, g, b].map(value => value.toString(16).padStart(2, '0')).join('')}`;
  };

  const handleNavbarColorChange = (nextColor) => {
    if (!nextColor) return;
    if (!isAllowedNavbarColor(nextColor)) {
      setNavbarColor('#7f1d1d');
      return;
    }
    setNavbarColor(nextColor);
  };

  const handleToggleViewMode = async (mode) => {
    setActiveViewMode(mode);
    if ((mode === 'coordinadorGeneral' || mode === 'admin') && userData?.diaconiaId) {
      setGeneralDiaconiaId(userData.diaconiaId);
    }
    if (mode === 'catequista' && (activeTab === 'parroquias' || activeTab === 'horarios' || activeTab === 'admin')) {
      setActiveTab('dashboard');
    }
    await fetchAllData();
  };

  const handleToggleTheme = async () => {
    const nextTheme = themeMode === 'light' ? 'dark' : 'light';
    setThemeMode(nextTheme);

    if (user) {
      try {
        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, { theme: nextTheme });
      } catch (err) {
        console.error("Error guardando preferencia de tema:", err);
      }
    }
  };

  const getReadableAuthError = (error, type = 'email') => {
    const errorCode = error?.code || '';
    switch (errorCode) {
      case 'auth/invalid-credential':
        if (type === 'email') return 'Correo o contraseña incorrectos.';
        return 'No se pudo autenticar con la cuenta seleccionada. Si es con Microsoft, asegúrate de habilitar el proveedor en la consola de Firebase.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
        return 'Correo o contraseña incorrectos.';
      case 'auth/operation-not-allowed':
        return 'Este proveedor de inicio de sesión no está activado en la consola de Firebase.';
      case 'auth/email-already-in-use':
        return 'Este correo electrónico ya está registrado. Intenta iniciar sesión.';
      case 'auth/invalid-email':
        return 'El correo electrónico ingresado no es válido.';
      case 'auth/weak-password':
        return 'La contraseña es muy débil. Debe tener al menos 6 caracteres.';
      case 'auth/popup-closed-by-user':
        return 'Se cerró la ventana de inicio de sesión antes de completar.';
      case 'auth/cancelled-popup-request':
        return 'Se canceló la solicitud de inicio de sesión.';
      case 'auth/account-exists-with-different-credential':
        return 'Ya existe una cuenta con este correo usando otro método de inicio de sesión.';
      default:
        return error?.message || 'Ocurrió un error al autenticar. Por favor intenta nuevamente.';
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setAuthError('');
      setAuthSubmitting(true);
      setLoading(true);
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Error al iniciar sesión con Google:", error);
      setAuthError(getReadableAuthError(error, 'google'));
      setLoading(false);
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleMicrosoftLogin = async () => {
    try {
      setAuthError('');
      setAuthSubmitting(true);
      setLoading(true);
      await signInWithPopup(auth, microsoftProvider);
    } catch (error) {
      console.error("Error al iniciar sesión con Microsoft:", error);
      setAuthError(getReadableAuthError(error, 'microsoft'));
      setLoading(false);
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleEmailAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (!emailAuthInput.trim() || !passwordAuthInput.trim()) {
      setAuthError('Por favor ingresa tu correo y contraseña.');
      return;
    }
    if (authMode === 'register' && !nameAuthInput.trim()) {
      setAuthError('Por favor ingresa tu nombre completo.');
      return;
    }
    if (passwordAuthInput.length < 6) {
      setAuthError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    try {
      setAuthSubmitting(true);
      setLoading(true);
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, emailAuthInput.trim(), passwordAuthInput);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, emailAuthInput.trim(), passwordAuthInput);
        if (nameAuthInput.trim() && userCredential.user) {
          await updateProfile(userCredential.user, { displayName: nameAuthInput.trim() });
        }
      }
    } catch (error) {
      console.error("Error en autenticación por correo:", error);
      setAuthError(getReadableAuthError(error, 'email'));
      setLoading(false);
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  const handleCreateParroquia = async (e) => {
    e.preventDefault();
    if (!newParroquiaName.trim()) return;

    try {
      await addDoc(collection(db, 'parroquias'), {
        name: newParroquiaName.trim(),
        createdAt: new Date().toISOString()
      });
      setNewParroquiaName('');
      await fetchAllData();
    } catch (error) {
      console.error("Error creando parroquia:", error);
    }
  };

  const handleCreateDiaconia = async (e) => {
    e.preventDefault();
    if (!newDiaconiaName.trim() || !selectedParroquiaForDiaconia) return;

    try {
      await addDoc(collection(db, 'diaconias'), {
        name: newDiaconiaName.trim(),
        parroquiaId: selectedParroquiaForDiaconia,
        createdAt: new Date().toISOString()
      });
      setNewDiaconiaName('');
      fetchAllData();
    } catch (error) {
      console.error("Error creando diaconía:", error);
    }
  };

  const persistScheduleOptions = async (nextOptions) => {
    const targetDiaconiaId = effectiveDiaconiaId || userData?.diaconiaId || '';
    if (!targetDiaconiaId) {
      alert('Selecciona una diaconía antes de modificar sus horarios y salones.');
      return false;
    }
    if (!nextOptions.days.length || !nextOptions.times.length || !nextOptions.rooms.length) {
      alert('Debes conservar al menos una opción de día, horario y salón.');
      return false;
    }
    try {
      await setDoc(doc(db, 'diaconiaSchedules', targetDiaconiaId), { ...nextOptions, diaconiaId: targetDiaconiaId, updatedAt: new Date().toISOString(), updatedBy: user?.uid || '' }, { merge: true });
      setGroupScheduleOptionsByDiaconia(previous => ({ ...previous, [targetDiaconiaId]: nextOptions }));
      setGroupScheduleOptions(nextOptions);
      setScheduleOptionsDraft(nextOptions);
      notify('Opción guardada automáticamente.', 'success');
      return true;
    } catch (error) {
      console.error('Error guardando opciones de horarios:', error);
      alert('No se pudo guardar la opción automáticamente.');
      return false;
    }
  };

  const addScheduleOption = async (field) => {
    const value = String(scheduleOptionInputs[field] || '').trim();
    if (!value) return;
    const nextOptions = { ...scheduleOptionsDraft, [field]: [...new Set([...(scheduleOptionsDraft[field] || []), value])] };
    await persistScheduleOptions(nextOptions);
    setScheduleOptionInputs(previous => ({ ...previous, [field]: '' }));
  };

  const removeScheduleOption = async (field, value) => {
    const nextOptions = { ...scheduleOptionsDraft, [field]: (scheduleOptionsDraft[field] || []).filter(item => item !== value) };
    await persistScheduleOptions(nextOptions);
  };

  const startScheduleOptionEdit = (field, index, value) => {
    setEditingScheduleOption({ field, index, value });
    setScheduleOptionInputs(previous => ({ ...previous, [field]: value }));
  };

  const saveScheduleOptionEdit = async (field) => {
    if (!editingScheduleOption || editingScheduleOption.field !== field) return;
    const value = String(scheduleOptionInputs[field] || '').trim();
    if (!value) return;
    const nextValues = [...(scheduleOptionsDraft[field] || [])];
    if (nextValues.some((item, index) => item === value && index !== editingScheduleOption.index)) {
      alert('Esa opción ya existe en esta sección.');
      return;
    }
    nextValues[editingScheduleOption.index] = value;
    const nextOptions = { ...scheduleOptionsDraft, [field]: nextValues };
    if (await persistScheduleOptions(nextOptions)) {
      setEditingScheduleOption(null);
      setScheduleOptionInputs(previous => ({ ...previous, [field]: '' }));
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    // Restricción: Los usuarios de tipo catequista pueden crear máximo 2 grupos
    const currentUserKey = user?.uid || userData?.id || userData?.fullName || '';
    if (userRole === 'catequista') {
      const groupsCreatedByMe = groups.filter(g => 
        g.createdBy === currentUserKey || 
        g.createdBy === user?.uid || 
        g.createdBy === userData?.id ||
        (Array.isArray(g.catechistIds) && g.catechistIds.includes(user?.uid))
      );
      if (groupsCreatedByMe.length >= 2) {
        alert("Como catequista has alcanzado el límite máximo de 2 grupos creados.");
        return;
      }
    }

    const groupParroquia = effectiveParroquiaId || newGroupParroquia || (parroquias[0]?.id || '');
    const groupDiaconia = (activeViewMode === 'coordinadorGeneral'
      ? effectiveDiaconiaId
      : userData?.diaconiaId || newGroupDiaconia || (diaconias[0]?.id || ''));

    if (hasDuplicateGroup(groups, { name: newGroupName, year: newGroupYear || '2026-2027', diaconiaId: groupDiaconia })) {
      alert('Ya existe un grupo con ese nombre en el mismo ciclo y diaconía.');
      return;
    }

    try {
      const groupData = {
        name: newGroupName,
        level: newGroupLevel,
        year: newGroupYear || '2026-2027',
        parroquiaId: groupParroquia,
        diaconiaId: groupDiaconia,
        scheduleDay: newGroupDay,
        scheduleTime: newGroupTime,
        room: newGroupRoom,
        catechistIds: [user.uid],
        catechistNames: [user.displayName],
        isVisibleForCatechists: true,
        createdBy: currentUserKey,
        createdAt: new Date().toISOString()
      };
      await addDoc(collection(db, 'groups'), groupData);
      setNewGroupName('');
      setNewGroupLevel('Cate-Kinder');
      setNewGroupYear('2026-2027');
      setNewGroupDay('Sábado');
      setNewGroupTime('');
      setNewGroupRoom('');
      setIsCreateGroupModalOpen(false);
      fetchAllData();
    } catch (error) {
      console.error("Error creando grupo:", error);
    }
  };

  const handleDuplicateGroup = async (group) => {
    if (!group) return;

    try {
      const duplicateGroupRef = await addDoc(collection(db, 'groups'), {
        name: `${group.name || 'Grupo'} (Copia)`,
        level: group.level || 'Cate-Kinder',
        year: group.year || '2026-2027',
        parroquiaId: group.parroquiaId,
        diaconiaId: group.diaconiaId,
        scheduleDay: group.scheduleDay || '',
        scheduleTime: group.scheduleTime || '',
        room: group.room || '',
        catechistIds: group.catechistIds || [],
        catechistNames: group.catechistNames || [],
        isVisibleForCatechists: group.isVisibleForCatechists !== false,
        createdAt: new Date().toISOString()
      });

      const studentsToDuplicate = students.filter(student => student.groupId === group.id);
      for (const student of studentsToDuplicate) {
        await addDoc(collection(db, 'students'), {
          ...student,
          name: student.name,
          parentEmail: student.parentEmail || '',
          parentPhone: student.parentPhone || '',
          groupId: duplicateGroupRef.id,
          level: group.level || student.level || 'Primer Nivel',
          cycle: student.cycle || group.year || '2026-2027',
          parroquiaId: student.parroquiaId || group.parroquiaId || '',
          diaconiaId: student.diaconiaId || group.diaconiaId || '',
          catechistId: student.catechistId || user?.uid || '',
          attendance: [],
          createdAt: new Date().toISOString()
        });
      }

      setEditingGroupId(null);
      await fetchAllData();
      setSelectedGroupForStudent(duplicateGroupRef.id);
      setActiveTab('groups');
    } catch (error) {
      console.error('Error duplicando grupo:', error);
      alert('No se pudo duplicar el grupo. Inténtalo de nuevo.');
    }
  };

  const handleStartEditGroup = (group) => {
    setEditingGroupId(group.id);
    setEditGroupName(group.name);
    setEditGroupLevel(group.level || 'Cate-Kinder');
    setEditGroupYear(group.year || '2026-2027');
    setEditGroupDay(group.scheduleDay || 'Sábado');
    setEditGroupTime(group.scheduleTime || '');
    setEditGroupRoom(group.room || '');
    const existingIds = group.catechistIds || (group.catechistId ? [group.catechistId] : []);
    setEditGroupCatechists(existingIds);
    setEditGroupVisibleForCatechists(group.isVisibleForCatechists !== false);
  };

  const handleSaveGroupEdit = async () => {
    if (!editingGroupId || !editGroupName.trim()) return;

    try {
      const previousGroup = groups.find(group => group.id === editingGroupId);
      const selectedUsers = allUsers.filter(u => editGroupCatechists.includes(u.id));
      const names = selectedUsers.map(u => u.name || u.email);

      const groupRef = doc(db, 'groups', editingGroupId);
      await updateDoc(groupRef, {
        name: editGroupName,
        level: editGroupLevel,
        year: editGroupYear || '2026-2027',
        scheduleDay: editGroupDay,
        scheduleTime: editGroupTime,
        room: editGroupRoom,
        catechistIds: editGroupCatechists,
        catechistNames: names,
        isVisibleForCatechists: editGroupVisibleForCatechists
      });

      if (previousGroup && previousGroup.level !== editGroupLevel) {
        const groupStudents = students.filter(student => student.groupId === editingGroupId);
        await Promise.all(groupStudents.map(student => updateDoc(doc(db, 'students', student.id), { level: editGroupLevel })));
        setStudents(prev => prev.map(student => student.groupId === editingGroupId ? { ...student, level: editGroupLevel } : student));
      }

      setEditingGroupId(null);
      fetchAllData();
    } catch (error) {
      console.error("Error actualizando grupo:", error);
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm("¿Seguro que deseas eliminar este grupo?")) return;
    try {
      await deleteDoc(doc(db, 'groups', groupId));
      fetchAllData();
    } catch (error) {
      console.error("Error eliminando grupo:", error);
    }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!newStudentName.trim() || !selectedGroupForStudent) return;
    if (newStudentParentEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newStudentParentEmail.trim())) {
      alert("Ingresa un correo válido.");
      return;
    }
    if (newStudentParentPhone.trim() && !/^\d{8}$/.test(newStudentParentPhone.trim())) {
      alert("El número telefónico debe tener exactamente 8 dígitos.");
      return;
    }

    const groupObj = groups.find(g => g.id === selectedGroupForStudent);

    if (students.some(student => student.groupId === selectedGroupForStudent && sameNormalized(student.name, newStudentName))) {
      alert('Ya existe un catequizando con ese nombre en este grupo.');
      return;
    }

    try {
      const studentData = {
        name: newStudentName.trim(),
        parentEmail: newStudentParentEmail.trim(),
        parentPhone: newStudentParentPhone.trim(),
        groupId: selectedGroupForStudent,
        parroquiaId: groupObj?.parroquiaId || userData?.parroquiaId || '',
        diaconiaId: groupObj?.diaconiaId || effectiveDiaconiaId,
        catechistId: user.uid,
        attendance: [],
        createdAt: new Date().toISOString()
      };
      await addDoc(collection(db, 'students'), studentData);
      setNewStudentName('');
      setNewStudentParentEmail('');
      setNewStudentParentPhone('');
      fetchAllData();
    } catch (error) {
      console.error("Error agregando Catequizando:", error);
    }
  };

  const handleStartEditStudent = (student) => {
    setEditingEnrollmentStudent(student);
    setEditingEnrollmentReadOnly(false);
    setEditingStudentId(student.id);
    setEditStudentName(student.fullName || student.name || '');
    setEditStudentParentEmail(student.parentEmail || student.family?.guardian?.email || '');
    setEditStudentParentPhone(student.parentPhone || student.family?.guardian?.phone1 || '');
  };

  const handleOpenStudentReadOnly = (student) => {
    setEditingEnrollmentStudent(student);
    setEditingEnrollmentReadOnly(true);
    setEditingStudentId(null);
  };

  const handleSaveStudentEdit = async (student) => {
    if (!editStudentName.trim()) return;
    if (editStudentParentEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editStudentParentEmail.trim())) {
      alert("Ingresa un correo válido.");
      return;
    }
    if (editStudentParentPhone.trim() && !/^\d{8}$/.test(editStudentParentPhone.trim())) {
      alert("El número telefónico debe tener exactamente 8 dígitos.");
      return;
    }
    try {
      await updateDoc(doc(db, 'students', student.id), {
        name: editStudentName.trim(),
        parentEmail: editStudentParentEmail.trim(),
        parentPhone: editStudentParentPhone.trim()
      });
      setEditingStudentId(null);
      await fetchAllData();
    } catch (error) {
      console.error("Error actualizando Catequizando:", error);
    }
  };

  const handleDeleteStudent = async (studentTarget) => {
    const studentObj = typeof studentTarget === 'object' ? studentTarget : students.find(s => s.id === studentTarget);
    const studentId = typeof studentTarget === 'object' ? studentTarget.id : studentTarget;
    if (!studentId) return;

    const studentName = studentObj?.fullName || studentObj?.name || 'este catequizando';
    const confirmMessage = `¿Estás seguro de que deseas eliminar a ${studentName}?\n\nEsta acción borrará permanentemente su expediente y todos los archivos digitales adjuntos (cédulas y constancias) en Google Drive.`;
    if (!window.confirm(confirmMessage)) return;

    try {
      // 1. Eliminar archivos vinculados en Google Drive si existen
      if (studentObj) {
        const fileUrlsToDelete = [];
        if (studentObj.documents) {
          Object.values(studentObj.documents).forEach(docItem => {
            if (docItem?.url) fileUrlsToDelete.push(docItem.url);
            if (docItem?.fileUrl) fileUrlsToDelete.push(docItem.fileUrl);
          });
        }
        if (studentObj.family?.guardian?.signatureUrl) {
          fileUrlsToDelete.push(studentObj.family.guardian.signatureUrl);
        }

        if (fileUrlsToDelete.length > 0) {
          const { deleteDriveFile } = await import('./utils/documentProcessor');
          await Promise.all(fileUrlsToDelete.map(url => deleteDriveFile(url)));
        }
      }

      // 2. Eliminar registro de Firestore
      await deleteDoc(doc(db, 'students', studentId));
      fetchAllData();
    } catch (error) {
      console.error("Error eliminando Catequizando:", error);
      alert("Ocurrió un error al eliminar el catequizando.");
    }
  };

  const handleOpenMaintenanceModal = (group) => {
    setMaintenanceGroup(group);
    setSelectedGroupForStudent(group.id);
    setReportStudentIds(students.filter(student => student.groupId === group.id).map(student => student.id));
    setMaintenanceMode('view');
    setEditingStudentId(null);
    setIsAddStudentFormOpen(false);
  };

  const handleCloseMaintenanceModal = () => {
    setMaintenanceGroup(null);
    setEditingStudentId(null);
    setIsAddStudentFormOpen(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const XLSX = await loadXlsx();
      const reader = new FileReader();

      reader.onload = (evt) => {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

        const parsedStudents = data
          .filter((row, idx) => idx > 0 && row[0])
          .map(row => ({
            name: String(row[0]).trim(),
            parentEmail: row[1] ? String(row[1]).trim() : '',
            parentPhone: row[2] ? String(row[2]).replace(/\D/g, '').slice(0, 8) : ''
          }));

        setExcelPreview(parsedStudents);
      };

      reader.readAsBinaryString(file);
    } catch (error) {
      console.error("Error procesando Excel:", error);
      alert("Error al leer el archivo Excel.");
    }
  };

  const handleDownloadStudentTemplate = async () => {
    const XLSX = await loadXlsx();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Nombre Catequizando', 'Correo del Encargado', 'Número Telefónico del Encargado'],
      ['Ejemplo: Ana Pérez', 'encargado@correo.com', '88888888']
    ]);
    worksheet['!cols'] = [{ wch: 32 }, { wch: 34 }, { wch: 28 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla');
    XLSX.writeFile(workbook, 'Plantilla_Catequizandos.xlsx');
  };

  const handleConfirmExcelImport = async () => {
    if (!excelTargetGroupId || excelPreview.length === 0) return;
    const groupObj = groups.find(g => g.id === excelTargetGroupId);

    try {
      for (const st of excelPreview) {
        await addDoc(collection(db, 'students'), {
          name: st.name,
          parentEmail: st.parentEmail || '',
          parentPhone: st.parentPhone || '',
          groupId: excelTargetGroupId,
          parroquiaId: groupObj?.parroquiaId || userData?.parroquiaId || '',
          diaconiaId: groupObj?.diaconiaId || effectiveDiaconiaId,
          catechistId: user.uid,
          attendance: [],
          createdAt: new Date().toISOString()
        });
      }
      setExcelPreview([]);
      setIsImportModalOpen(false);
      fetchAllData();
      alert(`¡Se importaron ${excelPreview.length} Catequizandos con éxito!`);
    } catch (error) {
      console.error("Error importando Catequizandos:", error);
    }
  };

  const handleMarkAttendance = useCallback(async (studentId, status, targetDate = attendanceDate, label = attendanceLabel, targetType = attendanceType) => {
    try {
      const studentDocRef = doc(db, 'students', studentId);
      const student = students.find(s => s.id === studentId);
      if (!student) return;

      let updatedAttendance = [...(student.attendance || [])];
      const existingIndex = updatedAttendance.findIndex(a => a.date === targetDate && (a.type || 'encuentro') === targetType);
      const newRecord = {
        date: targetDate,
        status: status,
        present: status === 'present',
        label: label ? label.trim() : (existingIndex >= 0 ? updatedAttendance[existingIndex].label || '' : ''),
        type: targetType
      };

      if (existingIndex >= 0) {
        updatedAttendance[existingIndex] = newRecord;
      } else {
        updatedAttendance.push(newRecord);
      }

      await updateDoc(studentDocRef, { attendance: updatedAttendance });
      fetchAllData();
    } catch (error) {
      console.error("Error registrando asistencia:", error);
    }
  }, [attendanceDate, attendanceLabel, attendanceType, fetchAllData, students]);

  const handleSaveAttendanceLabelForDate = async (groupId, dateStr, nextLabel = attendanceLabel, targetType = attendanceType) => {
    if (!groupId || !dateStr) return;
    const cleanedLabel = (nextLabel || '').trim();
    const groupStudents = students.filter(student => student.groupId === groupId);

    try {
      await Promise.all(groupStudents.map(async (student) => {
        const existingAttendance = student.attendance || [];
        const recordIndex = existingAttendance.findIndex(record => record.date === dateStr && (record.type || 'encuentro') === targetType);
        const updatedAttendance = [...existingAttendance];

        if (recordIndex >= 0) {
          updatedAttendance[recordIndex] = {
            ...updatedAttendance[recordIndex],
            label: cleanedLabel,
            type: targetType
          };
        } else {
          // Escribir el nombre no debe crear registros ni marcar presentes.
          return;
        }

        await updateDoc(doc(db, 'students', student.id), { attendance: updatedAttendance });
      }));

      fetchAllData();
    } catch (error) {
      console.error("Error guardando nombre del encuentro:", error);
    }
  };

  const handleDeleteAttendanceDateForGroup = async (groupId, dateStr, targetType = attendanceType) => {
    if (!groupId || !dateStr) return;

    try {
      const groupStudents = students.filter(student => student.groupId === groupId);

      await Promise.all(groupStudents.map(async (student) => {
        const updatedAttendance = (student.attendance || []).filter(record => !(record.date === dateStr && (record.type || 'encuentro') === targetType));
        await updateDoc(doc(db, 'students', student.id), { attendance: updatedAttendance });
      }));

      fetchAllData();
    } catch (error) {
      console.error("Error eliminando asistencia del día:", error);
    }
  };

  const confirmDeleteAttendanceDate = async () => {
    if (!deleteDateTarget) return;

    try {
      await handleDeleteAttendanceDateForGroup(deleteDateTarget.groupId, deleteDateTarget.dateStr, deleteDateTarget.type || attendanceType);
    } finally {
      setDeleteDateTarget(null);
    }
  };

  const handleUpdateAttendanceDate = async (groupId, oldDate, targetType, nextDate) => {
    if (!groupId || !oldDate || !nextDate) return;
    if (!window.confirm(`¿Deseas mover todos los registros de ${targetType === 'misa' ? 'Misa' : 'Encuentro'} del día ${oldDate} a ${nextDate}?`)) return;

    try {
      const groupStudents = students.filter(student => student.groupId === groupId);
      await Promise.all(groupStudents.map(async (student) => {
        const updatedAttendance = (student.attendance || []).map(record => {
          if (record.date === oldDate && (record.type || 'encuentro') === targetType) {
            return { ...record, date: nextDate };
          }
          return record;
        });
        await updateDoc(doc(db, 'students', student.id), { attendance: updatedAttendance });
      }));
      fetchAllData();
      setAttendanceDateEditor(null);
    } catch (error) {
      console.error('Error corrigiendo fecha de asistencia:', error);
      alert('No se pudo corregir la fecha de asistencia.');
    }
  };

  const handleDeleteOrphanedAttendance = async () => {
    const existingGroupIds = new Set(groups.map(group => group.id));
    const studentsWithOrphanedAttendance = students.filter(student => (
      (!student.groupId || !existingGroupIds.has(student.groupId)) &&
      Array.isArray(student.attendance) &&
      student.attendance.length > 0
    ));
    const orphanedRecordCount = studentsWithOrphanedAttendance.reduce(
      (total, student) => total + student.attendance.length,
      0
    );

    if (!orphanedRecordCount) {
      alert('No hay registros de asistencia relacionados con grupos inexistentes.');
      return;
    }

    if (!window.confirm(`¿Deseas eliminar ${orphanedRecordCount} registro(s) de asistencia de catequizandos cuyo grupo ya no existe? Los catequizandos se conservarán.`)) return;

    try {
      await Promise.all(studentsWithOrphanedAttendance.map(student => (
        updateDoc(doc(db, 'students', student.id), { attendance: [] })
      )));
      await fetchAllData();
      alert(`Se eliminaron ${orphanedRecordCount} registro(s) de asistencia de grupos inexistentes.`);
    } catch (error) {
      console.error('Error eliminando asistencias de grupos inexistentes:', error);
      alert('No se pudieron eliminar los registros de asistencia.');
    }
  };

  const handleGenerateStudentQr = (student) => {
    const studentName = student.name || student.fullName || 'Catequizando';
    const payload = JSON.stringify({
      type: 'student',
      studentId: student.id,
      name: studentName,
      groupId: student.groupId || ''
    });

    const group = groups.find(item => item.id === student.groupId);
    const parroquia = parroquias.find(item => item.id === (group?.parroquiaId || student.parroquiaId))?.name
      || student.parish
      || 'Parroquia';

    setQrCardLoading(true);
    setQrModal({
      title: studentName,
      name: studentName,
      level: group?.level || student.level || 'Sin nivel asignado',
      parroquia,
      imageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(payload)}`,
      payload
    });
  };

  useEffect(() => {
    if (!qrModal) {
      setQrCardLoading(false);
      return;
    }

    setQrCardLoading(true);
    const fallbackTimer = setTimeout(() => setQrCardLoading(false), 2000);
    return () => clearTimeout(fallbackTimer);
  }, [qrModal?.imageUrl, qrModal?.name]);

  const handleCopyQrCardImage = async () => {
    if (!qrCardRef.current) return;

    try {
      const dataUrl = await toPng(qrCardRef.current, {
        cacheBust: true,
        pixelRatio: 3,
        skipFonts: false
      });

      const response = await fetch(dataUrl);
      const blob = await response.blob();

      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type || 'image/png']: blob })
        ]);
        alert('Imagen del carnet copiada al portapapeles.');
        return;
      }

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `carnet_${(qrModal?.name || 'catequizando').replace(/\s+/g, '_')}.png`;
      link.click();
      alert('Tu navegador no permite copiar imágenes directamente; se descargó la imagen.');
    } catch (error) {
      console.error('Error generando la imagen del carnet:', error);
      alert('No se pudo copiar la imagen del carnet.');
    }
  };

  const handleScanQr = async () => {
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
      alert('Tu navegador no soporta escaneo QR con cámara. Prueba en Chrome o Edge actualizado.');
      return;
    }

    setScannerModal({ open: true, type: 'attendance', status: 'iniciando' });
  };

  const handleScanPaymentQr = async () => {
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
      alert('Tu navegador no soporta escaneo QR con cámara. Prueba en Chrome o Edge actualizado.');
      return;
    }

    setScannerModal({ open: true, type: 'payment', status: 'iniciando' });
  };

  const handleScanCertificateQr = async () => {
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
      alert('Tu navegador no soporta escaneo QR con cámara. Prueba en Chrome o Edge actualizado.');
      return;
    }

    setScannerModal({ open: true, type: 'certificate', status: 'iniciando' });
  };

  useEffect(() => {
    if (!scannerModal?.open) return;

    let stream;
    let checkId;

    const runScanner = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });

        const scanLoop = async () => {
          if (!videoRef.current || !videoRef.current.videoWidth) {
            checkId = setTimeout(scanLoop, 300);
            return;
          }

          try {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes.length > 0) {
              const value = codes[0].rawValue;
              let parsed = null;
              try {
                parsed = JSON.parse(value);
              } catch {
                parsed = null;
              }

              if (scannerModal?.type === 'payment') {
                const searchTerm = (parsed && (parsed.paymentId || parsed.invoiceName || parsed.studentName)) || value || '';
                setPaymentFilters(prev => ({ ...prev, search: searchTerm }));
                setPaymentCurrentPage(1);

                const found = paymentRecords.some(p =>
                  (parsed?.paymentId && p.id === parsed.paymentId) ||
                  (searchTerm && (
                    (p.studentName && p.studentName.toLowerCase().includes(searchTerm.toLowerCase())) ||
                    (p.invoiceName && p.invoiceName.toLowerCase().includes(searchTerm.toLowerCase())) ||
                    (p.id && p.id.toLowerCase().includes(searchTerm.toLowerCase())) ||
                    (p.concept && p.concept.toLowerCase().includes(searchTerm.toLowerCase()))
                  ))
                );

                if (found) {
                  setScannerModal({ open: true, type: 'payment', status: 'ok', result: parsed?.invoiceName || parsed?.studentName || searchTerm || 'Comprobante' });
                } else {
                  setScannerModal({ open: true, type: 'payment', status: 'not_found', result: searchTerm || 'Comprobante' });
                }
                setTimeout(() => setScannerModal(null), 2000);
                return;
              }

              if (scannerModal?.type === 'certificate') {
                const targetType = parsed?.type === 'level-certificate' ? 'nivel' : parsed?.type === 'carta' ? 'carta' : 'all';
                const searchTerm = (parsed && (parsed.studentName || parsed.studentId || parsed.groupName || parsed.level)) || value || '';
                setCertificateSearchType(targetType);
                setCertificateSearch(searchTerm);
                setCertificatePage(1);

                const allCerts = [...generatedCertificates, ...levelCertificateHistory, ...attendanceLetterHistory, ...issuedCertificates];
                const found = allCerts.some(c =>
                  (parsed?.studentId && c.studentId === parsed.studentId) ||
                  (searchTerm && (
                    (c.studentName && c.studentName.toLowerCase().includes(searchTerm.toLowerCase())) ||
                    (c.groupName && c.groupName.toLowerCase().includes(searchTerm.toLowerCase())) ||
                    (c.level && c.level.toLowerCase().includes(searchTerm.toLowerCase())) ||
                    (c.id && c.id.toLowerCase().includes(searchTerm.toLowerCase()))
                  ))
                ) || students.some(s =>
                  (parsed?.studentId && s.id === parsed.studentId) ||
                  (searchTerm && s.name.toLowerCase().includes(searchTerm.toLowerCase()))
                );

                if (found) {
                  setScannerModal({ open: true, type: 'certificate', status: 'ok', result: parsed?.studentName || searchTerm || 'Certificado' });
                } else {
                  setScannerModal({ open: true, type: 'certificate', status: 'not_found', result: searchTerm || 'Certificado' });
                }
                setTimeout(() => setScannerModal(null), 2000);
                return;
              }

              if (parsed?.type === 'student' && parsed?.studentId) {
                const student = students.find(s => s.id === parsed.studentId || (parsed?.name && s.name.toLowerCase() === parsed.name.toLowerCase()));
                if (student) {
                  await handleMarkAttendance(student.id, 'present', attendanceDate, attendanceLabel, attendanceType);
                  setScannerModal({ open: true, type: 'attendance', status: 'ok', result: student.name || parsed.name || 'Catequizando' });
                } else {
                  setScannerModal({ open: true, type: 'attendance', status: 'not_found', result: parsed?.name || value || 'Catequizando' });
                }
                setTimeout(() => setScannerModal(null), 2000);
                return;
              }
            }
          } catch (error) {
            console.warn('QR no válido o aún no detectado:', error);
          }

          checkId = setTimeout(scanLoop, 500);
        };

        scanLoop();
      } catch (error) {
        console.error('Error abriendo la cámara para QR:', error);
        setScannerModal({ open: false, status: 'error' });
      }
    };

    runScanner();

    return () => {
      if (checkId) clearTimeout(checkId);
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [scannerModal?.open, attendanceDate, attendanceLabel, attendanceType, handleMarkAttendance, paymentRecords, generatedCertificates, levelCertificateHistory, attendanceLetterHistory, issuedCertificates, students]);

  const getAttendanceStatus = (student, dateStr, targetType = attendanceType) => {
    if (!student.attendance) return null;
    let record;

    if (targetType === 'all') {
      record = student.attendance.find(a => a.date === dateStr && (a.type || 'encuentro') === 'encuentro')
        || student.attendance.find(a => a.date === dateStr && (a.type || 'encuentro') === 'misa');
    } else {
      record = student.attendance.find(a => a.date === dateStr && (a.type || 'encuentro') === targetType);
    }

    if (!record) return null;
    if (record.status) return record.status;
    return record.present ? 'present' : 'absent';
  };

  const getAttendanceLabel = (studentList, dateStr, targetType = attendanceType) => {
    for (const st of studentList) {
      let rec;

      if (targetType === 'all') {
        rec = (st.attendance || []).find(a => a.date === dateStr && (a.type || 'encuentro') === 'encuentro')
          || (st.attendance || []).find(a => a.date === dateStr && (a.type || 'encuentro') === 'misa');
      } else {
        rec = (st.attendance || []).find(a => a.date === dateStr && (a.type || 'encuentro') === targetType);
      }

      if (rec && rec.label) return rec.label;
    }
    return '';
  };

  const getAttendanceDisplayTypeForDate = (studentList, dateStr) => {
    for (const st of studentList) {
      const encuentro = (st.attendance || []).find(a => a.date === dateStr && (a.type || 'encuentro') === 'encuentro');
      if (encuentro) return 'encuentro';
    }

    for (const st of studentList) {
      const misa = (st.attendance || []).find(a => a.date === dateStr && (a.type || 'encuentro') === 'misa');
      if (misa) return 'misa';
    }

    return 'encuentro';
  };

  const normalizePhoneForWhatsApp = (rawPhone = '') => {
    const cleaned = String(rawPhone || '').replace(/\D/g, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('506')) return cleaned;
    if (cleaned.startsWith('56')) return `506${cleaned.slice(2)}`;
    return `506${cleaned}`;
  };

  const buildWhatsAppLink = (phone, text = '') => {
    const cleanPhone = normalizePhoneForWhatsApp(phone);
    if (!cleanPhone) return '#';
    const finalText = text ? `?text=${encodeURIComponent(text)}` : '';
    return `https://wa.me/${cleanPhone}${finalText}`;
  };

  const handleOpenAttendanceMessage = (student, channel) => {
    const status = getAttendanceStatus(student, attendanceDate, attendanceType);
    const unjustifiedAbsences = (student.attendance || []).filter(record => {
      const recordStatus = record.status || (record.present ? 'present' : 'absent');
      return recordStatus === 'absent';
    }).length;
    const statusText = status === 'present' ? 'PRESENTE' : status === 'justified' ? 'AUSENCIA JUSTIFICADA' : status === 'absent' ? 'AUSENTE' : 'SIN REGISTRO';
    const catechistName = user?.displayName || userData?.name || 'Catequista';
    const message = `¡Hola! 👋✨

Le enviamos un cordial saludo. Le informamos que el día *${attendanceDate}*, el/la catequizando *${student.name}* registró el siguiente estado en su encuentro de catequesis: *${statusText}* 📖🙏
${status === 'absent' ? `\nActualmente cuenta con *${unjustifiedAbsences}* ausencia(s) injustificada(s) acumulada(s). Agradecemos su apoyo para mantener la asistencia al día. 💛\n` : ''}
¡Que tenga un bendecido día! ✨
Atentamente,
${catechistName}`;

    setMessageModal({ student, channel, message });
  };

  const handleSendAttendanceEmail = async () => {
    const recipient = messageModal?.student?.parentEmail?.trim();
    if (!recipient || !messageModal?.message) {
      alert('Este catequizando no tiene un correo electrónico registrado.');
      return;
    }

    if (!APPS_SCRIPT_URL) {
      alert('El servicio de correo no está configurado.');
      return;
    }

    try {
      setIsSendingAttendanceEmail(true);
      const studentName = messageModal.student.fullName || messageModal.student.name || 'Catequizando';
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'sendAttendanceEmail',
          recipients: [recipient],
          subject: `AsisCate — Registro de asistencia de ${studentName}`,
          message: messageModal.message,
          studentName,
          attendanceDate,
          attendanceType
        })
      });

      const result = await response.json().catch(() => null);
      if (!response.ok || result?.status === 'error') {
        throw new Error(result?.message || 'El servicio de correo no pudo completar el envío.');
      }

      alert(`Correo enviado correctamente a ${recipient}.`);
      setMessageModal(null);
    } catch (error) {
      console.error('Error enviando mensaje de asistencia por correo:', error);
      alert('No se pudo enviar el correo. Verifica la configuración del Apps Script e inténtalo de nuevo.');
    } finally {
      setIsSendingAttendanceEmail(false);
    }
  };

  const getAttendanceReportView = (groupId) => {
    const groupStudents = visibleStudents.filter(student => (
      student.groupId === groupId &&
      (!reportFilters.search || String(student.name || student.fullName || '').toLowerCase().includes(reportFilters.search.toLowerCase()))
    )).sort((a, b) => String(a.name || a.fullName || '').localeCompare(String(b.name || b.fullName || ''), 'es', { sensitivity: 'base' }));
    const selectedStudents = reportStudentIds === null
      ? groupStudents
      : groupStudents.filter(student => reportStudentIds.includes(student.id));
    const dateSet = new Set();
    const dateMap = new Map();

    groupStudents.forEach(student => {
      (student.attendance || []).forEach(record => {
        const matchesType = reportAttendanceType === 'all' || (record.type || 'encuentro') === reportAttendanceType;
        const matchesFrom = !reportFilters.dateFrom || record.date >= reportFilters.dateFrom;
        const matchesTo = !reportFilters.dateTo || record.date <= reportFilters.dateTo;
        if (!matchesType || !matchesFrom || !matchesTo) return;
        dateSet.add(record.date);
        if (!dateMap.has(record.date) || record.label) {
          dateMap.set(record.date, record.label || dateMap.get(record.date) || '');
        }
      });
    });

    return {
      groupStudents,
      selectedStudents,
      dateMap,
      sortedDates: Array.from(dateSet).sort()
    };
  };

  const handleExportAttendanceToExcel = async (groupId, selectedStudentIds = reportStudentIds) => {
    const group = groups.find(g => g.id === groupId);
    const reportView = getAttendanceReportView(groupId);
    const selectedIds = selectedStudentIds === null
      ? null
      : selectedStudentIds || reportStudentIds;
    const groupStudents = reportView.groupStudents.filter(student => selectedIds === null || selectedIds.includes(student.id));

    if (groupStudents.length === 0) {
      alert("No hay Catequizandos registrados en este grupo para exportar.");
      return;
    }

    try {
      const { dateMap, sortedDates } = reportView;
      const minDate = sortedDates[0] || 'N/A';
      const maxDate = sortedDates[sortedDates.length - 1] || 'N/A';
      const catechistsStr = group?.catechistNames ? group.catechistNames.join(', ') : 'Sin asignar';

      const headers = ['Nombre Catequizando'];
      sortedDates.forEach(d => {
        const lbl = dateMap.get(d);
        headers.push(lbl ? `${d} (${lbl})` : d);
      });
      const { default: ExcelJS } = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'AsisCate';
      workbook.created = new Date();
      const worksheet = workbook.addWorksheet('Asistencia', {
        views: [{ showGridLines: false, state: 'frozen', ySplit: 7, xSplit: 2 }]
      });
      const lastColumn = Math.max(headers.length, 3);

      worksheet.mergeCells(1, 2, 1, lastColumn);
      const titleCell = worksheet.getCell(1, 2);
      titleCell.value = 'AsisCate - Control de Asistencia Parroquial';
      titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7F1D1D' } };
      worksheet.getRow(1).height = 48;

      const metadata = [
        ['Grupo:', group ? group.name : 'N/A'],
        ['Ciclo Catequético:', group ? (group.year || '2026-2027') : '2026-2027'],
        ['Catequistas a Cargo:', catechistsStr],
        ['Rango de Fechas:', `${minDate} al ${maxDate}`]
      ];
      metadata.forEach(([label, value], index) => {
        const row = worksheet.getRow(index + 2);
        row.getCell(1).value = label;
        row.getCell(2).value = value;
        worksheet.mergeCells(index + 2, 2, index + 2, lastColumn);
        row.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF7F1D1D' } };
        row.getCell(2).font = { name: 'Arial', size: 10, color: { argb: 'FF374151' } };
        row.getCell(1).alignment = { vertical: 'middle' };
        row.getCell(2).alignment = { vertical: 'middle' };
        row.height = 21;
      });

      worksheet.addRow([]);
      const headerRow = worksheet.addRow(headers);
      headerRow.height = 34;
      headerRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7F1D1D' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = { bottom: { style: 'medium', color: { argb: 'FF450A0A' } } };
      });

      groupStudents.forEach((student) => {
        const row = worksheet.addRow([
          student.name,
          ...sortedDates.map((date) => {
            const status = getAttendanceStatus(student, date, reportAttendanceType === 'all' ? 'all' : reportAttendanceType);
            return status === 'present' ? 'Presente' : status === 'justified' ? 'Justificado' : status === 'absent' ? 'Ausente' : '-';
          })
        ]);
        row.height = 22;
        row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
          cell.font = { name: 'Arial', size: 10, color: { argb: 'FF1F2937' } };
          cell.alignment = { vertical: 'middle', horizontal: columnNumber > 2 ? 'center' : 'left', wrapText: columnNumber <= 2 };
          if (row.number % 2 === 0) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
          }
        });
        sortedDates.forEach((date, index) => {
          const cell = row.getCell(index + 2);
          const status = getAttendanceStatus(student, date, reportAttendanceType === 'all' ? 'all' : reportAttendanceType);
          const statusColors = { present: 'FFD1FAE5', justified: 'FFFEF3C7', absent: 'FFFEE2E2' };
          if (statusColors[status]) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusColors[status] } };
            cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1F2937' } };
          }
        });
      });

      worksheet.getColumn(1).width = 30;
      headers.slice(1).forEach((header, index) => {
        worksheet.getColumn(index + 2).width = Math.min(24, Math.max(14, header.length + 2));
      });
      worksheet.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7 + groupStudents.length, column: headers.length } };

      const faviconPng = await loadFaviconAsPng();
      const imageId = workbook.addImage({ base64: faviconPng, extension: 'png' });
      worksheet.addImage(imageId, { tl: { col: 0.25, row: 0.2 }, ext: { width: 54, height: 54 } });

      const buffer = await workbook.xlsx.writeBuffer();
      const downloadUrl = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const downloadLink = document.createElement('a');
      downloadLink.href = downloadUrl;
      downloadLink.download = `Asistencia_${group ? group.name.replace(/\s+/g, '_') : 'Grupo'}_${new Date().toISOString().split('T')[0]}.xlsx`;
      downloadLink.click();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error) {
      console.error("Error exportando a Excel:", error);
      alert("No se pudo generar el reporte de Excel.");
    }
  };

  const handleExportAttendanceToPdf = async (groupId, selectedStudentIds = reportStudentIds) => {
    const group = groups.find(g => g.id === groupId);
    const reportView = getAttendanceReportView(groupId);
    const selectedIds = selectedStudentIds === null
      ? null
      : selectedStudentIds || reportStudentIds;
    const groupStudents = reportView.groupStudents.filter(student => selectedIds === null || selectedIds.includes(student.id));

    if (groupStudents.length === 0) {
      alert("Selecciona al menos un catequizando para exportar.");
      return;
    }

    try {
      const [jsPdfModule, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const JsPdf = jsPdfModule.jsPDF || jsPdfModule.default?.jsPDF || jsPdfModule.default;
      const autoTable = autoTableModule.default || autoTableModule.autoTable;
      const { dateMap, sortedDates } = reportView;
      const headers = sortedDates.map(date => {
        const label = dateMap.get(date);
        return label ? `${date}\n${label}` : date;
      });
      const statusText = (student, date) => {
        const status = getAttendanceStatus(student, date, reportAttendanceType === 'all' ? 'all' : reportAttendanceType);
        return status === 'present' ? 'Presente' : status === 'justified' ? 'Justificado' : status === 'absent' ? 'Ausente' : '-';
      };
      const doc = new JsPdf({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const faviconPng = await loadFaviconAsPng();
      doc.addImage(faviconPng, 'PNG', 14, 10, 14, 14);
      doc.setFillColor(127, 29, 29);
      doc.rect(32, 10, pageWidth - 46, 14, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('AsisCate - Control de Asistencia Parroquial', 36, 19);
      doc.setTextColor(55, 65, 81);
      doc.setFontSize(9);
      doc.text(`Grupo: ${group?.name || 'N/A'}`, 14, 32);
      doc.text(`Ciclo Catequético: ${group?.year || '2026-2027'}`, 14, 38);
      doc.text(`Catequistas: ${group?.catechistNames?.join(', ') || 'Sin asignar'}`, 14, 44);
      doc.text(`Catequizandos incluidos: ${groupStudents.length}`, pageWidth - 70, 32);

      autoTable(doc, {
        startY: 50,
        head: [['Nombre Catequizando', ...headers]],
        body: groupStudents.map(student => [
          student.name,
          ...sortedDates.map(date => statusText(student, date))
        ]),
        theme: 'grid',
        headStyles: { fillColor: [127, 29, 29], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
        bodyStyles: { fontSize: 7, cellPadding: 2, textColor: [31, 41, 55] },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: { 0: { cellWidth: 52 } },
        didParseCell: (data) => {
          if (data.section !== 'body' || data.column.index < 1) return;
          const colors = { Presente: [209, 250, 229], Justificado: [254, 243, 199], Ausente: [254, 226, 226] };
          const fillColor = colors[data.cell.raw];
          if (fillColor) data.cell.styles.fillColor = fillColor;
        }
      });

      doc.save(`Asistencia_${group ? group.name.replace(/\s+/g, '_') : 'Grupo'}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error("Error exportando a PDF:", error);
      alert("No se pudo generar el reporte PDF.");
    }
  };

  const getGroupReportStudents = (groupId) => students
    .filter(student => student.groupId === groupId)
    .sort((a, b) => String(a.name || a.fullName || '').localeCompare(String(b.name || b.fullName || ''), 'es', { sensitivity: 'base' }));

  const getFilteredReportAttendance = (student) => (student.attendance || []).filter(record => {
    const matchesType = reportAttendanceType === 'all' || (record.type || 'encuentro') === reportAttendanceType;
    const matchesFrom = !reportFilters.dateFrom || record.date >= reportFilters.dateFrom;
    const matchesTo = !reportFilters.dateTo || record.date <= reportFilters.dateTo;
    return matchesType && matchesFrom && matchesTo;
  });

  const getGroupStatistics = (groupId, selectedStudentIds = reportStudentIds) => {
    const items = students.filter(student => (
      student.groupId === groupId &&
      (!reportFilters.search || student.name.toLowerCase().includes(reportFilters.search.toLowerCase())) &&
      (selectedStudentIds === null || selectedStudentIds.includes(student.id))
    ));

    if (!items.length) {
      return { total: 0, present: 0, justified: 0, absent: 0, rate: 0, totalRecords: 0 };
    }

    let present = 0;
    let justified = 0;
    let absent = 0;
    let totalRecords = 0;

    items.forEach(student => {
      getFilteredReportAttendance(student).forEach(record => {
        const status = record.status || (record.present ? 'present' : 'absent');
        totalRecords += 1;
        if (status === 'present') present += 1;
        if (status === 'justified') justified += 1;
        if (status === 'absent') absent += 1;
      });
    });

    const effectiveRecords = Math.max(totalRecords, 1);
    const rate = Math.round(((present + justified) / effectiveRecords) * 100);

    return { total: items.length, present, justified, absent, rate, totalRecords };
  };

  const generateCertificateDoc = async (group, student) => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const payload = JSON.stringify({
      type: 'certificate',
      studentId: student.id,
      studentName: student.name,
      groupId: group.id,
      groupName: group.name,
      level: group.level || 'Cate-Kinder',
      year: group.year || '2026-2027',
      issuedAt: new Date().toISOString()
    });

    let qrDataUrl = '';
    try {
      const qrResponse = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(payload)}`);
      if (qrResponse.ok) {
        const qrBlob = await qrResponse.blob();
        qrDataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(qrBlob);
        });
      }
    } catch (err) {
      console.warn('No se pudo descargar el QR externo, continuando sin QR en imagen:', err);
    }

    const faviconPng = await loadFaviconAsPng();
    const presentCount = (student.attendance || []).filter(record => (record.status || (record.present ? 'present' : 'absent')) === 'present').length;
    const justifiedCount = (student.attendance || []).filter(record => (record.status || (record.present ? 'present' : 'absent')) === 'justified').length;
    const absentCount = (student.attendance || []).filter(record => (record.status || (record.present ? 'present' : 'absent')) === 'absent').length;

    doc.setFillColor(127, 29, 29);
    doc.rect(0, 0, 210, 44, 'F');
    doc.addImage(faviconPng, 'PNG', 18, 9, 18, 18);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('Constancia de Asistencia', 44, 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('AsisCate • Ministerio de catequesis', 44, 29);

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(18, 52, 174, 126, 7, 7, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.5);
    doc.roundedRect(18, 52, 174, 126, 7, 7, 'S');

    doc.setTextColor(31, 41, 55);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.text(student.name, 24, 76);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.text(`Participó en el grupo ${group.name}`, 24, 90);
    doc.text(`Ciclo catequético: ${group.year || '2026-2027'}`, 24, 100);
    doc.text(`Se certifica que asistió a ${presentCount + justifiedCount} encuentros registrados.`, 24, 120, { maxWidth: 110 });

    if (qrDataUrl) {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(142, 68, 36, 36, 7, 7, 'F');
      doc.addImage(qrDataUrl, 'PNG', 147, 73, 26, 26);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text('QR verificador', 144, 106);
    }

    doc.setFillColor(14, 165, 233);
    doc.roundedRect(24, 134, 44, 18, 4, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`${presentCount}`, 44, 146, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Presentes', 46, 150, { align: 'center' });

    doc.setFillColor(251, 191, 36);
    doc.roundedRect(76, 134, 44, 18, 4, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`${justifiedCount}`, 98, 146, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Justificadas', 98, 150, { align: 'center' });

    doc.setFillColor(239, 68, 68);
    doc.roundedRect(128, 134, 44, 18, 4, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`${absentCount}`, 150, 146, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Ausentes', 150, 150, { align: 'center' });

    doc.setDrawColor(203, 213, 225);
    doc.line(68, 200, 142, 200);
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(9);
    doc.text('Firma del Catequista', 105, 206, { align: 'center' });

    doc.setTextColor(107, 114, 128);
    doc.setFontSize(8);
    doc.text(`Emitido el ${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}`, 18, 274);
    doc.setTextColor(127, 29, 29);
    doc.setFont('helvetica', 'bold');
    doc.text('AsisCate', 176, 274, { align: 'right' });

    return doc;
  };

  const handleGenerateCertificate = async (groupId, studentId) => {
    const group = groups.find(item => item.id === groupId);
    const student = students.find(item => item.id === studentId);

    if (!group || !student) {
      alert('No se pudo generar el certificado para este catequizando.');
      return;
    }

    try {
      const pdfDoc = await generateCertificateDoc(group, student);
      pdfDoc.save(`Constancia_${student.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);

      const certId = `cert-${student.id}-${group.id}`;
      const certRecord = {
        id: certId,
        type: 'asistencia',
        qrPayload: JSON.stringify({
          type: 'certificate-verification',
          certificateType: 'asistencia',
          studentId: student.id,
          studentName: student.name,
          groupId: group.id,
          groupName: group.name,
          issuedAt: new Date().toISOString()
        }),
        studentId: student.id,
        studentName: student.name,
        groupId: group.id,
        groupName: group.name,
        level: group.level || 'Cate-Kinder',
        year: group.year || '2026-2027',
        issuedBy: userData?.fullName || user?.displayName || 'Usuario',
        createdAt: new Date().toISOString()
      };

      try {
        await setDoc(doc(db, 'certificates', certRecord.id), certRecord);
      } catch (dbErr) {
        console.warn('No se pudo guardar el registro del certificado en Firestore:', dbErr);
      }
      setGeneratedCertificates(prev => [certRecord, ...prev.filter(item => item.id !== certId)]);
      setIssuedCertificates(prev => [certRecord, ...prev.filter(item => item.id !== certId)]);
    } catch (error) {
      console.error('Error generando certificado:', error);
      alert('No se pudo generar el certificado PDF.');
    }
  };

  const handleGenerateAttendanceLetter = async (groupId, studentId, dateStr, targetType = attendanceType) => {
    const group = groups.find(item => item.id === groupId);
    const student = students.find(item => item.id === studentId);
    if (!group || !student || !dateStr) {
      alert('No se pudo generar la carta para esta asistencia.');
      return;
    }

    try {
      const { jsPDF } = await import('jspdf');
      const record = (student.attendance || []).find(item => item.date === dateStr && (item.type || 'encuentro') === (targetType || 'encuentro'));
      const status = record?.status || 'absent';
      const statusLabel = status === 'present' ? 'asistió' : status === 'justified' ? 'tuvo una ausencia justificada' : 'no asistió';
      const description = record?.label || 'Encuentro de catequesis';

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const faviconPng = await loadFaviconAsPng();
      doc.setFillColor(127, 29, 29);
      doc.rect(0, 0, 210, 44, 'F');
      doc.addImage(faviconPng, 'PNG', 18, 9, 18, 18);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.text('Carta de Asistencia', 44, 20);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('AsisCate • Ministerio de catequesis', 44, 29);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(18, 52, 174, 126, 7, 7, 'F');
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(18, 52, 174, 126, 7, 7, 'S');
      doc.setTextColor(31, 41, 55);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(24);
      doc.text(student.name, 24, 76);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      doc.text(`Participó en el grupo ${group.name}`, 24, 90);
      doc.text(`Ciclo catequético: ${group.year || '2026-2027'}`, 24, 100);
      const body = [
        `Por medio de la presente, se hace constar que ${student.name}`,
        `el día ${dateStr}, ${statusLabel} al encuentro de catequesis correspondiente a ${description}.`,
        `Esta carta respalda su participación en el proceso formativo de la comunidad parroquial.`,
        ``,
        `En la ciudad de Alajuela, ${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}.`
      ];
      body.forEach((line, index) => {
        doc.text(line, 24, 120 + index * 10, { maxWidth: 154 });
      });
      doc.setDrawColor(127, 29, 29);
      doc.line(68, 200, 142, 200);
      doc.setFont('helvetica', 'bold');
      doc.text('Firma del catequista', 105, 206, { align: 'center' });
      doc.setTextColor(75, 85, 105);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Parroquia: ${parroquias.find(item => item.id === group.parroquiaId)?.name || 'Parroquia'}`, 18, 248);
      doc.text(`Diaconía: ${diaconias.find(item => item.id === group.diaconiaId)?.name || 'Diaconía'}`, 18, 256);
      doc.text('Diócesis: Diócesis de Alajuela', 18, 264);
      doc.setTextColor(127, 29, 29);
      doc.setFont('helvetica', 'bold');
      doc.text('AsisCate', 192, 280, { align: 'right' });
      doc.save(`Carta_Asistencia_${student.name.replace(/\s+/g, '_')}_${dateStr}.pdf`);
      const letterId = `letter-${student.id}-${group.id}-${dateStr}`;
      const letterRecord = {
        id: letterId,
        type: 'carta',
        qrPayload: JSON.stringify({
          type: 'certificate-verification',
          certificateType: 'carta',
          studentId: student.id,
          studentName: student.name,
          groupId: group.id,
          groupName: group.name,
          date: dateStr,
          issuedAt: new Date().toISOString()
        }),
        studentId: student.id,
        studentName: student.name,
        groupId: group.id,
        groupName: group.name,
        level: group.level || 'Cate-Kinder',
        year: group.year || '2026-2027',
        date: dateStr,
        attendanceType: targetType,
        issuedBy: userData?.fullName || user?.displayName || 'Usuario',
        createdAt: new Date().toISOString()
      };
      try {
        await setDoc(doc(db, 'certificates', letterRecord.id), letterRecord);
      } catch (dbErr) {
        console.warn('No se pudo guardar la carta en Firestore:', dbErr);
      }
      setAttendanceLetterHistory(prev => [letterRecord, ...prev.filter(item => item.id !== letterId)]);
      setIssuedCertificates(prev => [letterRecord, ...prev.filter(item => item.id !== letterId)]);
    } catch (error) {
      console.error('Error generando carta de asistencia:', error);
      alert('No se pudo generar la carta de asistencia.');
    }
  };

  const handleExportCertificatesZip = async (groupId) => {
    const group = groups.find(item => item.id === groupId);
    const selectedStudents = visibleStudents.filter(student => student.groupId === groupId && selectedCertificateIds.includes(student.id));

    if (!selectedStudents.length) {
      alert('Selecciona al menos un certificado con el checkbox antes de exportar ZIP.');
      return;
    }

    try {
      const zip = new JSZip();

      for (const student of selectedStudents) {
        const doc = await generateCertificateDoc(group, student);
        const pdfBlob = doc.output('blob');
        const fileName = `Constancia_${student.name.replace(/\s+/g, '_')}.pdf`;
        zip.file(fileName, pdfBlob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Certificados_${group?.name?.replace(/\s+/g, '_') || 'Grupo'}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exportando ZIP:', error);
      alert('No se pudo generar el ZIP de certificados.');
    }
  };

  const handleGenerateSelectedCertificate = async (groupId, studentId) => {
    if (certificateGenerationType === 'asistencia') {
      await handleGenerateCertificate(groupId, studentId);
      return;
    }
    if (certificateGenerationType === 'nivel') {
      await handleGenerateLevelCertificate(groupId, studentId);
      return;
    }
    await handleGenerateAttendanceLetter(groupId, studentId, certificateLetterDate, reportAttendanceType === 'all' ? attendanceType : reportAttendanceType);
  };

  const handleExportSelectedCertificatesZip = async (groupId) => {
    const group = groups.find(item => item.id === groupId);
    const selectedStudents = visibleStudents.filter(student => student.groupId === groupId && selectedCertificateIds.includes(student.id));
    if (!selectedStudents.length) {
      alert('Selecciona al menos un catequizando para exportar el ZIP.');
      return;
    }

    try {
      const zip = new JSZip();
      for (const student of selectedStudents) {
        let pdfDocument;
        let fileName;
        if (certificateGenerationType === 'asistencia') {
          pdfDocument = await generateCertificateDoc(group, student);
          fileName = `Constancia_${student.name.replace(/\s+/g, '_')}.pdf`;
        } else if (certificateGenerationType === 'nivel') {
          pdfDocument = await generateLevelCertificateDoc(group, student);
          fileName = `Certificado_${student.name.replace(/\s+/g, '_')}.pdf`;
        } else {
          alert('La carta se genera individualmente porque requiere una fecha y un tipo de asistencia.');
          return;
        }
        zip.file(fileName, pdfDocument.output('blob'));
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Certificados_${group?.name?.replace(/\s+/g, '_') || 'Grupo'}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exportando certificados seleccionados:', error);
      alert('No se pudo generar el ZIP de certificados.');
    }
  };

  const handleDeleteCertificate = async (certificateId) => {
    setGeneratedCertificates(prev => prev.filter(item => item.id !== certificateId));
    setIssuedCertificates(prev => prev.filter(item => item.id !== certificateId));
    try {
      await deleteDoc(doc(db, 'certificates', certificateId));
    } catch (error) {
      console.error('Error eliminando registro de certificado:', error);
    }
  };

  const handleDeleteLevelCertificate = async (certificateId) => {
    setLevelCertificateHistory(prev => prev.filter(item => item.id !== certificateId));
    setIssuedCertificates(prev => prev.filter(item => item.id !== certificateId));
    try {
      await deleteDoc(doc(db, 'certificates', certificateId));
    } catch (error) {
      console.error('Error eliminando registro de certificado de nivel:', error);
    }
  };

  const getGroupDisplayInfo = (group) => {
    if (!group) return { parroquia: 'Parroquia', diaconia: 'Diaconía', diocesis: 'Alajuela' };
    const parroquia = parroquias.find(item => item.id === group.parroquiaId)?.name || 'Parroquia';
    const diaconia = diaconias.find(item => item.id === group.diaconiaId)?.name || 'Diaconía';
    return {
      parroquia,
      diaconia,
      diocesis: 'Alajuela'
    };
  };

  const generateLevelCertificateDoc = async (group, student) => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const payload = JSON.stringify({
      type: 'level-certificate',
      studentId: student.id,
      studentName: student.name,
      groupId: group.id,
      groupName: group.name,
      level: group.level || 'Cate-Kinder',
      year: group.year || '2026-2027',
      issuedAt: new Date().toISOString()
    });

    let qrDataUrl = '';
    try {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(payload)}`;
      const qrResponse = await fetch(qrUrl);
      if (qrResponse.ok) {
        const qrBlob = await qrResponse.blob();
        qrDataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(qrBlob);
        });
      }
    } catch (err) {
      console.warn('No se pudo descargar el QR externo para certificado de nivel:', err);
    }
    const logoData = await loadFaviconAsPng();
    const groupInfo = getGroupDisplayInfo(group);
    const levelTitle = ((group.level || 'Cate-Kinder').toLowerCase().includes('confirma') || (group.level || 'Cate-Kinder').toLowerCase().includes('confirm')) ? 'CONFIRMA' : String(group.level || 'Cate-Kinder').toUpperCase();

    doc.setFillColor(180, 149, 110);
    doc.rect(0, 0, 297, 26, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Certificado de Catequesis', 18, 17);
    doc.addImage(logoData, 'PNG', 255, 4, 18, 18);

    doc.setFillColor(250, 245, 236);
    doc.roundedRect(14, 30, 269, 172, 8, 8, 'F');
    doc.setDrawColor(130, 95, 60);
    doc.setLineWidth(1);
    doc.roundedRect(14, 30, 269, 172, 8, 8, 'S');

    doc.setTextColor(74, 52, 36);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Diócesis de ${groupInfo.diocesis}`, 22, 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Parroquia: ${groupInfo.parroquia}`, 22, 48);
    doc.text(`Diaconía: ${groupInfo.diaconia}`, 22, 54);
    doc.text(`Ciudad: Alajuela`, 22, 60);

    if (qrDataUrl) {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(238, 36, 34, 34, 5, 5, 'F');
      doc.addImage(qrDataUrl, 'PNG', 241, 39, 28, 28);
      doc.setTextColor(109, 88, 66);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text('Verificación QR', 255, 74, { align: 'center' });
    }

    doc.setTextColor(58, 42, 31);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('Certificado de Nivel', 148.5, 72, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('Se hace constar que', 148.5, 83, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(student.name.trim(), 148.5, 93, { align: 'center' });
    doc.setDrawColor(130, 95, 60);
    doc.setLineWidth(0.6);
    doc.line(70, 96, 227, 96);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('ha cumplido satisfactoriamente con la formación correspondiente al nivel de', 148.5, 105, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(levelTitle, 148.5, 115, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Grupo: ${group.name}  ·  Año: ${group.year || '2026-2027'}`, 148.5, 123, { align: 'center' });
    doc.text('Dado en la ciudad de Alajuela, Costa Rica.', 148.5, 129, { align: 'center' });

    doc.setTextColor(58, 42, 31);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.text('“Yo soy el camino, la verdad y la vida” — Juan 14:6', 148.5, 137, { align: 'center' });

    // Sección de Firmas y Sello
    doc.setDrawColor(130, 95, 60);
    doc.setLineWidth(0.7);

    const sigY = 168;
    const leftSigCenterX = 65;
    const rightSigCenterX = 232;
    const sealCenterX = 148.5;

    // Linea y etiqueta Firma del Catequista
    doc.line(32, sigY, 98, sigY);
    doc.setTextColor(55, 45, 36);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Firma del Catequista', leftSigCenterX, sigY + 5, { align: 'center' });

    // Linea y etiqueta Firma del Párroco
    doc.line(199, sigY, 265, sigY);
    doc.text('Firma del Párroco', rightSigCenterX, sigY + 5, { align: 'center' });

    // Espacio para Sello Parroquial
    doc.setDrawColor(143, 108, 70);
    doc.setLineWidth(0.6);
    doc.circle(sealCenterX, 160, 13, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(130, 95, 60);
    doc.text('SELLO', sealCenterX, 159, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('PARROQUIAL', sealCenterX, 163, { align: 'center' });
    doc.setFontSize(7.5);
    doc.setTextColor(109, 88, 66);
    doc.text('Sello parroquial', sealCenterX, 177, { align: 'center' });

    // Pie de página
    doc.setTextColor(109, 88, 66);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Emitido el ${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}`, 22, 195);
    doc.text('AsisCate', 275, 195, { align: 'right' });

    return doc;
  };

  const handleGenerateLevelCertificate = async (groupId, studentId) => {
    const group = groups.find(item => item.id === groupId);
    const student = students.find(item => item.id === studentId);
    if (!group || !student) return;

    try {
      const pdfDoc = await generateLevelCertificateDoc(group, student);
      const certId = `level-cert-${student.id}-${group.id}`;
      const certRecord = {
        id: certId,
        type: 'nivel',
        qrPayload: JSON.stringify({
          type: 'certificate-verification',
          certificateType: 'nivel',
          studentId: student.id,
          studentName: student.name,
          groupId: group.id,
          groupName: group.name,
          level: group.level || 'Cate-Kinder',
          year: group.year || '2026-2027',
          issuedAt: new Date().toISOString()
        }),
        studentId: student.id,
        studentName: student.name,
        groupId: group.id,
        groupName: group.name,
        level: group.level || 'Cate-Kinder',
        year: group.year || '2026-2027',
        issuedBy: userData?.fullName || user?.displayName || 'Usuario',
        createdAt: new Date().toISOString()
      };
      try {
        await setDoc(doc(db, 'certificates', certRecord.id), certRecord);
      } catch (dbErr) {
        console.warn('No se pudo guardar el certificado de nivel en Firestore:', dbErr);
      }
      setLevelCertificateHistory(prev => [certRecord, ...prev.filter(item => item.id !== certId)]);
      setIssuedCertificates(prev => [certRecord, ...prev.filter(item => item.id !== certId)]);
      pdfDoc.save(`Certificado_${(group.level || 'Nivel').replace(/\s+/g, '_')}_${student.name.replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
      console.error('Error generando certificado de nivel:', error);
      alert('No se pudo generar el certificado de nivel.');
    }
  };

  const handleExportLevelCertificatesZip = async (groupId) => {
    const group = groups.find(item => item.id === groupId);
    if (!group) return;

    const studentsForGroup = visibleStudents.filter(student => student.groupId === groupId &&
      (!levelCertificateFilters.search || student.name.toLowerCase().includes(levelCertificateFilters.search.toLowerCase())) &&
      (levelCertificateFilters.level === 'all' || (group.level || 'Cate-Kinder') === levelCertificateFilters.level) &&
      (levelCertificateFilters.year === 'all' || (group.year || '2026-2027') === levelCertificateFilters.year));

    if (!studentsForGroup.length) {
      alert('No hay certificados para exportar con esos filtros.');
      return;
    }

    try {
      const zip = new JSZip();
      for (const student of studentsForGroup) {
        const doc = await generateLevelCertificateDoc(group, student);
        const pdfBlob = doc.output('blob');
        zip.file(`Certificado_${student.name.replace(/\s+/g, '_')}.pdf`, pdfBlob);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Certificados_${group.name.replace(/\s+/g, '_')}.zip`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exportando ZIP de certificados de nivel:', error);
      alert('No se pudo generar el ZIP de certificados de nivel.');
    }
  };

  const resetInventoryEditors = () => {
    setEditingInventoryItemId(null);
    setEditingInventoryAssetId(null);
    setEditingInventoryReservationId(null);
    setInventoryForm({ name: '', stock: '1' });
    setInventoryAssetForm({ name: '', stock: '1', showTogether: false });
    setInventoryReservationForm({ itemId: '', date: new Date().toISOString().split('T')[0], slot: '08:00-10:00', quantity: '1' });
  };

  const startInventoryItemEdit = (item) => {
    const canEdit = activeViewMode === 'admin' || activeViewMode === 'coordinador' || activeViewMode === 'coordinadorGeneral';
    if (!canEdit) {
      alert('Solo puedes modificar tus propios materiales.');
      return;
    }
    setEditingInventoryItemId(item.id);
    setInventoryForm({ name: item.name, stock: '1' });
  };

  const startInventoryAssetEdit = (asset) => {
    const canEdit = activeViewMode === 'admin' || asset.createdBy === currentUserKey;
    if (!canEdit) {
      alert('Solo puedes modificar tus propios activos.');
      return;
    }
    const targetAsset = asset.parentAssetId 
      ? (inventoryAssets.find(a => a.id === asset.parentAssetId) || asset)
      : asset;
    setEditingInventoryAssetId(targetAsset.id);
    setInventoryAssetForm({ 
      name: targetAsset.name, 
      stock: String(targetAsset.stock || 0), 
      showTogether: targetAsset.showTogether === true 
    });
  };

  const startInventoryReservationEdit = (reservation) => {
    const canEdit = activeViewMode === 'admin' || reservation.createdBy === currentUserKey;
    if (!canEdit) {
      alert('Solo puedes modificar tus propias reservas.');
      return;
    }
    setEditingInventoryReservationId(reservation.id);
    setInventoryReservationForm({
      itemId: reservation.itemId,
      date: reservation.date,
      slot: reservation.slot,
      quantity: String(reservation.quantity || 1)
    });
  };

  const handleAddInventoryItem = async (event) => {
    event.preventDefault();
    if (!inventoryForm.name.trim()) return;

    const payload = {
      name: inventoryForm.name.trim(),
      createdBy: user?.uid || userData?.id || userData?.fullName || 'system',
      createdByName: userData?.name || user?.displayName || 'Usuario',
      diaconiaId: effectiveDiaconiaId,
      diaconiaName: diaconias.find(diaconia => diaconia.id === effectiveDiaconiaId)?.name || '',
      createdAt: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    };

    const duplicateMaterial = inventoryItems.some(item =>
      item.id !== editingInventoryItemId &&
      String(item.diaconiaId || '') === String(payload.diaconiaId || '') &&
      sameNormalized(item.name, payload.name)
    );
    if (duplicateMaterial) {
      alert('Ya existe un material con ese nombre en esta diaconía.');
      return;
    }

    if (editingInventoryItemId) {
      const updatedItem = { id: editingInventoryItemId, ...payload };
      await setDoc(doc(db, 'inventoryItems', editingInventoryItemId), payload, { merge: true });
      setInventoryItems(prev => prev.map(item => item.id === editingInventoryItemId ? { ...item, ...updatedItem } : item));
      setEditingInventoryItemId(null);
    } else {
      const itemId = `inventory-${Date.now()}`;
      await setDoc(doc(db, 'inventoryItems', itemId), payload);
      setInventoryItems(prev => [{ id: itemId, ...payload }, ...prev]);
    }

    setInventoryForm({ name: '', stock: '1' });
  };

  const handleAddInventoryAsset = async (event) => {
    event.preventDefault();
    if (!inventoryAssetForm.name.trim()) return;

    const payload = {
      name: inventoryAssetForm.name.trim(),
      stock: Number(inventoryAssetForm.stock) || 0,
      createdBy: user?.uid || userData?.id || userData?.fullName || 'system',
      diaconiaId: effectiveDiaconiaId,
      diaconiaName: diaconias.find(diaconia => diaconia.id === effectiveDiaconiaId)?.name || '',
      createdAt: new Date().toISOString(),
      showTogether: inventoryAssetForm.showTogether === true
    };

    if (editingInventoryAssetId) {
      await setDoc(doc(db, 'inventoryAssets', editingInventoryAssetId), payload, { merge: true });
      setInventoryAssets(prev => prev.map(asset => asset.id === editingInventoryAssetId ? { id: editingInventoryAssetId, ...asset, ...payload } : asset));
      setEditingInventoryAssetId(null);
    } else {
      const assetId = `asset-${Date.now()}`;
      await setDoc(doc(db, 'inventoryAssets', assetId), payload);
      const newAsset = { id: assetId, ...payload };
      setInventoryAssets(prev => [newAsset, ...prev]);
      setInventoryReservationForm(prev => ({ ...prev, itemId: prev.itemId || newAsset.id }));
    }

    setInventoryAssetForm({ name: '', stock: '1', showTogether: false });
  };

  const handleInventoryStockChange = async (itemId, delta) => {
    const item = inventoryItems.find(entry => entry.id === itemId);
    if (!item) return;
    const stock = Math.max(0, Number(item.stock || 0) + delta);
    await updateDoc(doc(db, 'inventoryItems', itemId), { stock });
    setInventoryItems(prev => prev.map(entry => entry.id === itemId ? { ...entry, stock } : entry));
  };

  const handleInventoryAssetStockChange = async (assetId, delta) => {
    const asset = inventoryAssets.find(entry => entry.id === assetId);
    if (!asset) return;
    const stock = Math.max(0, Number(asset.stock || 0) + delta);
    await updateDoc(doc(db, 'inventoryAssets', assetId), { stock });
    setInventoryAssets(prev => prev.map(entry => entry.id === assetId ? { ...entry, stock } : entry));
  };

  const handleDeleteInventoryItem = async (itemId) => {
    const item = inventoryItems.find(entry => entry.id === itemId);
    if (!item) return;
    if (activeViewMode === 'catequista') {
      alert('Los catequistas no pueden eliminar materiales faltantes.');
      return;
    }
    await deleteDoc(doc(db, 'inventoryItems', itemId));
    setInventoryItems(prev => prev.filter(item => item.id !== itemId));
  };

  const handleDeleteAllInventoryItems = async () => {
    const canDeleteAll = activeViewMode === 'admin' || activeViewMode === 'coordinador' || activeViewMode === 'coordinadorGeneral';
    if (!canDeleteAll) {
      alert('No tienes permisos para eliminar materiales faltantes.');
      return;
    }
    const targetItems = visibleInventoryItems.filter(item => !effectiveDiaconiaId || item.diaconiaId === effectiveDiaconiaId);
    if (!targetItems.length) {
      alert('No hay materiales faltantes registrados en esta diaconía.');
      return;
    }
    const diaconiaName = diaconias.find(item => item.id === effectiveDiaconiaId)?.name || 'la diaconía seleccionada';
    showAppModal(`¿Eliminar todos los ${targetItems.length} materiales faltantes de ${diaconiaName}? Esta acción no se puede deshacer.`, {
      title: 'Confirmar eliminación',
      confirm: true,
      onConfirm: async () => {
        try {
          await Promise.all(targetItems.map(item => deleteDoc(doc(db, 'inventoryItems', item.id))));
          const targetIds = new Set(targetItems.map(item => item.id));
          setInventoryItems(previous => previous.filter(item => !targetIds.has(item.id)));
          notify('Materiales faltantes eliminados correctamente.', 'success');
        } catch (error) {
          console.error('Error eliminando todos los materiales faltantes:', error);
          notify('No se pudieron eliminar todos los materiales faltantes.', 'error');
        }
      }
    });
  };

  const handleDeleteInventoryAsset = async (assetId) => {
    const asset = inventoryAssets.find(entry => entry.id === assetId);
    if (!asset) return;
    if (activeViewMode !== 'admin' && asset.createdBy !== currentUserKey) {
      alert('Solo puedes eliminar tus propios activos.');
      return;
    }
    const linkedReservations = inventoryReservations.filter(res => res.itemId === assetId);
    await Promise.all([
      deleteDoc(doc(db, 'inventoryAssets', assetId)),
      ...linkedReservations.map(reservation => deleteDoc(doc(db, 'inventoryReservations', reservation.id)))
    ]);
    setInventoryAssets(prev => prev.filter(asset => asset.id !== assetId));
    setInventoryReservations(prev => prev.filter(res => res.itemId !== assetId));
  };

  const getInventorySlotAvailability = (itemId, date, slot, excludeReservationId = null) => {
    const item = getReservationAsset(itemId) || inventoryItems.find(entry => entry.id === itemId);
    if (!item) return 0;
    const totalStock = Number(item.stock || 0);
    const parentId = String(itemId || '').split('__unit__')[0];
    const reservedInSlot = inventoryReservations
      .filter(reservation => {
        if (excludeReservationId && reservation.id === excludeReservationId) return false;
        if (reservation.date !== date || reservation.slot !== slot) return false;
        if (reservation.itemId === itemId) return true;
        if (parentId && reservation.itemId === parentId) return true;
        if (reservation.itemId && reservation.itemId.startsWith(`${itemId}__unit__`)) return true;
        return false;
      })
      .reduce((sum, reservation) => sum + Number(reservation.quantity || 0), 0);
    return Math.max(0, totalStock - reservedInSlot);
  };

  const getReservationAsset = (itemId) => {
    const groupedAsset = inventoryAssets.find(asset => asset.id === itemId);
    if (groupedAsset) return groupedAsset;
    const parentId = String(itemId || '').split('__unit__')[0];
    const parentAsset = inventoryAssets.find(asset => asset.id === parentId);
    if (!parentAsset) return null;
    return { ...parentAsset, id: itemId, stock: 1 };
  };

  const getReservationAssetConfig = (itemId) => {
    const sourceId = String(itemId || '').split('__unit__')[0];
    return inventoryAssets.find(asset => asset.id === sourceId) || null;
  };

  const handleAddInventoryReservation = async (event) => {
    event.preventDefault();
    if (!inventoryReservationForm.itemId) return;
    const configuredDays = groupScheduleOptions.days || [];
    const configuredTimes = groupScheduleOptions.times || [];
    if (!inventoryReservationForm.date) {
      alert('Selecciona una fecha válida para la diaconía activa.');
      return;
    }
    const reservationDate = new Date(`${inventoryReservationForm.date}T12:00:00`);
    const reservationDay = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][reservationDate.getDay()];
    const todayForReservation = new Date();
    const minimumReservationDate = new Date(todayForReservation.getFullYear(), todayForReservation.getMonth(), todayForReservation.getDate());
    const maximumReservationDate = new Date(todayForReservation.getFullYear(), todayForReservation.getMonth() + 1, todayForReservation.getDate());
    if (reservationDate < minimumReservationDate || reservationDate > maximumReservationDate) {
      alert('Las reservas solo pueden hacerse desde hoy hasta un mes adelante.');
      return;
    }
    if (configuredDays.length && !configuredDays.includes(reservationDay)) {
      alert(`Las reservas solo están disponibles los días configurados: ${configuredDays.join(', ')}.`);
      return;
    }
    if (configuredTimes.length && !configuredTimes.includes(inventoryReservationForm.slot)) {
      alert('Selecciona un horario disponible para la diaconía activa.');
      return;
    }

    const selectedAssetConfig = getReservationAssetConfig(inventoryReservationForm.itemId);
    const isGrouped = selectedAssetConfig?.showTogether === true;
    const quantity = isGrouped
      ? Number(inventoryReservationForm.quantity) || 0
      : 1;
    if (quantity <= 0) {
      alert('La cantidad reservada debe ser mayor a 0.');
      return;
    }

    const item = getReservationAsset(inventoryReservationForm.itemId);
    if (!item) {
      alert('Selecciona un activo válido para reservar.');
      return;
    }

    const available = getInventorySlotAvailability(
      inventoryReservationForm.itemId,
      inventoryReservationForm.date,
      inventoryReservationForm.slot,
      editingInventoryReservationId
    );

    if (quantity > available) {
      alert(`No hay suficiente disponibilidad para esa fecha y franja. Disponible: ${available}.`);
      return;
    }

    const reservationPayload = {
      itemId: item.id,
      itemName: item.name,
      diaconiaId: item.diaconiaId || effectiveDiaconiaId,
      diaconiaName: item.diaconiaName || diaconias.find(diaconia => diaconia.id === (item.diaconiaId || effectiveDiaconiaId))?.name || '',
      reservedBy: userData?.fullName || user?.displayName || 'Usuario',
      date: inventoryReservationForm.date,
      slot: inventoryReservationForm.slot,
      quantity,
      status: 'confirmado',
      createdBy: user?.uid || userData?.id || userData?.fullName || 'system',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(`${inventoryReservationForm.date}T23:59:59`).toISOString()
    };

    if (editingInventoryReservationId) {
      if (hasDuplicateReservation(inventoryReservations, reservationPayload, editingInventoryReservationId)) {
        alert('Ya existe una reserva igual para ese activo, fecha, horario y usuario.');
        return;
      }
      await setDoc(doc(db, 'inventoryReservations', editingInventoryReservationId), reservationPayload, { merge: true });
      setInventoryReservations(prev => prev.map(reservation => reservation.id === editingInventoryReservationId ? { ...reservation, ...reservationPayload } : reservation));
      setEditingInventoryReservationId(null);
    } else {
      if (hasDuplicateReservation(inventoryReservations, reservationPayload)) {
        alert('Ya existe una reserva igual para ese activo, fecha, horario y usuario.');
        return;
      }
      const reservationId = `inventory-res-${Date.now()}`;
      await setDoc(doc(db, 'inventoryReservations', reservationId), reservationPayload);
      const newReservation = { id: reservationId, ...reservationPayload };
      setInventoryReservations(prev => [newReservation, ...prev]);
    }

    setInventoryReservationForm({
      itemId: '',
      date: inventoryReservationForm.date,
      slot: inventoryReservationForm.slot,
      quantity: '1'
    });
  };

  const handleDeleteInventoryReservation = async (reservationId) => {
    const reservation = inventoryReservations.find(entry => entry.id === reservationId);
    if (!reservation) return;
    const reservationOwnerKeys = [user?.uid, userData?.id, userData?.fullName, user?.displayName].filter(Boolean);
    const isReservationOwner = reservationOwnerKeys.includes(reservation.createdBy);
    if (activeViewMode === 'catequista' && !isReservationOwner) {
      alert('Solo puedes eliminar reservas creadas por ti.');
      return;
    }
    if (activeViewMode !== 'admin' && !isReservationOwner) {
      alert('Solo puedes eliminar tus propias reservas.');
      return;
    }
    await deleteDoc(doc(db, 'inventoryReservations', reservationId));
    setInventoryReservations(prev => prev.filter(reservation => reservation.id !== reservationId));
  };

  useEffect(() => {
    if (!inventoryReservationForm.itemId || editingInventoryReservationId) return;
    const available = getInventorySlotAvailability(
      inventoryReservationForm.itemId,
      inventoryReservationForm.date,
      inventoryReservationForm.slot
    );
    if (available <= 0) {
      setInventoryReservationForm(prev => ({ ...prev, itemId: '' }));
    }
  }, [inventoryReservationForm.itemId, inventoryReservationForm.date, inventoryReservationForm.slot, inventoryReservations, editingInventoryReservationId]);

  const handleExportInventoryPdf = async () => {
    const itemsToExport = visibleInventoryItems;
    if (!itemsToExport.length) {
      alert('No hay materiales para exportar.');
      return;
    }

    try {
      // La lista de materiales se dibuja manualmente para evitar depender de
      // la importación dinámica de jspdf-autotable (que puede fallar en Vite
      // cuando el chunk optimizado queda desactualizado).
      const jsPdfModule = await import('jspdf');
      const JsPdf = jsPdfModule.jsPDF || jsPdfModule.default?.jsPDF || jsPdfModule.default;

      const doc = new JsPdf({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');

      try {
        const faviconPng = await loadFaviconAsPng();
        doc.addImage(faviconPng, 'PNG', 14, 10, 14, 14);
      } catch (err) {
        console.warn('No se pudo cargar el logo para el PDF de materiales:', err);
      }

      doc.setFillColor(127, 29, 29);
      doc.rect(32, 10, pageWidth - 46, 14, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('AsisCate - Control de Materiales', 36, 19);

      doc.setTextColor(55, 65, 81);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Fecha de emisión: ${new Date().toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' })}`, 14, 32);
      doc.text(`Total de materiales en reporte: ${itemsToExport.length}`, 14, 38);
      if (inventoryDateFilters.dateFrom || inventoryDateFilters.dateTo) {
        const fromLabel = inventoryDateFilters.dateFrom || 'Inicio';
        const toLabel = inventoryDateFilters.dateTo || 'Actualidad';
        doc.text(`Intervalo de fechas: ${fromLabel} al ${toLabel}`, 14, 44);
      }

      const resolveRegisteredBy = (item) => {
        if (item.createdByName && item.createdByName.trim()) return item.createdByName.trim();
        if (item.createdBy) {
          const userMatch = allUsers.find(u => u.id === item.createdBy || u.uid === item.createdBy || u.email === item.createdBy);
          if (userMatch?.fullName) return userMatch.fullName;
          if (userMatch?.name) return userMatch.name;
          if (item.createdBy !== 'system') return item.createdBy;
        }
        return 'No especificado';
      };

      let y = inventoryDateFilters.dateFrom || inventoryDateFilters.dateTo ? 50 : 46;
      doc.setFillColor(127, 29, 29); doc.rect(14, y, pageWidth - 28, 9, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('#', 18, y + 6); doc.text('Material', 30, y + 6); doc.text('Diaconía', 110, y + 6); doc.text('Registrado por', 150, y + 6); y += 16;
      doc.setTextColor(31, 41, 55); doc.setFont('helvetica', 'normal');
      itemsToExport.forEach((item, index) => { if (y > pageHeight - 20) { doc.addPage(); y = 20; } doc.text(String(index + 1), 18, y); doc.text(String(item.name || 'Sin nombre').slice(0, 40), 30, y); doc.text(String(item.diaconiaName || 'Sin diaconía').slice(0, 22), 110, y); doc.text(resolveRegisteredBy(item).slice(0, 24), 150, y); doc.setDrawColor(226, 232, 240); doc.line(14, y + 3, pageWidth - 14, y + 3); y += 8; });

      doc.save(`Lista_Materiales_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Error exportando lista de materiales PDF:', error);
      alert('No se pudo exportar la lista de materiales.');
    }
  };

  const handleAddPaymentRecord = async (event) => {
    event.preventDefault();
    const selectedStudent = paymentForm.studentId ? students.find(student => student.id === paymentForm.studentId) : null;
    const resolvedStudentName = selectedStudent?.name || selectedStudent?.fullName || paymentForm.studentName.trim();
    const finalInvoiceName = paymentForm.withoutMatricula ? paymentForm.invoiceName.trim() : (resolvedStudentName || paymentForm.studentName.trim());

    if (!finalInvoiceName || !paymentForm.amount || Number(paymentForm.amount) <= 0) {
      alert('Completa la información del pago correctamente.');
      return;
    }

    const maxReceiptNum = paymentRecords.reduce((max, r) => {
      const num = r.receiptNumber !== undefined && r.receiptNumber !== null
        ? Number(r.receiptNumber)
        : Number(String(r.id).replace(/\D/g, '').slice(-6) || 0);
      return Math.max(max, isNaN(num) ? 0 : num);
    }, 0);
    const nextReceiptNum = maxReceiptNum > 0 ? maxReceiptNum + 1 : 1;

    const now = new Date();
    const newRecord = {
      id: `payment-${Date.now()}`,
      receiptNumber: nextReceiptNum,
      groupId: paymentForm.groupId || '',
      groupName: visibleGroups.find(group => group.id === paymentForm.groupId)?.name || groups.find(group => group.id === paymentForm.groupId)?.name || '',
      studentId: paymentForm.studentId || '',
      studentName: resolvedStudentName || finalInvoiceName,
      invoiceName: finalInvoiceName,
      concept: paymentForm.concept.trim() || 'Pago general',
      amount: Number(paymentForm.amount),
      currency: 'CRC',
      paymentMethod: paymentForm.paymentMethod || 'Efectivo',
      dateTime: now.toISOString(),
      date: now.toISOString().split('T')[0],
      issuedBy: userData?.fullName || user?.displayName || 'Usuario',
      createdBy: user?.uid || userData?.id || userData?.fullName || 'system',
      withoutMatricula: Boolean(paymentForm.withoutMatricula)
    };

    if (isRecentDuplicatePayment(paymentRecords, newRecord)) {
      alert('Este pago parece haberse registrado recientemente. Verifica el historial antes de repetirlo.');
      return;
    }

    try {
      await savePaymentRecord(db, newRecord);
      setPaymentRecords(prev => [newRecord, ...prev.filter(record => record.id !== newRecord.id)]);
      setPaymentForm({
        groupId: '',
        studentId: '',
        studentName: '',
        concept: '',
        amount: '',
        paymentMethod: 'Efectivo',
        withoutMatricula: false,
        invoiceName: ''
      });
    } catch (error) {
      console.error('Error guardando pago en Firestore:', error);
      alert('No se pudo guardar el pago en la base de datos. Verifica tus permisos e inténtalo de nuevo.');
    }
  };

  const handleDeletePaymentRecord = async (paymentId) => {
    try {
      await deleteDoc(doc(db, 'payments', paymentId));
      setPaymentRecords(prev => prev.filter(record => record.id !== paymentId));
    } catch (error) {
      console.error('Error eliminando pago de Firestore:', error);
      alert('No se pudo eliminar el pago.');
    }
  };

  const formatCRC = (value) => `₡${Number(value || 0).toLocaleString('es-CR')}`;

  const buildPaymentProofPayload = (record) => JSON.stringify({
    type: 'payment-proof',
    paymentId: record.id,
    studentName: record.studentName,
    invoiceName: record.invoiceName || record.studentName,
    concept: record.concept,
    amount: Number(record.amount || 0),
    dateTime: record.dateTime || record.date,
    issuedBy: record.issuedBy,
    paymentMethod: record.paymentMethod,
    withoutMatricula: Boolean(record.withoutMatricula)
  });

  const buildPaymentProofQrUrl = (record) => {
    const payload = buildPaymentProofPayload(record);
    return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(payload)}`;
  };

  const buildPaymentQrDataUrl = async (record) => {
    const qrUrl = buildPaymentProofQrUrl(record);
    const response = await fetch(qrUrl);
    if (!response.ok) throw new Error('No se pudo cargar el QR del comprobante.');
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const getReceiptMeta = async (record) => {
    const rawNumber = record.receiptNumber !== undefined && record.receiptNumber !== null
      ? record.receiptNumber
      : (String(record.id).replace(/\D/g, '').slice(-6) || '1');
    const receiptNumber = String(rawNumber).padStart(6, '0');
    const dateValue = new Date(record.dateTime || record.date || new Date().toISOString());
    const dateText = dateValue.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeText = dateValue.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', hour12: true });
    const issuedTo = record.invoiceName || record.studentName || 'Sin matrícula';
    const totalText = formatCRC(record.amount || 0);
    let qrUrl;
    try {
      qrUrl = await buildPaymentQrDataUrl(record);
    } catch {
      qrUrl = buildPaymentProofQrUrl(record);
    }
    let logoUrl;
    try {
      logoUrl = await loadFaviconAsPng();
    } catch {
      logoUrl = '/favicon.svg';
    }
    return { receiptNumber, dateText, timeText, issuedTo, totalText, qrUrl, logoUrl };
  };

  const buildReceiptHtmlContent = (record, meta) => {
    const { receiptNumber, dateText, timeText, issuedTo, totalText, qrUrl, logoUrl } = meta;
    return `
      <div style="width: 300px; max-width: 300px; margin: 0 auto; padding: 14px 12px; font-family: 'Courier New', Courier, monospace, Arial, sans-serif; color: #000; background: #fff; font-size: 11px; line-height: 1.35; box-sizing: border-box; text-align: left;">
        <div style="text-align: center; position: relative; padding-top: 2px; padding-bottom: 8px; border-bottom: 1.5px dashed #000;">
          <div style="position: absolute; top: 0; right: 0; font-size: 11.5px; font-weight: 700; letter-spacing: 0.5px;">N° ${receiptNumber}</div>
          ${logoUrl ? `<img src="${logoUrl}" style="width: 42px; height: 42px; margin: 0 auto 4px; display: block;" alt="AsisCate" />` : ''}
          <div style="font-size: 13.5px; font-weight: 800; margin: 2px 0 1px; text-transform: uppercase; letter-spacing: 0.5px;">COMPROBANTE DE PAGO</div>
          <div style="font-size: 9.5px; color: #333; margin: 0 0 2px;">Parroquia Nuestra Señora de El Carmen</div>
        </div>

        <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dashed #444; font-size: 10px;">
          <span><strong>Fecha:</strong> ${dateText}</span>
          <span><strong>Hora:</strong> ${timeText}</span>
        </div>

        <div style="padding: 6px 0; border-bottom: 1.5px dashed #000;">
          <div style="margin-bottom: 5px;">
            <span style="display: block; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #333;">A nombre de:</span>
            <span style="font-size: 11px; font-weight: 700; word-break: break-word;">${issuedTo}</span>
          </div>
          ${record.groupName ? `
          <div style="margin-bottom: 5px;">
            <span style="display: block; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #333;">Grupo:</span>
            <span style="font-size: 11px; word-break: break-word;">${record.groupName}</span>
          </div>` : ''}
          <div style="margin-bottom: 5px;">
            <span style="display: block; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #333;">Concepto:</span>
            <span style="font-size: 11px; word-break: break-word;">${record.concept || 'Pago general'}</span>
          </div>
          <div style="margin-bottom: 5px;">
            <span style="display: block; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #333;">Método de pago:</span>
            <span style="font-size: 11px; word-break: break-word;">${record.paymentMethod || 'Efectivo'}</span>
          </div>
          <div style="margin-bottom: 5px;">
            <span style="display: block; font-size: 9px; font-weight: 700; text-transform: uppercase; color: #333;">Factura emitida por:</span>
            <span style="font-size: 11px; word-break: break-word;">${record.issuedBy || 'Usuario'}</span>
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
  };

  const generateReceiptPngDataUrl = async (record) => {
    const meta = await getReceiptMeta(record);
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '0';
    container.style.top = '0';
    container.style.width = '300px';
    container.style.opacity = '0';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '-9999';
    container.style.backgroundColor = '#ffffff';
    container.innerHTML = buildReceiptHtmlContent(record, meta);
    document.body.appendChild(container);

    try {
      const ticketEl = container.firstElementChild || container;
      const imgs = Array.from(ticketEl.querySelectorAll('img'));
      await Promise.all(imgs.map(img => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
          setTimeout(resolve, 600);
        });
      }));

      await new Promise(resolve => setTimeout(resolve, 80));

      const dataUrl = await toPng(ticketEl, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      });
      return { dataUrl, meta };
    } finally {
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    }
  };

  const handleViewPaymentQr = async (record) => {
    try {
      const { dataUrl, meta } = await generateReceiptPngDataUrl(record);
      setPaymentProofModal({
        type: 'payment-proof',
        title: `Comprobante ${record.studentName || record.invoiceName || meta.receiptNumber}`,
        record,
        imageUrl: dataUrl
      });
    } catch (error) {
      console.error('Error cargando imagen del comprobante:', error);
      alert('No se pudo generar la imagen del comprobante.');
    }
  };

  const handlePrintPaymentReceipt = async (record) => {
    try {
      const meta = await getReceiptMeta(record);
      const receiptWindow = window.open('', '_blank', 'width=480,height=750');
      if (!receiptWindow) {
        alert('Tu navegador bloqueó la ventana de impresión.');
        return;
      }

      receiptWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Comprobante de Pago N° ${meta.receiptNumber}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }
    * { box-sizing: border-box; }
    body {
      width: 80mm;
      max-width: 80mm;
      margin: 0 auto;
      padding: 0;
      background: #fff;
    }
    @media print {
      body { width: 80mm; padding: 0; }
    }
  </style>
</head>
<body>
  ${buildReceiptHtmlContent(record, meta)}
</body>
</html>`);
      receiptWindow.document.close();
      receiptWindow.focus();
      setTimeout(() => receiptWindow.print(), 300);
    } catch (error) {
      console.error('Error generando impresión del comprobante:', error);
      alert('No se pudo preparar la vista de impresión del comprobante.');
    }
  };

  const handleGeneratePaymentProofPdf = async (record) => {
    try {
      const { jsPDF } = await import('jspdf');
      const { dataUrl, meta } = await generateReceiptPngDataUrl(record);

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

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [pdfWidthMm, pdfHeightMm]
      });

      doc.addImage(dataUrl, 'PNG', 0, 0, pdfWidthMm, pdfHeightMm, undefined, 'FAST');
      doc.save(`Comprobante_${meta.receiptNumber}.pdf`);
    } catch (error) {
      console.error('Error generando comprobante PDF:', error);
      alert('No se pudo generar el comprobante PDF del pago.');
    }
  };

  const handleExportGroupRosterToExcel = async (groupId) => {
    const group = groups.find(item => item.id === groupId);
    const groupStudents = getGroupReportStudents(groupId);
    if (groupStudents.length === 0) {
      alert("No hay catequizandos registrados en este grupo.");
      return;
    }

    try {
      const { default: ExcelJS } = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Catequizandos', { views: [{ showGridLines: false, state: 'frozen', ySplit: 7 }] });
      const headers = ['Nombre Catequizando', 'Correo Encargado', 'Teléfono Encargado'];
      worksheet.mergeCells(1, 2, 1, headers.length + 1);
      const title = worksheet.getCell(1, 2);
      title.value = 'AsisCate - Padrón de Catequizandos';
      title.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      title.alignment = { vertical: 'middle', horizontal: 'left' };
      title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7F1D1D' } };
      worksheet.getRow(1).height = 48;
      [['Grupo:', group?.name || 'N/A'], ['Ciclo Catequético:', group?.year || '2026-2027'], ['Catequistas a Cargo:', group?.catechistNames?.join(', ') || 'Sin asignar']].forEach(([label, value], index) => {
        const row = worksheet.getRow(index + 2);
        row.getCell(1).value = label;
        row.getCell(2).value = value;
        worksheet.mergeCells(index + 2, 2, index + 2, headers.length + 1);
        row.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF7F1D1D' } };
        row.getCell(2).font = { name: 'Arial', size: 10, color: { argb: 'FF374151' } };
        row.height = 21;
      });
      worksheet.addRow([]);
      const headerRow = worksheet.addRow(headers);
      headerRow.height = 32;
      headerRow.eachCell(cell => {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7F1D1D' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      });
      groupStudents.forEach((student, index) => {
        const row = worksheet.addRow([student.name, student.parentEmail || '-', student.parentPhone || '-']);
        row.height = 22;
        row.eachCell(cell => {
          cell.font = { name: 'Arial', size: 10, color: { argb: 'FF1F2937' } };
          cell.alignment = { vertical: 'middle', wrapText: true };
          if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
        });
      });
      worksheet.getColumn(1).width = 32;
      worksheet.getColumn(2).width = 34;
      worksheet.getColumn(3).width = 24;
      const imageId = workbook.addImage({ base64: await loadFaviconAsPng(), extension: 'png' });
      worksheet.addImage(imageId, { tl: { col: 0.25, row: 0.2 }, ext: { width: 54, height: 54 } });
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `Catequizandos_${group?.name?.replace(/\s+/g, '_') || 'Grupo'}.xlsx`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error("Error exportando padrón a Excel:", error);
      alert("No se pudo generar el padrón en Excel.");
    }
  };

  const handleDownloadEnrollmentExpediente = async (studentRecord) => {
    if (!studentRecord) return;
    try {
      const jsPdfModule = await import('jspdf');
      const JsPdf = jsPdfModule.jsPDF || jsPdfModule.default?.jsPDF || jsPdfModule.default;
      const pdf = new JsPdf({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 14;
      const line = (label, value, x, y, maxWidth = 178) => {
        pdf.setFont('helvetica', 'bold');
        const labelText = `${label}: `;
        const labelWidth = pdf.getTextWidth(labelText);
        pdf.text(labelText, x, y);
        pdf.setFont('helvetica', 'normal');
        pdf.text(pdf.splitTextToSize(String(value || 'N/A'), maxWidth - labelWidth), x + labelWidth, y);
      };
      const section = (title, y) => {
        pdf.setFillColor(241, 245, 249);
        pdf.rect(margin, y - 5, pageWidth - margin * 2, 8, 'F');
        pdf.setTextColor(127, 29, 29);
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10);
        pdf.text(title, margin + 3, y);
        pdf.setTextColor(30, 41, 59);
        pdf.setFontSize(8.5);
        return y + 12;
      };
      pdf.setFillColor(127, 29, 29);
      pdf.rect(0, 0, pageWidth, 24, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(15);
      pdf.text('EXPEDIENTE DIGITAL DE MATRÍCULA', margin, 11);
      pdf.setFontSize(8.5);
      pdf.setFont('helvetica', 'normal');
      pdf.text('AsisCate · Sistema Parroquial', margin, 18);
      pdf.setTextColor(30, 41, 59);
      let y = 36;
      y = section('I. DATOS DEL CATEQUIZANDO', y);
      line('Nombre completo', studentRecord.fullName || studentRecord.name, margin, y); line('Nivel', studentRecord.level, 110, y, 82); y += 9;
      line('Fecha de nacimiento', `${studentRecord.birthDate || 'N/A'} (${studentRecord.age ?? 'N/A'} años)`, margin, y); line('Identificación', `${studentRecord.idType || 'NACIONAL'} · ${studentRecord.nationalId || 'N/A'}`, 110, y, 82); y += 9;
      line('Ciclo', studentRecord.cycle, margin, y); line('Teléfono', studentRecord.phone, 110, y, 82); y += 9;
      line('Dirección', studentRecord.address, margin, y); y += 11;
      line('Datos adicionales', `Género: ${studentRecord.gender || 'N/A'} · Lugar de nacimiento: ${studentRecord.birthPlace || 'N/A'} · Centro educativo: ${studentRecord.educationCenter || 'N/A'} · Grado: ${studentRecord.schoolGrade || 'N/A'}`, margin, y); y += 16;
      line('Preguntas de salud', `Adecuación: ${studentRecord.curricularAdaptation || 'NO'} · Conducta: ${studentRecord.behaviorIssue || 'NO'} · Impedimento físico: ${studentRecord.physicalImpairment || 'NO'}`, margin, y); y += 12;
      line('Notas médicas', studentRecord.medicalNotes, margin, y); y += 14;
      y = section('II. FAMILIARES Y ENCARGADOS', y);
      const family = studentRecord.family || {};
      [ ['Madre', family.mother], ['Padre', family.father], ['Encargado', family.guardian] ].forEach(([label, person]) => {
        if (!person?.fullName) return;
        line(label, `${person.fullName} · Cédula: ${person.nationalId || 'N/A'} · Tel: ${person.phone1 || 'N/A'} · Correo: ${person.email || 'N/A'}`, margin, y);
        y += 9;
      });
      line('Estado civil', studentRecord.maritalStatus, margin, y); line('Hermanos', `${studentRecord.siblingCount || 'N/A'}${studentRecord.siblingDetails ? ` · ${studentRecord.siblingDetails}` : ''}`, 110, y, 82); y += 13;
      y = section('III. ESTADO DE DOCUMENTACIÓN', y);
      const documentStatus = (item) => item?.status === 'COMPLETED' || item?.url ? 'ADJUNTO' : 'PENDIENTE';
      line('Cédula menor', documentStatus(studentRecord.documents?.minorId), margin, y); line('Bautismo', documentStatus(studentRecord.documents?.bautismo), 110, y, 82); y += 9;
      line('Primera comunión', documentStatus(studentRecord.documents?.comunion), margin, y); line('Firma', studentRecord.family?.guardian?.signatureUrl || studentRecord.family?.guardian?.signatureData ? 'REGISTRADA' : 'PENDIENTE', 110, y, 82); y += 13;
      y = section('IV. COMPROMISO DE FORMACIÓN EN LA FE', y);
      pdf.setFont('helvetica', 'normal');
      pdf.setFont('helvetica', 'bold');
      pdf.text(`Estado: ${studentRecord.acceptsCatechesisCommitment ? 'ACEPTADO' : 'PENDIENTE DE ACEPTACIÓN'}`, margin + 3, y);
      y += 7;
      pdf.setFont('helvetica', 'normal');
      const commitmentText = 'ME COMPROMETO A CUMPLIR CON LA FORMACIÓN EN LA FE Y PARTICIPAR EN LO QUE SE REQUIERE EN LA CATEQUESIS, ENCUENTROS FAMILIARES Y MISAS DE NIÑOS, PARA QUE MI HIJO O HIJA CREZCA ESPIRITUALMENTE COMO HIJO DE DIOS Y APRENDA A VIVIR CRISTIANAMENTE.';
      const commitmentLines = pdf.splitTextToSize(commitmentText, pageWidth - margin * 2 - 6);
      pdf.text(commitmentLines, margin + 3, y);
      pdf.setTextColor(100, 116, 139); pdf.setFontSize(7.5);
      pdf.text(`Emitido el ${new Date().toLocaleDateString('es-CR')} · AsisCate Parroquial`, margin, 285);
      pdf.save(`Expediente_${(studentRecord.fullName || studentRecord.name || 'Catequizando').replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
      console.error('Error generando PDF del expediente:', error);
      alert('No se pudo generar el PDF del expediente.');
    }
  };

  const handleExportGroupRosterToPdf = async (groupId) => {
    const group = groups.find(item => item.id === groupId);
    const groupStudents = getGroupReportStudents(groupId);
    if (groupStudents.length === 0) {
      alert("No hay catequizandos registrados en este grupo.");
      return;
    }
    try {
      const [jsPdfModule, autoTableModule] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const JsPdf = jsPdfModule.jsPDF || jsPdfModule.default?.jsPDF || jsPdfModule.default;
      const autoTable = autoTableModule.default || autoTableModule.autoTable;
      const doc = new JsPdf({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const faviconPng = await loadFaviconAsPng();
      doc.addImage(faviconPng, 'PNG', 14, 10, 14, 14);
      doc.setFillColor(127, 29, 29);
      doc.rect(32, 10, 164, 14, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('AsisCate - Padrón de Catequizandos', 36, 19);
      doc.setTextColor(55, 65, 81);
      doc.setFontSize(9);
      doc.text(`Grupo: ${group?.name || 'N/A'}`, 14, 32);
      doc.text(`Ciclo Catequético: ${group?.year || '2026-2027'}`, 14, 38);
      doc.text(`Catequistas: ${group?.catechistNames?.join(', ') || 'Sin asignar'}`, 14, 44);
      autoTable(doc, {
        startY: 50,
        head: [['Nombre Catequizando', 'Correo Encargado', 'Teléfono Encargado']],
        body: groupStudents.map(student => [student.name, student.parentEmail || '-', student.parentPhone || '-']),
        theme: 'grid',
        headStyles: { fillColor: [127, 29, 29], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
        bodyStyles: { fontSize: 8, cellPadding: 3, textColor: [31, 41, 55] },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles: { 0: { cellWidth: 58 }, 1: { cellWidth: 70 }, 2: { cellWidth: 42 } }
      });
      doc.save(`Catequizandos_${group?.name?.replace(/\s+/g, '_') || 'Grupo'}.pdf`);
    } catch (error) {
      console.error("Error exportando padrón a PDF:", error);
      alert("No se pudo generar el padrón en PDF.");
    }
  };

  const handleExportGroupSchedulePdf = async () => {
    const scheduledGroups = visibleGroups.filter(group => group.scheduleDay && group.scheduleTime && group.room);
    if (!scheduledGroups.length) { alert('No hay grupos con horario y salón asignados.'); return; }
    const levelStyles = {
      'Cate-Kinder': { fill: [22, 163, 74], text: [255, 255, 255] },
      'Primer Nivel': { fill: [37, 99, 235], text: [255, 255, 255] },
      'Segundo Nivel': { fill: [124, 58, 237], text: [255, 255, 255] },
      'Tercer Nivel (Primera Comunión)': { fill: [255, 255, 255], text: [17, 24, 39] },
      'Cuarto Nivel': { fill: [250, 204, 21], text: [255, 255, 255] },
      'Quinto Nivel': { fill: [249, 115, 22], text: [255, 255, 255] },
      'Sexto Nivel': { fill: [124, 45, 18], text: [255, 255, 255] },
      'Septimo Nivel': { fill: [56, 189, 248], text: [255, 255, 255] },
      'Confirma': { fill: [220, 38, 38], text: [255, 255, 255] }
    };
    if (schedulePreviewHtml) {
      try {
        const pngBlob = await scheduleSvgToPngBlob();
        if (!pngBlob) throw new Error('No se pudo renderizar el HTML del horario');
        const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(pngBlob); });
        const jsPdfModule = await import('jspdf');
        const JsPdf = jsPdfModule.jsPDF || jsPdfModule.default?.jsPDF || jsPdfModule.default;
        const pdf = new JsPdf({ orientation: 'landscape', unit: 'mm', format: 'letter' });
        const pageWidth = pdf.internal.pageSize.getWidth(); const pageHeight = pdf.internal.pageSize.getHeight(); const margin = 8;
        const image = new Image(); image.src = dataUrl; await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
        const ratio = Math.min((pageWidth - margin * 2) / image.width, (pageHeight - margin * 2) / image.height);
        const imageWidth = image.width * ratio; const imageHeight = image.height * ratio;
        pdf.addImage(dataUrl, 'PNG', (pageWidth - imageWidth) / 2, margin, imageWidth, imageHeight, undefined, 'FAST');
        pdf.save(`Horario_Grupos_${new Date().toISOString().split('T')[0]}.pdf`);
        return;
      } catch (error) { console.error('Error exportando horario HTML a PDF:', error); alert('No se pudo generar el PDF del horario.'); return; }
    }
    const days = [...new Set(scheduledGroups.map(group => group.scheduleDay))];
    const dayOrder = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    days.sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
    try {
      const jsPdfModule = await import('jspdf');
      const JsPdf = jsPdfModule.jsPDF || jsPdfModule.default?.jsPDF || jsPdfModule.default;
      const pdf = new JsPdf({ orientation: 'landscape', unit: 'mm', format: 'letter' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      days.forEach((day, dayIndex) => {
        if (dayIndex > 0) pdf.addPage();
        const dayGroups = scheduledGroups.filter(group => group.scheduleDay === day);
        const times = [...new Set(dayGroups.map(group => group.scheduleTime))];
        const rooms = [...new Set(dayGroups.map(group => group.room))];
        const left = 14; const top = 48; const roomWidth = 42; const gridWidth = pageWidth - left * 2 - roomWidth; const timeWidth = gridWidth / Math.max(times.length, 1); const rowHeight = Math.max(8, Math.min(18, (pageHeight - top - 20) / Math.max(rooms.length, 1)));
        pdf.setFillColor(127, 29, 29); pdf.roundedRect(0, 0, pageWidth, 30, 3, 3, 'F');
        pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(17); pdf.text(`AsisCate - Horario de grupos · ${day}`, 16, 18);
        pdf.setFontSize(8); pdf.text(`Emitido: ${new Date().toLocaleDateString('es-CR')}`, pageWidth - 16, 18, { align: 'right' });
        pdf.setFillColor(185, 28, 28); pdf.rect(left, top, roomWidth, 10, 'F'); pdf.setTextColor(255, 255, 255); pdf.setFontSize(8); pdf.text('Salón', left + roomWidth / 2, top + 6.5, { align: 'center' });
        times.forEach((time, index) => { pdf.setFillColor(185, 28, 28); pdf.rect(left + roomWidth + index * timeWidth, top, timeWidth, 10, 'F'); pdf.setTextColor(255, 255, 255); pdf.text(time, left + roomWidth + index * timeWidth + timeWidth / 2, top + 6.5, { align: 'center' }); });
        rooms.forEach((room, rowIndex) => {
          const y = top + 10 + rowIndex * rowHeight;
          pdf.setFillColor(185, 28, 28); pdf.rect(left, y, roomWidth, rowHeight, 'F'); pdf.setTextColor(255, 255, 255); pdf.setFontSize(7.5); pdf.text(room, left + 2, y + rowHeight / 2 + 2, { maxWidth: roomWidth - 4 });
          times.forEach((time, colIndex) => {
            const x = left + roomWidth + colIndex * timeWidth;
            const cellGroups = dayGroups.filter(group => group.room === room && group.scheduleTime === time);
            pdf.setDrawColor(203, 213, 225); pdf.setFillColor(248, 250, 252); pdf.rect(x, y, timeWidth, rowHeight, 'FD');
            const blockHeight = rowHeight / Math.max(cellGroups.length, 1);
            cellGroups.forEach((group, groupIndex) => { const style = levelStyles[group.level] || { fill: [71, 85, 105], text: [255, 255, 255] }; const blockY = y + groupIndex * blockHeight; pdf.setFillColor(...style.fill); pdf.roundedRect(x + 0.6, blockY + 0.6, timeWidth - 1.2, blockHeight - 1.2, 1.5, 1.5, 'F'); pdf.setTextColor(...style.text); pdf.setFontSize(7); pdf.text(getScheduleGroupLabel(group), x + timeWidth / 2, blockY + blockHeight / 2 + 1.5, { align: 'center', maxWidth: timeWidth - 3 }); });
          });
        });
        pdf.setTextColor(100, 116, 139); pdf.setFontSize(7); pdf.text('AsisCate - Sistema Parroquial', left, pageHeight - 8);
      });
      pdf.save(`Horario_Grupos_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) { console.error('Error exportando horario:', error); alert('No se pudo generar el horario.'); }
  };

  const buildScheduleHtml = (cycleFilter = '') => {
    const scheduledGroups = visibleGroups.filter(group => (
      (!cycleFilter || String(group.year || '').trim() === cycleFilter) &&
      group.scheduleDay && group.scheduleTime && group.room
    ));
    if (!scheduledGroups.length) return '';
    const levelClasses = { 'Cate-Kinder': 'nivel-kinder', 'Primer Nivel': 'nivel-primero', 'Segundo Nivel': 'nivel-segundo', 'Tercer Nivel (Primera Comunión)': 'nivel-tercero', 'Cuarto Nivel': 'nivel-cuarto', 'Quinto Nivel': 'nivel-quinto', 'Sexto Nivel': 'nivel-sexto', 'Septimo Nivel': 'nivel-septimo', 'Confirma': 'nivel-confirma' };
    const days = [...new Set(scheduledGroups.map(group => group.scheduleDay))];
    const dayOrder = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    days.sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
    const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    const tables = days.map(day => {
      const dayGroups = scheduledGroups.filter(group => group.scheduleDay === day);
      const times = [...new Set(dayGroups.map(group => group.scheduleTime))];
      const rooms = [...new Set(dayGroups.map(group => group.room))];
      const head = `<thead><tr><th>Salón</th>${times.map(time => `<th>${escapeHtml(time)}</th>`).join('')}</tr></thead>`;
      const body = rooms.map(room => `<tr><td class="salon-header">${escapeHtml(room)}</td>${times.map(time => {
        const cellGroups = dayGroups.filter(group => group.room === room && group.scheduleTime === time);
        return `<td><div class="cell-container">${cellGroups.map(group => {
          const catechistValues = Array.isArray(group.catechistNames) ? group.catechistNames : (group.catechistName ? [group.catechistName] : []);
          const catechists = catechistValues.map(name => String(name || '').trim().split(/\s+/)[0]).filter(Boolean).join(', ');
          return `<div class="group-card ${levelClasses[group.level] || 'nivel-default'}"><span class="group-name">${escapeHtml(getScheduleGroupLabel(group))}</span>${catechists ? `<span class="group-catechist">${escapeHtml(catechists)}</span>` : ''}</div>`;
        }).join('')}</div></td>`;
      }).join('')}</tr>`).join('');
      return `<h2 class="day-title">Horario de Grupos - <strong>${escapeHtml(day)}</strong></h2><table class="schedule-table"><thead>${head.replace('<thead>', '').replace('</thead>', '')}</thead><tbody>${body}</tbody></table>`;
    }).join('<div class="day-break"></div>');
    const logoSvg = `<svg class="app-logo" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" rx="10" fill="#991B1B" fill-opacity="0.12"/><path d="M20 12L10 33" stroke="#991B1B" stroke-width="4" stroke-linecap="round"/><path d="M20 12L30 33" stroke="#991B1B" stroke-width="4" stroke-linecap="round"/><path d="M14 23H26" stroke="#EF4444" stroke-width="3.5" stroke-linecap="round"/><path d="M20 3V11M17 6H23" stroke="#991B1B" stroke-width="2.5" stroke-linecap="round"/><path d="M25 22L28.5 25.5L35 16" stroke="#10B981" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>AsisCate - Horario de Grupos</title><style>
      *{box-sizing:border-box}body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;margin:20px;background:#f8fafc;color:#1e293b}.banner-card{background:#fff;border:2px solid #e2e8f0;border-radius:12px;padding:0;display:flex;align-items:stretch;justify-content:space-between;margin-bottom:24px;box-shadow:0 2px 4px rgba(0,0,0,.05);overflow:hidden}.banner-left{display:flex;align-items:center;gap:16px;background:#8b0000;color:#fff;padding:16px 24px;border-radius:10px 0 0 10px}.logo-placeholder{width:55px;height:55px;border-radius:8px;background:#fff;display:flex;align-items:center;justify-content:center;flex:none}.app-logo{width:48px;height:48px}.banner-title h1{margin:0;font-size:22px;color:#fff}.banner-title p{margin:4px 0 0;color:#fff;font-size:14px;font-weight:500}.banner-meta{font-size:12px;color:#64748b;text-align:right;display:flex;align-items:center;padding:16px 24px}.day-title{margin:0 0 12px;color:#8b0000;font-size:17px}.schedule-table{width:100%;border-collapse:separate;border-spacing:0;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.08);border-radius:12px;overflow:hidden;border:1px solid #cbd5e1}.schedule-table th{background:#8b0000;color:#fff;font-weight:bold;text-align:center;padding:12px;font-size:14px}.schedule-table th:first-child{width:160px;border-top-left-radius:12px}.schedule-table th:last-child{border-top-right-radius:12px}.schedule-table td{border:1px solid #e2e8f0;padding:10px;vertical-align:top;background:#fff}.salon-header{width:160px;vertical-align:middle!important;border-right:2px solid #6b0000!important;background:#8b0000!important;color:#fff;font-weight:bold;text-align:center}.cell-container{display:flex;flex-wrap:wrap;gap:8px;min-height:55px;align-items:center;justify-content:center}.group-card{padding:8px 12px;border-radius:8px;text-align:center;box-shadow:0 2px 4px rgba(0,0,0,.12);min-width:110px;flex:1}.group-name{font-size:14px;font-weight:bold;display:block}.group-catechist{font-size:11px;font-weight:500;display:block;margin-top:3px;opacity:.95}.nivel-kinder{background:#16a34a;color:#fff}.nivel-primero{background:#2563eb;color:#fff}.nivel-segundo{background:#7c3aed;color:#fff}.nivel-tercero{background:#fff;color:#000;border:2px solid #94a3b8}.nivel-cuarto{background:#eab308;color:#fff}.nivel-quinto{background:#f97316;color:#fff}.nivel-sexto{background:#78350f;color:#fff}.nivel-septimo{background:#0ea5e9;color:#fff}.nivel-confirma{background:#dc2626;color:#fff}.nivel-default{background:#475569;color:#fff}.day-break{height:24px}
      @media print{body{margin:12px}.banner-card,.schedule-table{break-inside:avoid}.day-break{height:12px}}
    </style></head><body><div class="banner-card"><div class="banner-left"><div class="logo-placeholder">${logoSvg}</div><div class="banner-title"><h1>AsisCate - Sistema Parroquial</h1><p>Horario de Grupos</p></div></div><div class="banner-meta">Emitido: ${escapeHtml(new Date().toLocaleDateString('es-CR'))}</div></div>${tables}</body></html>`;
  };

  const handleOpenSchedulePreview = async (cycleFilter = '') => {
    const html = buildScheduleHtml(cycleFilter);
    if (!html) { alert('No hay grupos con horario y salón asignados.'); return; }
    setSchedulePreviewHtml(html);
    setIsSchedulePreviewOpen(true);
  };

  const scheduleSvgToPngBlob = async () => {
    if (!schedulePreviewHtml) return null;
    const renderTarget = document.createElement('div');
    renderTarget.style.position = 'absolute'; renderTarget.style.left = '0'; renderTarget.style.top = '0'; renderTarget.style.width = '1400px'; renderTarget.style.background = '#f8fafc'; renderTarget.style.opacity = '1'; renderTarget.style.pointerEvents = 'none'; renderTarget.style.zIndex = '-1';
    const parsedHtml = new DOMParser().parseFromString(schedulePreviewHtml, 'text/html');
    const temporaryStyles = [...parsedHtml.querySelectorAll('style')].map(style => {
      const styleNode = document.createElement('style');
      styleNode.textContent = style.textContent;
      document.head.appendChild(styleNode);
      return styleNode;
    });
    renderTarget.innerHTML = `<div class="schedule-render-root">${parsedHtml.body?.innerHTML || ''}</div>`;
    document.body.appendChild(renderTarget);
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
      const dataUrl = await toPng(renderTarget, { pixelRatio: 2, cacheBust: true, backgroundColor: '#f8fafc' });
      const response = await fetch(dataUrl);
      return await response.blob();
    } finally {
      renderTarget.remove();
      temporaryStyles.forEach(styleNode => styleNode.remove());
    }
  };

  const handleDownloadSchedulePng = async () => {
    try {
      const pngBlob = await scheduleSvgToPngBlob();
      if (!pngBlob) throw new Error('No se pudo convertir el horario a PNG');
      const url = URL.createObjectURL(pngBlob);
      const link = document.createElement('a'); link.href = url; link.download = `Horario_Grupos_${new Date().toISOString().split('T')[0]}.png`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { console.error('Error descargando horario PNG:', error); alert('No se pudo descargar la imagen.'); }
  };

  const handleCopySchedulePng = async () => {
    try {
      const pngBlob = await scheduleSvgToPngBlob();
      if (!pngBlob || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('El navegador no permite copiar imágenes');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
      alert('Horario copiado como imagen PNG.');
    } catch (error) { console.error('Error copiando horario PNG:', error); alert('No se pudo copiar la imagen. Puedes descargarla como PNG.'); }
  };

  const canModifyManagedUser = (targetUserObj) => {
    if (!targetUserObj || targetUserObj.id === user?.uid) return false;
    const targetEmail = targetUserObj.email?.toLowerCase() || '';
    if (['cmisra2407@gmail.com', 'asiscate.elcarmen@gmail.com'].includes(targetEmail)) return false;
    if (userRole === 'admin') return true;
    if (targetUserObj.role === 'admin') return false;
    if (userRole === 'coordinador') return targetUserObj.role === 'catequista';
    return userRole === 'coordinadorGeneral';
  };

  const handleChangeRole = async (targetUserId, newRole) => {
    if (userRole !== 'admin' && userRole !== 'coordinadorGeneral') return;
    const targetUserObj = allUsers.find(u => u.id === targetUserId);
    if (!canModifyManagedUser(targetUserObj)) return;
    const targetEmail = targetUserObj?.email?.toLowerCase() || '';
    if (['cmisra2407@gmail.com', 'asiscate.elcarmen@gmail.com'].includes(targetEmail)) {
      alert("Este usuario es Administrador Principal por defecto y no se le puede cambiar el rol.");
      return;
    }
    try {
      const userRef = doc(db, 'users', targetUserId);
      await updateDoc(userRef, { role: newRole });
      await fetchAllData();
      if (targetUserId === user?.uid) {
        setUserRole(newRole);
        const nextView = newRole === 'admin' ? 'admin' : newRole === 'coordinadorGeneral' ? 'coordinadorGeneral' : newRole === 'coordinador' ? 'coordinador' : 'catequista';
        setActiveViewMode(nextView);
        if (activeTab === 'parroquias' || activeTab === 'horarios' || activeTab === 'admin') setActiveTab('dashboard');
      }
    } catch (error) {
      console.error("Error cambiando el rol:", error);
    }
  };

  const handleApproveUser = async (targetUserId) => {
    if (userRole !== 'admin' && userRole !== 'coordinador' && userRole !== 'coordinadorGeneral') return;
    const targetUserObj = allUsers.find(u => u.id === targetUserId);
    if (!canModifyManagedUser(targetUserObj)) return;
    try {
      const userRef = doc(db, 'users', targetUserId);
      await updateDoc(userRef, { approved: true });
      fetchAllData();
    } catch (error) {
      console.error("Error aprobando usuario:", error);
      alert("Error al aprobar el usuario.");
    }
  };

  const handleAddAllowedEmail = async (e) => {
    e.preventDefault();
    const cleanEmail = newAllowedEmailInput.trim().toLowerCase();
    if (!cleanEmail) return;

    if (!cleanEmail.includes('@')) {
      alert("Por favor ingresa un correo electrónico válido.");
      return;
    }

    try {
      const docRef = doc(db, 'allowedEmails', cleanEmail);
      await setDoc(docRef, {
        email: cleanEmail,
        createdAt: new Date().toISOString(),
        addedBy: user.email
      });
      setNewAllowedEmailInput('');
      await fetchAllData();
    } catch (error) {
      console.error("Error agregando correo a la lista preautorizada:", error);
      alert("No se pudo agregar el correo a la lista preautorizada.");
    }
  };

  const handleDeleteAllowedEmail = async (emailId) => {
    try {
      await deleteDoc(doc(db, 'allowedEmails', emailId));
      await fetchAllData();
    } catch (error) {
      console.error("Error eliminando correo preautorizado:", error);
    }
  };

  const handleToggleActiveUser = async (targetUserId, currentActiveStatus) => {
    if (userRole !== 'admin' && userRole !== 'coordinador' && userRole !== 'coordinadorGeneral') return;
    const targetUserObj = allUsers.find(u => u.id === targetUserId);
    if (!canModifyManagedUser(targetUserObj)) return;
    const targetEmail = targetUserObj?.email?.toLowerCase() || '';
    if (['cmisra2407@gmail.com', 'asiscate.elcarmen@gmail.com'].includes(targetEmail)) {
      alert("No se puede desactivar a un Administrador Principal.");
      return;
    }
    try {
      const newStatus = currentActiveStatus === false ? true : false;
      const userRef = doc(db, 'users', targetUserId);
      await updateDoc(userRef, { active: newStatus });
      fetchAllData();
    } catch (error) {
      console.error("Error cambiando estado activo/inactivo:", error);
      alert("Error al actualizar el estado del usuario.");
    }
  };

  const handleUpdateUserTerritory = async (targetUserId, pId, dId) => {
    if (userRole !== 'admin' && userRole !== 'coordinador' && userRole !== 'coordinadorGeneral') return;
    try {
      const targetUser = allUsers.find(item => item.id === targetUserId);
      if (!canModifyManagedUser(targetUser)) return;
      const previousDiaconiaId = targetUser?.diaconiaId || '';
      const userRef = doc(db, 'users', targetUserId);
      await updateDoc(userRef, { parroquiaId: pId, diaconiaId: dId });

      // Un catequista no puede conservar grupos de su diaconía anterior.
      // Actualizamos también el arreglo de nombres para evitar asignaciones
      // visuales obsoletas en las tarjetas de grupos.
      if (targetUser?.role === 'catequista' && previousDiaconiaId && previousDiaconiaId !== dId) {
        const affectedGroups = groups.filter(group => {
          const assignedIds = Array.isArray(group.catechistIds)
            ? group.catechistIds
            : (group.catechistId ? [group.catechistId] : []);
          return group.diaconiaId === previousDiaconiaId && assignedIds.includes(targetUserId);
        });
        await Promise.all(affectedGroups.map(group => {
          const assignedIds = Array.isArray(group.catechistIds)
            ? group.catechistIds
            : (group.catechistId ? [group.catechistId] : []);
          const nextIds = assignedIds.filter(id => id !== targetUserId);
          const assignedNames = Array.isArray(group.catechistNames) ? group.catechistNames : [];
          const targetName = targetUser.name || targetUser.email || '';
          const nextNames = assignedNames.filter(name => name !== targetName && name !== targetUser.email);
          const updates = {
            catechistIds: nextIds,
            catechistNames: nextNames
          };
          if (group.catechistId === targetUserId) updates.catechistId = nextIds[0] || '';
          return updateDoc(doc(db, 'groups', group.id), updates);
        }));
      }

      await fetchAllData();
    } catch (error) {
      console.error("Error asignando ubicación a usuario:", error);
    }
  };

  const handleDeleteUser = async (targetUser) => {
    if (!canModifyManagedUser(targetUser)) return;
    const targetEmail = targetUser?.email?.toLowerCase() || '';
    if (['cmisra2407@gmail.com', 'asiscate.elcarmen@gmail.com'].includes(targetEmail)) {
      alert("No se puede eliminar a un Administrador Principal.");
      return;
    }

    if (userRole === 'coordinador' && targetUser.diaconiaId !== userData?.diaconiaId) {
      alert("Solo puedes eliminar usuarios pertenecientes a tu diaconía.");
      return;
    }

    if (!window.confirm(`¿Seguro que deseas eliminar al usuario ${targetUser.name || targetUser.email}?`)) return;

    try {
      await deleteDoc(doc(db, 'users', targetUser.id));
      fetchAllData();
    } catch (error) {
      console.error("Error eliminando usuario:", error);
    }
  };

  const visibleGroups = useVisibleGroups({
    groups,
    activeViewMode,
    effectiveDiaconiaId,
    userId: user?.uid
  });

  const visibleGroupIds = visibleGroups.map(g => g.id);

  const { visibleStudents, latestAttendanceDate } = useVisibleStudents({
    students,
    visibleGroupIds,
    activeViewMode,
    effectiveDiaconiaId
  });

  useEffect(() => {
    const firstVisibleGroupId = visibleGroups[0]?.id || '';
    setDashboardGroupId(previousGroupId => (
      previousGroupId && visibleGroups.some(group => group.id === previousGroupId)
        ? previousGroupId
        : firstVisibleGroupId
    ));
  }, [visibleGroups]);

  useEffect(() => {
    if (!latestAttendanceDate) return;

    const timeoutId = window.setTimeout(() => {
      if (!attendanceDateInitializedRef.current) {
        setAttendanceDate(latestAttendanceDate);
        attendanceDateInitializedRef.current = true;
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [latestAttendanceDate]);

  const currentUserKey = user?.uid || userData?.id || userData?.fullName || 'system';
  const { inventoryDateFilteredItems, visibleInventoryItems, visibleInventoryAssets, visibleInventoryReservations, displayInventoryAssets } = useVisibleInventory({
    inventoryItems,
    inventoryAssets,
    inventoryReservations,
    inventoryDateFilters,
    allUsers,
    activeViewMode,
    effectiveDiaconiaId
  });

  const { visiblePaymentRecords, filteredPaymentRecords, paginatedPaymentRecords, paymentPageSize, paymentTotalPages, totalCollected } = useVisiblePayments({
    paymentRecords,
    paymentFilters,
    paymentCurrentPage,
    groups,
    activeViewMode,
    effectiveDiaconiaId,
    currentUserKey,
    visibleGroupIds
  });
  const { dashboardAttendanceRecords, dashboardAttendanceStats, absentRate, dashboardDonutStyle } = useDashboardAttendance({
    visibleStudents,
    dashboardGroupId,
    dashboardAttendanceType,
    dashboardDate
  });

  

  const {
    managedUsers,
    legacyPanelEnabled,
    canAccessEnrollment,
    canAccessEnrollmentDashboard,
    canAccessUserManagement,
    showPreferencesMenu
  } = useRoleAccess({ allUsers, activeViewMode, userRole, userData, effectiveDiaconiaId, isEnrollmentEnabled });

  if (loading) {
    return (
      <div className={`min-h-screen flex flex-col justify-center items-center p-4 ${themeMode === 'dark' ? 'bg-black text-white' : 'bg-slate-50 text-slate-800'}`}>
        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-red-800 border-solid"></div>
        <p className="mt-4 font-medium text-sm text-center">Cargando AsisCate...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthModal
        themeMode={themeMode}
        authError={authError}
        authSubmitting={authSubmitting}
        authMode={authMode}
        setAuthMode={setAuthMode}
        setAuthError={setAuthError}
        handleGoogleLogin={handleGoogleLogin}
        handleMicrosoftLogin={handleMicrosoftLogin}
        handleEmailAuthSubmit={handleEmailAuthSubmit}
        nameAuthInput={nameAuthInput}
        setNameAuthInput={setNameAuthInput}
        emailAuthInput={emailAuthInput}
        setEmailAuthInput={setEmailAuthInput}
        passwordAuthInput={passwordAuthInput}
        setPasswordAuthInput={setPasswordAuthInput}
      />
    );
  }

  const mainBgClass = themeMode === 'dark' ? 'bg-black text-white' : 'bg-slate-50 text-slate-800';
  const cardBgClass = themeMode === 'dark' ? 'bg-black border-neutral-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800';
  const inputBgClass = themeMode === 'dark' ? 'border bg-neutral-950 border-neutral-700 text-white placeholder-neutral-400' : 'border bg-white border-slate-300 text-slate-800 placeholder-slate-400';
  const labelTextClass = themeMode === 'dark' ? 'text-slate-300' : 'text-slate-600';
  const browserThemeStyle = { colorScheme: themeMode === 'dark' ? 'dark' : 'light' };

  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-semibold text-slate-700 dark:bg-slate-950 dark:text-slate-200">Cargando AsisCate…</div>}>
      <div className={`min-h-screen flex flex-col ${mainBgClass}`}>
      {/* HEADER DE NAVEGACIÓN */}
      {!isOnline && (
        <div className="bg-amber-500 text-amber-950 text-center text-xs font-bold py-2 px-4 border-b border-amber-400">
          Modo offline activado • Se están usando datos guardados en este dispositivo.
        </div>
      )}

      <header
        className="border-b sticky top-0 z-40 shadow-sm transition-colors"
        style={{ backgroundColor: navbarColor, borderColor: darkenHex(navbarColor, 0.22) }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2 sm:gap-3">
              <button onClick={() => setActiveTab('dashboard')} className="flex items-center gap-2 sm:gap-3">
              <img src="/faviconclaro.svg" alt="AsisCate" className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0" />
              <span className="font-bold text-base sm:text-lg text-white">AsisCate</span>
              </button>
              <select
                value={activeViewMode}
                onChange={(event) => handleToggleViewMode(event.target.value)}
                className="hidden lg:block rounded-lg border border-red-700 bg-red-950 px-3 py-2 text-xs font-bold text-white"
                aria-label="Seleccionar vista"
              >
                {userRole === 'admin' && <option value="admin">Admin</option>}
                {(userRole === 'admin' || userRole === 'coordinador') && <option value="coordinador">Coordinador</option>}
                {(userRole === 'admin' || userRole === 'coordinadorGeneral') && <option value="coordinadorGeneral">Cord. General</option>}
                <option value="catequista">Catequista</option>
              </select>
              {(activeViewMode === 'coordinadorGeneral' || activeViewMode === 'admin') && (
                <select
                  value={generalDiaconiaId}
                  onChange={(event) => {
                    setGeneralDiaconiaId(event.target.value);
                    setSelectedGroupId('');
                    setDashboardGroupId('');
                    setSelectedGroupForStudent('');
                    setPaymentFilters(previous => ({ ...previous, groupId: 'all' }));
                  }}
                  className="hidden lg:block max-w-44 rounded-lg border border-red-700 bg-red-950 px-3 py-2 text-xs font-bold text-white"
                  aria-label="Seleccionar diaconía"
                >
                  <option value="">Selecciona diaconía</option>
                  {diaconias
                    .filter(diaconia => activeViewMode === 'admin' || !userData?.parroquiaId || diaconia.parroquiaId === userData.parroquiaId)
                    .map(diaconia => <option key={diaconia.id} value={diaconia.id}>{diaconia.name}</option>)}
                </select>
              )}
            </div>

            {/* Menú Desktop */}
            <div className="hidden lg:flex items-center gap-4">
              <nav className="flex items-center gap-1">
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                    activeTab === 'dashboard' 
                      ? 'bg-white text-red-900 font-bold'
                      : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                  }`}
                >
                  Inicio
                </button>
                <button
                  onClick={() => setActiveTab('groups')}
                  className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                    activeTab === 'groups' 
                      ? 'bg-white text-red-900 font-bold'
                      : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                  }`}
                >
                  Grupos
                </button>
                {(canAccessEnrollment || canAccessEnrollmentDashboard) && (
                  <div className="relative" data-navbar-menu>
                    {canAccessEnrollment && canAccessEnrollmentDashboard ? (
                      <button onClick={() => setOpenNavMenu(openNavMenu === 'enrollment' ? null : 'enrollment')} className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${['enrollment', 'enrollmentDashboard'].includes(activeTab) ? 'bg-white text-red-900 font-bold' : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'}`}>Matrículas ▾</button>
                    ) : (
                      <button onClick={() => setActiveTab(canAccessEnrollment ? 'enrollment' : 'enrollmentDashboard')} className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${['enrollment', 'enrollmentDashboard'].includes(activeTab) ? 'bg-white text-red-900 font-bold' : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'}`}>{canAccessEnrollment ? 'Matriculas' : 'Dash. Matrículas'}</button>
                    )}
                    {openNavMenu === 'enrollment' && canAccessEnrollment && canAccessEnrollmentDashboard && (
                      <div className="absolute left-0 top-full mt-1 w-48 rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl z-50">
                        <button onClick={() => { setActiveTab('enrollment'); setOpenNavMenu(null); }} className="w-full px-3 py-2 rounded text-left text-xs text-slate-200 hover:bg-slate-700">Matriculas</button>
                        <button onClick={() => { setActiveTab('enrollmentDashboard'); setOpenNavMenu(null); }} className="w-full px-3 py-2 rounded text-left text-xs text-slate-200 hover:bg-slate-700">Dash. Matrículas</button>
                      </div>
                    )}
                  </div>
                )}
                <div className="relative" data-navbar-menu>
                  <button onClick={() => setOpenNavMenu(openNavMenu === 'tools' ? null : 'tools')} className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${['history', 'inventario', 'pagos'].includes(activeTab) ? 'bg-white text-red-900 font-bold' : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'}`}>Herramientas ▾</button>
                  {openNavMenu === 'tools' && (
                    <div className="absolute left-0 top-full mt-1 w-40 rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl z-50">
                      <button onClick={() => { setActiveTab('history'); setOpenNavMenu(null); }} className="w-full px-3 py-2 rounded text-left text-xs text-slate-200 hover:bg-slate-700">Reportes</button>
                      <button onClick={() => { setActiveTab('pagos'); setOpenNavMenu(null); }} className="w-full px-3 py-2 rounded text-left text-xs text-slate-200 hover:bg-slate-700">Pagos</button>
                      <button onClick={() => { setActiveTab('inventario'); setOpenNavMenu(null); }} className="w-full px-3 py-2 rounded text-left text-xs text-slate-200 hover:bg-slate-700">Inventario</button>
                    </div>
                  )}
                </div>
                {showPreferencesMenu && (
                  <div className="relative" data-navbar-menu>
                  <button onClick={() => setOpenNavMenu(openNavMenu === 'preferences' ? null : 'preferences')} className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${['parroquias', 'horarios', 'admin'].includes(activeTab) ? 'bg-white text-red-900 font-bold' : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'}`}>Preferencias ▾</button>
                    {openNavMenu === 'preferences' && (
                      <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl z-50">
                        {activeViewMode === 'admin' && <button onClick={() => { setActiveTab('parroquias'); setOpenNavMenu(null); }} className="w-full px-3 py-2 rounded text-left text-xs text-slate-200 hover:bg-slate-700">Parroquias y diaconías</button>}
                        {canManageScheduleOptions && <button onClick={() => { setActiveTab('horarios'); setOpenNavMenu(null); }} className="w-full px-3 py-2 rounded text-left text-xs text-slate-200 hover:bg-slate-700">Horarios y salones</button>}
                        {canAccessUserManagement && <button onClick={() => { setActiveTab('admin'); setOpenNavMenu(null); }} className="w-full px-3 py-2 rounded text-left text-xs text-slate-200 hover:bg-slate-700">Usuarios</button>}
                      </div>
                    )}
                  </div>
                )}
              </nav>

              <div className="flex items-center gap-3 border-l pl-4 border-slate-700">
                <div className="relative">
                  <button
                    onClick={() => {
                      setUserNameDraft(userData?.name || user.displayName || '');
                      setModalParroquiaId(userData?.parroquiaId || '');
                      setModalDiaconiaId(userData?.diaconiaId || '');
                      setUserPhoneCode(userData?.phoneCode || '+506');
                      setUserPhoneNumber(userData?.phoneNumber || '');
                      setIsUserNameModalOpen(true);
                    }}
                    className={`flex flex-col text-right text-white hover:text-red-100 transition-colors p-1.5 rounded-lg ${
                      isTerritoryPending ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-red-900 animate-pulse bg-amber-500/20' : ''
                    }`}
                  >
                    <span className="text-xs font-semibold text-white">{userData?.name || user.displayName}</span>
                    <span className="text-[10px] text-slate-200">{user.email}</span>
                  </button>

                  {/* Mensaje Flotante / Tooltip prominente cuando falta la Parroquia y Diaconía */}
                  {isTerritoryPending && (
                    <div className="absolute right-0 top-full mt-2 w-72 bg-amber-400 text-amber-950 p-3 rounded-2xl shadow-2xl border-2 border-amber-300 text-xs font-extrabold z-50 animate-bounce">
                      <div className="flex items-start gap-2.5">
                        <span className="text-lg leading-none">📍</span>
                        <div>
                          <div className="font-extrabold text-xs uppercase tracking-wide text-amber-950 mb-0.5">¡Configura tu ubicación aquí!</div>
                          <p className="font-medium text-[11px] leading-tight text-amber-900">
                            Haz clic en tu usuario para asignar tu Parroquia y Diaconía y habilitar la app.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 text-rose-500 hover:text-rose-600 rounded-lg hover:bg-rose-50/10 transition-colors text-xs font-semibold"
                >
                  Salir
                </button>
                <button
                  onClick={handleToggleTheme}
                  title="Cambiar Modo Claro/Oscuro"
                  className="p-2 rounded-lg border text-xs font-bold transition-all bg-slate-700 border-slate-600 text-amber-300 hover:bg-slate-600"
                >
                  {themeMode === 'dark' ? '🌙' : '☀️'}
                </button>
              </div>
            </div>

            {/* Menú Móvil */}
            <div className="lg:hidden flex items-center gap-2">
              <button
                onClick={handleToggleTheme}
                title="Cambiar Modo Claro/Oscuro"
                className={`p-2 rounded-lg border text-xs font-bold transition-all ${themeMode === 'dark' ? 'bg-slate-700 border-slate-600 text-amber-300 hover:bg-slate-600' : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              >
                {themeMode === 'dark' ? '🌙' : '☀️'}
              </button>

              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className={`p-2 rounded-lg focus:outline-none ${themeMode === 'dark' ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-400 hover:bg-slate-200'}`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isMobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Desplegable Móvil */}
        {isMobileMenuOpen && (
          <div className={`mobile-menu ${themeMode === 'light' ? 'mobile-menu-light' : ''} lg:hidden border-b px-4 pt-2 pb-4 space-y-3 ${themeMode === 'dark' ? 'border-neutral-800 bg-black text-slate-100' : 'border-slate-200 bg-white text-slate-800'}`}>
            <div className="flex flex-col space-y-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-2">
                <select value={activeViewMode} onChange={(event) => handleToggleViewMode(event.target.value)} className={`w-full rounded-lg border px-3 py-2 text-xs font-bold ${themeMode === 'dark' ? 'border-red-700 bg-red-950 text-white' : 'border-slate-300 bg-white text-slate-800'}`} aria-label="Seleccionar vista">
                  {userRole === 'admin' && <option value="admin">Admin</option>}
                  {(userRole === 'admin' || userRole === 'coordinador') && <option value="coordinador">Coordinador</option>}
                  {(userRole === 'admin' || userRole === 'coordinadorGeneral') && <option value="coordinadorGeneral">Coord. General</option>}
                  <option value="catequista">Catequista</option>
                </select>
                {(activeViewMode === 'coordinadorGeneral' || activeViewMode === 'admin') && (
                  <select value={generalDiaconiaId} onChange={(event) => { setGeneralDiaconiaId(event.target.value); setSelectedGroupId(''); setDashboardGroupId(''); setSelectedGroupForStudent(''); setPaymentFilters(previous => ({ ...previous, groupId: 'all' })); }} className={`w-full rounded-lg border px-3 py-2 text-xs font-bold ${themeMode === 'dark' ? 'border-red-700 bg-red-950 text-white' : 'border-slate-300 bg-white text-slate-800'}`} aria-label="Seleccionar diaconía">
                    <option value="">Selecciona diaconía</option>
                    {diaconias.filter(diaconia => activeViewMode === 'admin' || !userData?.parroquiaId || diaconia.parroquiaId === userData.parroquiaId).map(diaconia => <option key={diaconia.id} value={diaconia.id}>{diaconia.name}</option>)}
                  </select>
                )}
              </div>
              <button
                onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }}
                className={`px-3 py-2 rounded-lg text-left font-medium text-sm ${activeTab === 'dashboard' ? (themeMode === 'dark' ? 'bg-slate-700 text-white font-bold' : 'bg-white text-red-900 font-bold') : themeMode === 'dark' ? 'text-slate-400' : 'text-slate-400'}`}
              >
                Panel Principal
              </button>
              <button
                onClick={() => { setActiveTab('groups'); setIsMobileMenuOpen(false); }}
                className={`px-3 py-2 rounded-lg text-left font-medium text-sm ${activeTab === 'groups' ? (themeMode === 'dark' ? 'bg-slate-700 text-white font-bold' : 'bg-white text-red-900 font-bold') : themeMode === 'dark' ? 'text-slate-400' : 'text-slate-400'}`}
              >
                Grupos
              </button>
              {(canAccessEnrollment || canAccessEnrollmentDashboard) && (
                <div className="rounded-lg border border-slate-700/60 overflow-hidden">
                  {canAccessEnrollment && canAccessEnrollmentDashboard ? <div className="px-3 py-2 text-xs font-bold text-slate-300 bg-slate-800/40">Matrículas</div> : null}
                  {canAccessEnrollment && <button onClick={() => { setActiveTab('enrollment'); setIsMobileMenuOpen(false); }} className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700/50">{canAccessEnrollmentDashboard ? '↳ Matriculas' : 'Matriculas'}</button>}
                  {canAccessEnrollmentDashboard && <button onClick={() => { setActiveTab('enrollmentDashboard'); setIsMobileMenuOpen(false); }} className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700/50">{canAccessEnrollment ? '↳ Dash. Matrículas' : 'Dash. Matrículas'}</button>}
                </div>
              )}
              <div className="rounded-lg border border-slate-700/60 overflow-hidden">
                <div className="px-3 py-2 text-xs font-bold text-slate-300 bg-slate-800/40">Herramientas</div>
                <button onClick={() => { setActiveTab('history'); setIsMobileMenuOpen(false); }} className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700/50">↳ Reportes</button>
                <button onClick={() => { setActiveTab('pagos'); setIsMobileMenuOpen(false); }} className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700/50">↳ Pagos</button>
                <button onClick={() => { setActiveTab('inventario'); setIsMobileMenuOpen(false); }} className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700/50">↳ Inventario</button>
              </div>
              {showPreferencesMenu && (
                <div className="rounded-lg border border-slate-700/60 overflow-hidden">
                  <div className="px-3 py-2 text-xs font-bold text-slate-300 bg-slate-800/40">Preferencias</div>
                  {activeViewMode === 'admin' && <button onClick={() => { setActiveTab('parroquias'); setIsMobileMenuOpen(false); }} className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700/50">↳ Parroquias y diaconías</button>}
                  {canManageScheduleOptions && <button onClick={() => { setActiveTab('horarios'); setIsMobileMenuOpen(false); }} className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700/50">↳ Horarios y salones</button>}
                  {canAccessUserManagement && <button onClick={() => { setActiveTab('admin'); setIsMobileMenuOpen(false); }} className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700/50">↳ Usuarios</button>}
                </div>
              )}
            </div>

            <div className={`pt-3 border-t flex items-center justify-between ${themeMode === 'dark' ? 'border-slate-700' : 'border-slate-200'}`}>
              <div className="flex flex-col text-white">
                <span className="text-xs font-semibold text-white">{userData?.name || user.displayName || user.email}</span>
                <span className="text-[10px] text-slate-200">{user.email}</span>
              </div>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 bg-rose-500/10 text-rose-500 rounded-lg text-xs font-bold"
              >
                Cerrar Sesión
              </button>
            </div>
          </div>
        )}
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className={`theme-content flex-grow max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 ${themeMode === 'dark' ? 'theme-dark' : 'theme-light'}`}>
        
        {isTerritoryPending && (
          <div className="mb-6 bg-amber-500/10 border-2 border-amber-500/40 text-amber-500 rounded-2xl p-4 text-xs sm:text-sm font-semibold flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-3">
              <span className="text-2xl flex-shrink-0">⚠️</span>
              <div>
                <strong className="text-sm font-bold text-amber-400 block mb-0.5">Configuración de ubicación pendiente:</strong>
                Para habilitar las funciones de la app debes asignar tu Parroquia, Diaconía y Teléfono en tus Preferencias (haz clic en tu usuario en el navbar).
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setUserNameDraft(userData?.name || user?.displayName || '');
                setModalParroquiaId(userData?.parroquiaId || '');
                setModalDiaconiaId(userData?.diaconiaId || '');
                setUserPhoneCode(userData?.phoneCode || '+506');
                setUserPhoneNumber(userData?.phoneNumber || '');
                setIsUserNameModalOpen(true);
              }}
              className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-amber-950 font-extrabold px-4 py-2 rounded-xl text-xs shadow transition-colors whitespace-nowrap"
            >
              Configurar Ahora ➔
            </button>
          </div>
        )}

        {isUserUnapproved && !isTerritoryPending && (
          <div className="mb-6 bg-amber-500/10 border-2 border-amber-500/40 text-amber-400 rounded-2xl p-5 text-xs sm:text-sm shadow-lg space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-3xl flex-shrink-0">⏳</span>
              <div className="space-y-1">
                <strong className="text-base font-extrabold text-amber-300 block">
                  Perfil Pendiente de Aprobación
                </strong>
                <p className="text-slate-300 text-xs sm:text-sm">
                  Falta la aprobación del Coordinador o Administrador de la app para que puedas empezar a crear o editar registros en la plataforma.
                </p>
              </div>
            </div>

            {/* Lista de aprobadores asignados según Parroquia y Diaconía */}
            <div className="pt-2 border-t border-amber-500/30 space-y-2">
              <span className="font-bold text-xs text-amber-300 block">
                👥 Usuarios autorizados para aprobar tu perfil en tu Parroquia y Diaconía:
              </span>
              {(() => {
                const approvers = allUsers.filter(u => 
                  u.approved !== false &&
                  u.active !== false &&
                  (
                    u.role === 'admin' || 
                    (u.role === 'coordinadorGeneral' && u.parroquiaId === userData?.parroquiaId) ||
                    (u.role === 'coordinador' && u.diaconiaId === userData?.diaconiaId)
                  )
                );

                if (approvers.length === 0) {
                  return <p className="text-xs italic text-slate-400">No hay coordinadores registrados aún para tu zona.</p>;
                }

                return (
                  <div className="flex flex-wrap gap-2">
                    {approvers.map(appr => (
                      <div key={appr.id} className="bg-slate-800/80 border border-slate-700/60 rounded-xl px-3 py-1.5 font-bold text-xs text-white shadow-sm">
                        {appr.name || 'Coordinador'}
                      </div>
                    ))}
                  </div>
                );
              })()}
              <p className="text-[11px] text-slate-300 pt-1">
                Si ocupas asistencia extra, puedes comunicarte a <a href="mailto:asiscate.elcarmen@gmail.com" className="text-amber-300 font-bold underline">asiscate.elcarmen@gmail.com</a>.
              </p>
            </div>
          </div>
        )}

        {isUserInactive && (
          <div className="mb-6 bg-rose-500/10 border-2 border-rose-500/40 text-rose-400 rounded-2xl p-4 text-xs sm:text-sm font-semibold flex items-center gap-3 shadow-md">
            <span className="text-2xl flex-shrink-0">⛔</span>
            <div>
              <strong className="text-sm font-bold text-rose-300 block mb-0.5">Cuenta Inactiva:</strong>
              Tu usuario ha sido desactivado temporalmente. No puedes realizar modificaciones en la app. Contacta al Coordinador de tu Diaconía para reactivarlo.
            </div>
          </div>
        )}

        {/* PANEL PRINCIPAL (DASHBOARD) */}
        {activeTab === 'dashboard' && (
          <DashboardView
            userData={userData}
            user={user}
            legacyPanelEnabled={legacyPanelEnabled}
            setIsImportModalOpen={setIsImportModalOpen}
            cardBgClass={cardBgClass}
            dashboardPanelOpen={dashboardPanelOpen}
            setDashboardPanelOpen={setDashboardPanelOpen}
            installPromptEvent={installPromptEvent}
            isAppInstalled={isAppInstalled}
            handleInstallApp={handleInstallApp}
            attendanceType={attendanceType}
            setAttendanceType={setAttendanceType}
            dashboardGroupId={dashboardGroupId}
            setDashboardGroupId={setDashboardGroupId}
            dashboardAttendanceType={dashboardAttendanceType}
            setDashboardAttendanceType={setDashboardAttendanceType}
            userRole={userRole}
            visibleGroups={visibleGroups}
            dashboardDate={dashboardDate}
            setDashboardDate={setDashboardDate}
            browserThemeStyle={browserThemeStyle}
            inputBgClass={inputBgClass}
            dashboardDonutStyle={dashboardDonutStyle}
            themeMode={themeMode}
            dashboardAttendanceStats={dashboardAttendanceStats}
            AssistantWidget={AssistantWidget}
            absentRate={absentRate}
            activeViewMode={activeViewMode}
            labelTextClass={labelTextClass}
            attendanceDate={attendanceDate}
            setAttendanceDate={setAttendanceDate}
            setAttendanceLabel={setAttendanceLabel}
            getAttendanceLabel={getAttendanceLabel}
            visibleStudents={visibleStudents}
            selectedGroupId={selectedGroupId}
            attendanceLabel={attendanceLabel}
            attendanceLabelSaveTimeoutRef={attendanceLabelSaveTimeoutRef}
            handleSaveAttendanceLabelForDate={handleSaveAttendanceLabelForDate}
            setSelectedGroupId={setSelectedGroupId}
            handleScanQr={handleScanQr}
            setDeleteDateTarget={setDeleteDateTarget}
            diaconias={diaconias}
            generalDiaconiaId={generalDiaconiaId}
            setGeneralDiaconiaId={setGeneralDiaconiaId}
            getAttendanceStatus={getAttendanceStatus}
            handleMarkAttendance={handleMarkAttendance}
            handleOpenAttendanceMessage={handleOpenAttendanceMessage}
            handleCreateGroup={handleCreateGroup}
            newGroupName={newGroupName}
            setNewGroupName={setNewGroupName}
            newGroupYear={newGroupYear}
            setNewGroupYear={setNewGroupYear}
            newGroupDay={newGroupDay}
            setNewGroupDay={setNewGroupDay}
            newGroupTime={newGroupTime}
            setNewGroupTime={setNewGroupTime}
            newGroupRoom={newGroupRoom}
            setNewGroupRoom={setNewGroupRoom}
            groupScheduleOptions={groupScheduleOptions}
            newGroupParroquia={newGroupParroquia}
            setNewGroupParroquia={setNewGroupParroquia}
            newGroupDiaconia={newGroupDiaconia}
            setNewGroupDiaconia={setNewGroupDiaconia}
            parroquias={parroquias}
            handleAddStudent={handleAddStudent}
            newStudentName={newStudentName}
            setNewStudentName={setNewStudentName}
            newStudentParentEmail={newStudentParentEmail}
            setNewStudentParentEmail={setNewStudentParentEmail}
            selectedGroupForStudent={selectedGroupForStudent}
            setSelectedGroupForStudent={setSelectedGroupForStudent}
          />
        )}

        {activeTab === 'maintenance' && (
          <GroupsView
            setIsImportModalOpen={setIsImportModalOpen}
            cardBgClass={cardBgClass}
            handleCreateGroup={handleCreateGroup}
            newGroupName={newGroupName}
            setNewGroupName={setNewGroupName}
            newGroupLevel={newGroupLevel}
            setNewGroupLevel={setNewGroupLevel}
            levelOptions={levelOptions}
            newGroupYear={newGroupYear}
            setNewGroupYear={setNewGroupYear}
            activeViewMode={activeViewMode}
            newGroupDiaconia={newGroupDiaconia}
            setNewGroupDiaconia={setNewGroupDiaconia}
            diaconias={diaconias}
            userRole={userRole}
            userData={userData}
            newGroupParroquia={newGroupParroquia}
            setNewGroupParroquia={setNewGroupParroquia}
            parroquias={parroquias}
            inputBgClass={inputBgClass}
            handleAddStudent={handleAddStudent}
            newStudentName={newStudentName}
            setNewStudentName={setNewStudentName}
            newStudentParentEmail={newStudentParentEmail}
            setNewStudentParentEmail={setNewStudentParentEmail}
            selectedGroupForStudent={selectedGroupForStudent}
            setSelectedGroupForStudent={setSelectedGroupForStudent}
            visibleGroups={visibleGroups}
            visibleStudents={visibleStudents}
            editingStudentId={editingStudentId}
            setEditingStudentId={setEditingStudentId}
            editStudentName={editStudentName}
            setEditStudentName={setEditStudentName}
            editStudentParentEmail={editStudentParentEmail}
            setEditStudentParentEmail={setEditStudentParentEmail}
            handleSaveStudentEdit={handleSaveStudentEdit}
            groups={groups}
            handleStartEditStudent={handleStartEditStudent}
            handleDeleteStudent={handleDeleteStudent}
          />
        )}

        {activeTab === 'history' && (
          <ReportsView
            cardBgClass={cardBgClass}
            selectedGroupId={selectedGroupId}
            setSelectedGroupId={setSelectedGroupId}
            setReportStudentIds={setReportStudentIds}
            visibleStudents={visibleStudents}
            visibleGroups={visibleGroups}
            activeViewMode={activeViewMode}
            handleDeleteOrphanedAttendance={handleDeleteOrphanedAttendance}
            reportSubTab={reportSubTab}
            setReportSubTab={setReportSubTab}
            reportFilters={reportFilters}
            setReportFilters={setReportFilters}
            inputBgClass={inputBgClass}
            reportAttendanceType={reportAttendanceType}
            setReportAttendanceType={setReportAttendanceType}
            handleExportAttendanceToExcel={handleExportAttendanceToExcel}
            handleExportAttendanceToPdf={handleExportAttendanceToPdf}
            getAttendanceReportView={getAttendanceReportView}
            themeMode={themeMode}
            getAttendanceDisplayTypeForDate={getAttendanceDisplayTypeForDate}
            getAttendanceLabel={getAttendanceLabel}
            attendanceDateEditor={attendanceDateEditor}
            setAttendanceDateEditor={setAttendanceDateEditor}
            handleUpdateAttendanceDate={handleUpdateAttendanceDate}
            reportStudentIds={reportStudentIds}
            getAttendanceStatus={getAttendanceStatus}
            handleMarkAttendance={handleMarkAttendance}
            attendanceLabel={attendanceLabel}
            getGroupStatistics={getGroupStatistics}
            getFilteredReportAttendance={getFilteredReportAttendance}
            issuedCertificates={issuedCertificates}
            generatedCertificates={generatedCertificates}
            levelCertificateHistory={levelCertificateHistory}
            attendanceLetterHistory={attendanceLetterHistory}
            certificateSearchType={certificateSearchType}
            setCertificateSearchType={setCertificateSearchType}
            certificateSearch={certificateSearch}
            certificateFilters={certificateFilters}
            levelCertificateFilters={levelCertificateFilters}
            certificatePageSize={certificatePageSize}
            certificatePage={certificatePage}
            setCertificatePage={setCertificatePage}
            userRole={userRole}
            certificateGenerationOpen={certificateGenerationOpen}
            setCertificateGenerationOpen={setCertificateGenerationOpen}
            certificateGenerationType={certificateGenerationType}
            setCertificateGenerationType={setCertificateGenerationType}
            certificateLetterDate={certificateLetterDate}
            setCertificateLetterDate={setCertificateLetterDate}
            selectedCertificateIds={selectedCertificateIds}
            setSelectedCertificateIds={setSelectedCertificateIds}
            handleExportSelectedCertificatesZip={handleExportSelectedCertificatesZip}
            handleGenerateSelectedCertificate={handleGenerateSelectedCertificate}
            certificateSearchOpen={certificateSearchOpen}
            setCertificateSearchOpen={setCertificateSearchOpen}
            setCertificateSearch={setCertificateSearch}
            setLevelCertificateFilters={setLevelCertificateFilters}
            levelOptions={levelOptions}
            groups={groups}
            setCertificateFilters={setCertificateFilters}
            handleScanCertificateQr={handleScanCertificateQr}
            setCertificatePageSize={setCertificatePageSize}
            handleGenerateLevelCertificate={handleGenerateLevelCertificate}
            handleGenerateAttendanceLetter={handleGenerateAttendanceLetter}
            setAttendanceLetterHistory={setAttendanceLetterHistory}
            handleDeleteLevelCertificate={handleDeleteLevelCertificate}
            handleDeleteCertificate={handleDeleteCertificate}
          />
        )}
        {activeTab === 'inventario' && (
          <InventoryView
            cardBgClass={cardBgClass}
            activeViewMode={activeViewMode}
            handleExportInventoryPdf={handleExportInventoryPdf}
            inventoryDateFilters={inventoryDateFilters}
            setInventoryDateFilters={setInventoryDateFilters}
            inputBgClass={inputBgClass}
            inventoryShowDateSummary={inventoryShowDateSummary}
            setInventoryShowDateSummary={setInventoryShowDateSummary}
            inventoryDateFilteredItems={inventoryDateFilteredItems}
            handleAddInventoryItem={handleAddInventoryItem}
            inventoryForm={inventoryForm}
            setInventoryForm={setInventoryForm}
            editingInventoryItemId={editingInventoryItemId}
            resetInventoryEditors={resetInventoryEditors}
            visibleInventoryItems={visibleInventoryItems}
            currentUserKey={currentUserKey}
            startInventoryItemEdit={startInventoryItemEdit}
            handleInventoryStockChange={handleInventoryStockChange}
            handleDeleteInventoryItem={handleDeleteInventoryItem}
            handleDeleteAllInventoryItems={handleDeleteAllInventoryItems}
            handleAddInventoryReservation={handleAddInventoryReservation}
            inventoryReservationForm={inventoryReservationForm}
            setInventoryReservationForm={setInventoryReservationForm}
            editingInventoryReservationId={editingInventoryReservationId}
            displayInventoryAssets={displayInventoryAssets}
            getInventorySlotAvailability={getInventorySlotAvailability}
            getReservationAssetConfig={getReservationAssetConfig}
            setEditingInventoryReservationId={setEditingInventoryReservationId}
            inventoryReservations={inventoryReservations}
            visibleInventoryReservations={visibleInventoryReservations}
            startInventoryReservationEdit={startInventoryReservationEdit}
            handleDeleteInventoryReservation={handleDeleteInventoryReservation}
            handleAddInventoryAsset={handleAddInventoryAsset}
            inventoryAssetForm={inventoryAssetForm}
            setInventoryAssetForm={setInventoryAssetForm}
            editingInventoryAssetId={editingInventoryAssetId}
            setEditingInventoryAssetId={setEditingInventoryAssetId}
            startInventoryAssetEdit={startInventoryAssetEdit}
            handleInventoryAssetStockChange={handleInventoryAssetStockChange}
            handleDeleteInventoryAsset={handleDeleteInventoryAsset}
            groupScheduleOptions={groupScheduleOptionsByDiaconia[effectiveDiaconiaId] || groupScheduleOptions}
          />
        )}

        {activeTab === 'pagos' && (
          <PaymentsView
            cardBgClass={cardBgClass}
            showGroupPaymentTracker={showGroupPaymentTracker}
            setShowGroupPaymentTracker={setShowGroupPaymentTracker}
            totalCollected={totalCollected}
            visiblePaymentRecords={visiblePaymentRecords}
            trackerGroupId={trackerGroupId}
            setTrackerGroupId={setTrackerGroupId}
            inputBgClass={inputBgClass}
            visibleGroups={visibleGroups}
            visibleStudents={visibleStudents}
            setPaymentFilters={setPaymentFilters}
            setPaymentCurrentPage={setPaymentCurrentPage}
            setPaymentForm={setPaymentForm}
            handleAddPaymentRecord={handleAddPaymentRecord}
            paymentForm={paymentForm}
            students={students}
            handleScanPaymentQr={handleScanPaymentQr}
            paymentFilters={paymentFilters}
            filteredPaymentRecords={filteredPaymentRecords}
            paginatedPaymentRecords={paginatedPaymentRecords}
            handleViewPaymentQr={handleViewPaymentQr}
            handleGeneratePaymentProofPdf={handleGeneratePaymentProofPdf}
            handlePrintPaymentReceipt={handlePrintPaymentReceipt}
            handleDeletePaymentRecord={handleDeletePaymentRecord}
            paymentPageSize={paymentPageSize}
            paymentCurrentPage={paymentCurrentPage}
            paymentTotalPages={paymentTotalPages}
          />
        )}
        {activeTab === 'enrollmentDashboard' && (
          <EnrollmentDashboardView
            currentUser={{ ...(userData || user), parroquiaId: effectiveParroquiaId, diaconiaId: effectiveDiaconiaId }}
            userRole={userRole}
            cardBgClass={cardBgClass}
            inputBgClass={inputBgClass}
            isEnrollmentEnabled={isEnrollmentEnabled}
            setIsEnrollmentEnabled={setIsEnrollmentEnabled}
            students={visibleStudents}
            paymentRecords={visiblePaymentRecords}
            groups={visibleGroups}
            parroquias={parroquias}
            diaconias={diaconias}
            setGroups={setGroups}
            setStudents={setStudents}
            handleDeleteStudent={handleDeleteStudent}
            handleStartEditStudent={handleStartEditStudent}
            allUsers={allUsers}
            fetchAllData={fetchAllData}
            groupScheduleOptions={groupScheduleOptions}
          />
        )}
        {activeTab === 'enrollment' && (
          (isEnrollmentEnabled && userData?.canEnroll !== false) ? (
            <EnrollmentView
              currentUser={{ ...(userData || user), parroquiaId: effectiveParroquiaId, diaconiaId: effectiveDiaconiaId }}
              parroquias={parroquias}
              diaconias={diaconias}
              groups={groups}
              paymentRecords={paymentRecords}
              setPaymentRecords={setPaymentRecords}
              handlePrintPaymentReceipt={handlePrintPaymentReceipt}
              handleGeneratePaymentProofPdf={handleGeneratePaymentProofPdf}
              handleViewPaymentQr={handleViewPaymentQr}
              onNavigate={(tab) => setActiveTab(tab)}
              cardBgClass={cardBgClass}
              inputBgClass={inputBgClass}
              themeMode={themeMode}
            />
          ) : (
            <div className={`${cardBgClass} p-8 rounded-2xl border border-slate-700 text-center space-y-3`}>
              <div className="text-4xl">🔒</div>
              <h3 className="text-xl font-bold text-white">Módulo de Matrículas Deshabilitado</h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                El período de matrículas digitales se encuentra cerrado temporalmente por la coordinación.
              </p>
            </div>
          )
        )}
        {activeTab === 'groups' && (
          <GroupsView
            setIsImportModalOpen={setIsImportModalOpen}
            cardBgClass={cardBgClass}
            handleCreateGroup={handleCreateGroup}
            newGroupName={newGroupName}
            setNewGroupName={setNewGroupName}
            newGroupLevel={newGroupLevel}
            setNewGroupLevel={setNewGroupLevel}
            levelOptions={levelOptions}
            newGroupYear={newGroupYear}
            setNewGroupYear={setNewGroupYear}
            activeViewMode={activeViewMode}
            newGroupDiaconia={newGroupDiaconia}
            setNewGroupDiaconia={setNewGroupDiaconia}
            diaconias={diaconias}
            userRole={userRole}
            userData={userData}
            newGroupParroquia={newGroupParroquia}
            setNewGroupParroquia={setNewGroupParroquia}
            parroquias={parroquias}
            inputBgClass={inputBgClass}
            handleAddStudent={handleAddStudent}
            newStudentName={newStudentName}
            setNewStudentName={setNewStudentName}
            newStudentParentEmail={newStudentParentEmail}
            setNewStudentParentEmail={setNewStudentParentEmail}
            selectedGroupForStudent={selectedGroupForStudent}
            setSelectedGroupForStudent={setSelectedGroupForStudent}
            visibleGroups={visibleGroups}
            visibleStudents={visibleStudents}
            editingStudentId={editingStudentId}
            setEditingStudentId={setEditingStudentId}
            editStudentName={editStudentName}
            setEditStudentName={setEditStudentName}
            editStudentParentEmail={editStudentParentEmail}
            setEditStudentParentEmail={setEditStudentParentEmail}
            handleSaveStudentEdit={handleSaveStudentEdit}
            groups={groups}
            handleStartEditStudent={handleStartEditStudent}
            handleDeleteStudent={handleDeleteStudent}
            setStudents={setStudents}
            setIsCreateGroupModalOpen={setIsCreateGroupModalOpen}
            editingGroupId={editingGroupId}
            setEditingGroupId={setEditingGroupId}
            editGroupName={editGroupName}
            setEditGroupName={setEditGroupName}
            editGroupLevel={editGroupLevel}
            setEditGroupLevel={setEditGroupLevel}
            editGroupYear={editGroupYear}
            setEditGroupYear={setEditGroupYear}
            editGroupDay={editGroupDay}
            setEditGroupDay={setEditGroupDay}
            editGroupTime={editGroupTime}
            setEditGroupTime={setEditGroupTime}
            editGroupRoom={editGroupRoom}
            setEditGroupRoom={setEditGroupRoom}
            groupScheduleOptions={groupScheduleOptions}
            editGroupCatechists={editGroupCatechists}
            setEditGroupCatechists={setEditGroupCatechists}
            editGroupVisibleForCatechists={editGroupVisibleForCatechists}
            setEditGroupVisibleForCatechists={setEditGroupVisibleForCatechists}
            allUsers={allUsers}
            handleStartEditGroup={handleStartEditGroup}
            handleSaveGroupEdit={handleSaveGroupEdit}
            handleDeleteGroup={handleDeleteGroup}
            handleDuplicateGroup={handleDuplicateGroup}
            handleOpenMaintenanceModal={handleOpenMaintenanceModal}
            handleExportGroupSchedulePdf={handleExportGroupSchedulePdf}
            handleExportGroupScheduleImage={handleOpenSchedulePreview}
            themeMode={themeMode}
          />
        )}

        {/* PARROQUIAS Y DIACONÍAS */}
        {activeTab === 'parroquias' && activeViewMode === 'admin' && (
          <div className="space-y-6">
            <h2 className="text-xl sm:text-2xl font-bold">Administración de Parroquias y Diaconías</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Crear Parroquia */}
              <div className={`${cardBgClass} p-6 rounded-xl border shadow-sm space-y-4`}>
                <h3 className="text-lg font-bold">Añadir Parroquia</h3>
                <form onSubmit={handleCreateParroquia} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Nombre Parroquia"
                    value={newParroquiaName}
                    onChange={(e) => setNewParroquiaName(e.target.value)}
                    className={`flex-grow rounded-lg px-4 py-2 text-xs sm:text-sm ${inputBgClass}`}
                  />
                  <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-lg text-xs">
                    Guardar
                  </button>
                </form>

                <div className="space-y-2 pt-2">
                  <p className="text-xs font-bold text-slate-400 uppercase">Parroquias Existentes</p>
                  <div className="divide-y divide-slate-700 max-h-60 overflow-y-auto">
                    {parroquias.map(p => (
                      <div key={p.id} className="py-2 text-sm font-semibold flex justify-between items-center gap-2">
                        <span>{p.name}</span><button type="button" onClick={async () => { const name = window.prompt('Nuevo nombre de la parroquia', p.name); if (name?.trim()) { await updateDoc(doc(db, 'parroquias', p.id), { name: name.trim() }); await fetchAllData(); } }} className="rounded bg-slate-700 px-2 py-1 text-[10px] text-white">Editar</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Crear Diaconía */}
              <div className={`${cardBgClass} p-6 rounded-xl border shadow-sm space-y-4`}>
                <h3 className="text-lg font-bold">Añadir Diaconía</h3>
                <form onSubmit={handleCreateDiaconia} className="space-y-3">
                  <select
                    value={selectedParroquiaForDiaconia}
                    onChange={(e) => setSelectedParroquiaForDiaconia(e.target.value)}
                    className={`w-full rounded-lg px-4 py-2 text-xs sm:text-sm ${inputBgClass}`}
                  >
                    <option value="">Selecciona Parroquia Perteneciente...</option>
                    {parroquias.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Nombre de la Diaconía"
                      value={newDiaconiaName}
                      onChange={(e) => setNewDiaconiaName(e.target.value)}
                      className={`flex-grow rounded-lg px-4 py-2 text-xs sm:text-sm ${inputBgClass}`}
                    />
                    <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-lg text-xs">
                      Guardar
                    </button>
                  </div>
                </form>

                <div className="space-y-2 pt-2">
                  <p className="text-xs font-bold text-slate-400 uppercase">Diaconías Existentes</p>
                  <div className="divide-y divide-slate-700 max-h-60 overflow-y-auto">
                    {diaconias.map(d => {
                      const par = parroquias.find(p => p.id === d.parroquiaId);
                      return (
                        <div key={d.id} className="py-2 text-xs flex justify-between items-center gap-2">
                          <span className="font-semibold">{d.name}</span>
                          <span className="text-slate-500">({par?.name || 'Sin Parroquia'})</span><span className="flex gap-1"><button type="button" onClick={async () => { const name = window.prompt('Nuevo nombre de la diaconía', d.name); if (name?.trim()) { await updateDoc(doc(db, 'diaconias', d.id), { name: name.trim() }); await fetchAllData(); } }} className="rounded bg-slate-700 px-2 py-1 text-[10px] text-white">Editar</button><button type="button" onClick={async () => { if (window.confirm('¿Eliminar esta diaconía?')) { await deleteDoc(doc(db, 'diaconias', d.id)); await fetchAllData(); } }} className="rounded bg-rose-700 px-2 py-1 text-[10px] text-white">Eliminar</button></span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* MANTENIMIENTO DE HORARIOS Y SALONES POR DIACONÍA */}
        {activeTab === 'horarios' && canManageScheduleOptions && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold">Mantenimiento de horarios y salones</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Configura las opciones disponibles para los grupos de la diaconía seleccionada.</p>
            </div>
            <div className={`${cardBgClass} rounded-xl border shadow-sm p-6 space-y-5`}>
              <div className="rounded-lg border border-sky-300/40 bg-sky-500/10 px-4 py-3 text-sm">
                <span className="font-bold">Diaconía activa: </span>
                {diaconias.find(item => item.id === effectiveDiaconiaId)?.name || 'Selecciona una diaconía en el navbar'}
              </div>
              <div className="space-y-4">
                {[
                  { field: 'days', label: 'Día disponible', placeholder: 'Selecciona un día' },
                  { field: 'times', label: 'Horarios disponibles', placeholder: 'Ej: 08:00-10:00' },
                  { field: 'rooms', label: 'Salones disponibles', placeholder: 'Ej: Salón principal' }
                ].map(({ field, label, placeholder }) => (
                  <div key={field}>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">{label}</label>
                    <div className="flex gap-2">
                      {field === 'days' ? (
                        <select value={scheduleOptionInputs[field]} onChange={event => setScheduleOptionInputs(previous => ({ ...previous, [field]: event.target.value }))} className={`flex-1 rounded-lg px-4 py-2 text-sm ${inputBgClass}`}>
                          <option value="">{placeholder}</option>
                          {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map(day => <option key={day} value={day}>{day}</option>)}
                        </select>
                      ) : (
                        <input value={scheduleOptionInputs[field]} onChange={event => setScheduleOptionInputs(previous => ({ ...previous, [field]: event.target.value }))} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); editingScheduleOption?.field === field ? saveScheduleOptionEdit(field) : addScheduleOption(field); } }} placeholder={placeholder} className={`flex-1 rounded-lg px-4 py-2 text-sm ${inputBgClass}`} />
                      )}
                      <button type="button" onClick={() => editingScheduleOption?.field === field ? saveScheduleOptionEdit(field) : addScheduleOption(field)} className="rounded-lg bg-sky-600 hover:bg-sky-700 px-4 py-2 text-xs font-bold text-white">{editingScheduleOption?.field === field ? 'Guardar' : 'Agregar'}</button>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {(scheduleOptionsDraft[field] || []).map((option, optionIndex) => (
                        <span key={option} onClick={() => startScheduleOptionEdit(field, optionIndex, option)} className={`inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 text-xs ${editingScheduleOption?.field === field && editingScheduleOption.index === optionIndex ? 'border-sky-500 bg-sky-500/10' : 'border-slate-300 dark:border-slate-600'}`} title="Toca para editar">
                          {option}
                          <button type="button" onClick={(event) => { event.stopPropagation(); removeScheduleOption(field, option); }} className="font-bold text-rose-500" aria-label={`Eliminar ${option}`}>×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* USUARIOS Y ROLES */}
        {activeTab === 'admin' && (activeViewMode === 'admin' || activeViewMode === 'coordinador' || activeViewMode === 'coordinadorGeneral') && (
          <UserManagementView
            cardBgClass={cardBgClass}
            activeViewMode={activeViewMode}
            managedUsers={managedUsers}
            themeMode={themeMode}
            userRole={userRole}
            user={user}
            inputBgClass={inputBgClass}
            handleChangeRole={handleChangeRole}
            handleUpdateUserTerritory={handleUpdateUserTerritory}
            parroquias={parroquias}
            diaconias={diaconias}
            handleApproveUser={handleApproveUser}
            handleToggleActiveUser={handleToggleActiveUser}
            handleDeleteUser={handleDeleteUser}
            handleAddAllowedEmail={handleAddAllowedEmail}
            newAllowedEmailInput={newAllowedEmailInput}
            setNewAllowedEmailInput={setNewAllowedEmailInput}
            allowedEmails={allowedEmails}
            handleDeleteAllowedEmail={handleDeleteAllowedEmail}
          />
        )}

      </main>

      {isSchedulePreviewOpen && schedulePreviewHtml && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className={`${cardBgClass} flex max-h-[92vh] w-full max-w-6xl flex-col rounded-2xl border shadow-2xl`}>
            <div className="flex items-center justify-between border-b border-slate-300 dark:border-slate-700 px-5 py-4">
              <div>
                <h2 className="text-lg font-bold">Horario de grupos</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Vista previa del horario por salón y hora</p>
              </div>
              <button type="button" onClick={() => setIsSchedulePreviewOpen(false)} aria-label="Cerrar" className="rounded-lg bg-rose-700 px-3 py-1.5 text-lg font-bold leading-none text-white hover:bg-rose-800">✕</button>
            </div>
            <div className="flex-1 overflow-auto bg-white p-3">
              <iframe title="Vista previa del horario" srcDoc={schedulePreviewHtml} className="mx-auto h-[70vh] w-full min-w-[720px] border-0" />
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-300 dark:border-slate-700 px-5 py-4">
              <button type="button" onClick={handleDownloadSchedulePng} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700">🖼️ Descargar imagen PNG</button>
              <button type="button" onClick={handleExportGroupSchedulePdf} className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700">📄 Descargar PDF</button>
              <button type="button" onClick={handleCopySchedulePng} className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-700">📋 Copiar imagen PNG</button>
            </div>
          </div>
        </div>
      )}

      {isUserNameModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className={`${cardBgClass} rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Preferencias</h3>
              <button onClick={() => setIsUserNameModalOpen(false)} aria-label="Cerrar" className="rounded-lg bg-rose-700 px-2.5 py-1 text-lg font-bold leading-none text-white hover:bg-rose-800">✕</button>
            </div>

            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-slate-400 uppercase">Color del navbar</label>
                  <button
                    type="button"
                    onClick={handleResetNavbarColor}
                    className="text-xs text-sky-400 hover:text-sky-300 font-medium underline"
                  >
                    Restablecer color original
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={isAllowedNavbarColor(navbarColor) ? navbarColor : '#7f1d1d'}
                    onChange={(event) => handleNavbarColorChange(event.target.value)}
                    className="w-16 h-12 rounded-lg border border-slate-600 cursor-pointer bg-transparent"
                    aria-label="Seleccionar color del navbar"
                  />
                  <div
                    className="flex-1 h-12 rounded-lg border border-slate-700 flex items-center px-4 font-mono text-xs text-white"
                    style={{ backgroundColor: navbarColor }}
                  >
                    {navbarColor.toUpperCase()} (Vista previa)
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-slate-400 uppercase">Nombre de usuario</label>
                  <button
                    type="button"
                    onClick={handleResetUserName}
                    className="text-xs text-sky-400 hover:text-sky-300 font-medium underline"
                  >
                    Restablecer nombre original
                  </button>
                </div>
                <input
                  value={userNameDraft}
                  onChange={(event) => setUserNameDraft(event.target.value)}
                  className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`}
                  placeholder="Escribe tu nombre"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-slate-400 uppercase">Ubicación Parroquial *</label>
                  {userData?.role === 'catequista' && (
                    <span className="text-[10px] text-amber-400 font-semibold">🔒 Modificable por Coordinador</span>
                  )}
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Parroquia</label>
                    <select
                      disabled={userData?.role === 'catequista'}
                      value={modalParroquiaId}
                      onChange={(e) => {
                        setModalParroquiaId(e.target.value);
                        setModalDiaconiaId('');
                      }}
                      className={`w-full rounded-lg px-3 py-2 text-xs sm:text-sm ${inputBgClass} ${userData?.role === 'catequista' ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <option value="">Selecciona tu Parroquia...</option>
                      {parroquias.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Diaconía</label>
                    <select
                      disabled={userData?.role === 'catequista' || !modalParroquiaId}
                      value={modalDiaconiaId}
                      onChange={(e) => setModalDiaconiaId(e.target.value)}
                      className={`w-full rounded-lg px-3 py-2 text-xs sm:text-sm ${inputBgClass} ${userData?.role === 'catequista' ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <option value="">Selecciona tu Diaconía...</option>
                      {diaconias
                        .filter(d => d.parroquiaId === modalParroquiaId)
                        .map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
                  Número Telefónico *
                </label>
                <div className="flex gap-2">
                  <CountryCodeSelect
                    value={userPhoneCode}
                    onChange={(code) => setUserPhoneCode(code)}
                    className={inputBgClass}
                  />
                  <input
                    type="tel"
                    value={userPhoneNumber}
                    onChange={(e) => setUserPhoneNumber(e.target.value)}
                    placeholder="88888888"
                    className={`w-3/5 rounded-lg px-3 py-2 text-xs sm:text-sm ${inputBgClass}`}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  {COUNTRY_CODES.find(c => c.code === userPhoneCode)?.digits
                    ? `Formato requerido para ${userPhoneCode}: exactamente ${COUNTRY_CODES.find(c => c.code === userPhoneCode)?.digits} dígitos.`
                    : 'Ingresa de 7 a 15 dígitos según tu país.'}
                </p>
              </div>
            </div>

            <div className="mt-5 flex gap-2 justify-end">
              <button type="button" onClick={() => setIsUserNameModalOpen(false)} className="px-3 py-2 rounded-lg bg-slate-700 text-white text-xs font-bold">Cancelar</button>
              <button type="button" onClick={handleSaveUserName} className="px-3 py-2 rounded-lg bg-red-800 hover:bg-red-900 text-white text-xs font-bold">Guardar</button>
            </div>
          </div>
        </div>
      )}

      <footer 
        className="py-4 text-center text-xs font-medium text-white transition-colors"
        style={{ backgroundColor: navbarColor }}
      >
        &copy; Derechos Reservados - AsisCate {new Date().getFullYear()}
      </footer>

      {/* MODAL SELECCIÓN DE CONFIGURACIÓN INICIAL */}
      {user && userData && (!userData.parroquiaId || !userData.diaconiaId || !userData.phoneNumber) && !isTerritoryModalSkipped && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-50 flex justify-center items-center p-4">
          <div className={`${cardBgClass} rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 border`}>
            <div className="text-center space-y-2">
              <div className="flex justify-center mb-2">
                <AsisCateLogo className="w-12 h-12" />
              </div>
              <h3 className="text-xl font-extrabold">Configuración Inicial</h3>
              <p className="text-xs text-slate-400">
                Hola <span className="font-semibold text-slate-200">{userData?.name || user.displayName}</span>, para poder operar en la plataforma debes seleccionar tu parroquia y diaconía asignadas, así como tu número de teléfono.
              </p>
            </div>

            <form onSubmit={handleSaveInitialTerritory} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                  Parroquia *
                </label>
                <select
                  required
                  value={modalParroquiaId}
                  onChange={(e) => {
                    setModalParroquiaId(e.target.value);
                    setModalDiaconiaId('');
                  }}
                  className={`w-full rounded-lg px-3 py-2 text-xs sm:text-sm ${inputBgClass}`}
                >
                  <option value="">Selecciona tu Parroquia...</option>
                  {parroquias.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                  Diaconía *
                </label>
                <select
                  required
                  disabled={!modalParroquiaId}
                  value={modalDiaconiaId}
                  onChange={(e) => setModalDiaconiaId(e.target.value)}
                  className={`w-full rounded-lg px-3 py-2 text-xs sm:text-sm ${inputBgClass}`}
                >
                  <option value="">Selecciona tu Diaconía...</option>
                  {diaconias
                    .filter(d => d.parroquiaId === modalParroquiaId)
                    .map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">
                  Número Telefónico *
                </label>
                <div className="flex gap-2">
                  <CountryCodeSelect
                    value={userPhoneCode}
                    onChange={(code) => setUserPhoneCode(code)}
                    className={inputBgClass}
                  />
                  <input
                    type="tel"
                    required
                    value={userPhoneNumber}
                    onChange={(e) => setUserPhoneNumber(e.target.value)}
                    placeholder="88888888"
                    className={`w-3/5 rounded-lg px-3 py-2 text-xs sm:text-sm ${inputBgClass}`}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  {COUNTRY_CODES.find(c => c.code === userPhoneCode)?.digits
                    ? `Formato para ${userPhoneCode}: exactamente ${COUNTRY_CODES.find(c => c.code === userPhoneCode)?.digits} dígitos.`
                    : 'Ingresa de 7 a 15 dígitos según tu país.'}
                </p>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-amber-500 text-xs flex gap-2.5 items-start">
                <span className="text-base leading-none">⚠️</span>
                <div>
                  <span className="font-bold block mb-0.5">Advertencia importante:</span>
                  Puedes omitir esta pantalla por ahora, pero la app estará bloqueada para crear o modificar registros hasta que configures tu ubicación en las Preferencias.
                </div>
              </div>

              <div className="pt-2 space-y-2">
                <button
                  type="submit"
                  disabled={!modalParroquiaId || !modalDiaconiaId || savingTerritory}
                  className="w-full bg-red-800 hover:bg-red-900 disabled:bg-slate-700 text-white font-bold py-2.5 rounded-lg text-xs sm:text-sm transition-colors shadow-md"
                >
                  {savingTerritory ? "Guardando..." : "Guardar y Continuar"}
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsTerritoryModalSkipped(true)}
                    className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold py-2 rounded-lg text-xs transition-colors"
                  >
                    Omitir por ahora
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex-1 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-200 font-semibold py-2 rounded-lg text-xs transition-colors"
                  >
                    Cerrar Sesión
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <MaintenanceModal
        maintenanceGroup={maintenanceGroup}
        setMaintenanceGroup={setMaintenanceGroup}
        maintenanceMode={maintenanceMode}
        setMaintenanceMode={setMaintenanceMode}
        handleCloseMaintenanceModal={handleCloseMaintenanceModal}
        handleExportGroupRosterToPdf={handleExportGroupRosterToPdf}
        handleExportGroupRosterToExcel={handleExportGroupRosterToExcel}
        visibleStudents={visibleStudents}
        handleGenerateStudentQr={handleGenerateStudentQr}
        handleStartEditStudent={handleStartEditStudent}
        handleOpenStudentReadOnly={handleOpenStudentReadOnly}
        handleDeleteStudent={handleDeleteStudent}
        setSelectedGroupForStudent={setSelectedGroupForStudent}
        setNewStudentName={setNewStudentName}
        setNewStudentParentEmail={setNewStudentParentEmail}
        setNewStudentParentPhone={setNewStudentParentPhone}
        isAddStudentFormOpen={isAddStudentFormOpen}
        setIsAddStudentFormOpen={setIsAddStudentFormOpen}
        handleAddStudent={handleAddStudent}
        newStudentName={newStudentName}
        newStudentParentEmail={newStudentParentEmail}
        newStudentParentPhone={newStudentParentPhone}
        cardBgClass={cardBgClass}
        inputBgClass={inputBgClass}
        buildWhatsAppLink={buildWhatsAppLink}
        themeMode={themeMode}
      />

      {messageModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[60] flex justify-center items-center p-4">
          <div className={`${cardBgClass} rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4`}>
            <div className="flex justify-between items-start gap-3">
              <div>
                <h3 className="text-lg font-bold">Mensaje para {messageModal.student.fullName || messageModal.student.name}</h3>
                <p className="text-xs text-slate-400">Puedes copiarlo o enviarlo directamente por el canal seleccionado.</p>
              </div>
              <button onClick={() => setMessageModal(null)} className="bg-red-900 text-white px-3 py-1.5 rounded-lg text-xs font-bold">Cancelar</button>
            </div>
            <textarea readOnly value={messageModal.message} rows="9" className={`w-full rounded-lg px-3 py-2 text-sm resize-none ${inputBgClass}`} />
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={() => navigator.clipboard.writeText(messageModal.message)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold">Copiar mensaje</button>
              {messageModal.channel === 'email' && (
                <button
                  type="button"
                  onClick={handleSendAttendanceEmail}
                  disabled={isSendingAttendanceEmail}
                  className="bg-sky-600 hover:bg-sky-700 disabled:bg-slate-700 text-white px-4 py-2 rounded-lg text-xs font-bold"
                >
                  {isSendingAttendanceEmail ? 'Enviando...' : 'Enviar correo'}
                </button>
              )}
              {messageModal.channel === 'phone' && <a href={buildWhatsAppLink(messageModal.student.parentPhone, messageModal.message)} target="_blank" rel="noreferrer" className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-xs font-bold">Abrir WhatsApp</a>}
            </div>
          </div>
        </div>
      )}

      {paymentProofModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[60] flex justify-center items-center p-3">
          <div className={`${cardBgClass} rounded-2xl w-full max-w-sm flex flex-col shadow-2xl`} style={{ height: 'min(900px, calc(100dvh - 24px))' }}>
            <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
              <h3 className="text-sm font-bold truncate pr-2">{paymentProofModal.title}</h3>
              <button type="button" onClick={() => setPaymentProofModal(null)} aria-label="Cerrar" className="bg-rose-700 hover:bg-rose-800 text-white px-2.5 py-1 rounded-lg text-lg font-bold leading-none shrink-0">✕</button>
            </div>

            <div className="flex justify-center items-center flex-1 min-h-0 overflow-hidden px-3 pb-2">
              <img
                src={paymentProofModal.imageUrl}
                alt="Comprobante de pago"
                className="rounded-lg border border-slate-700 bg-white shadow-lg"
                style={{ maxWidth: '100%', maxHeight: 'calc(100dvh - 150px)', width: 'auto', height: 'auto', objectFit: 'contain', display: 'block' }}
              />
            </div>

            <div className="flex gap-2 px-4 pb-4 pt-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const a = document.createElement('a');
                  a.href = paymentProofModal.imageUrl;
                  a.download = `Comprobante_${String(paymentProofModal.record?.receiptNumber || paymentProofModal.record?.id || 'pago').replace(/\D/g, '').slice(-6) || 'pago'}.png`;
                  a.click();
                }}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-center px-4 py-2 rounded-lg text-xs font-bold transition"
              >
                Descargar imagen
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const res = await fetch(paymentProofModal.imageUrl);
                    const blob = await res.blob();
                    await navigator.clipboard.write([
                      new ClipboardItem({ [blob.type]: blob })
                    ]);
                    alert('¡Imagen del comprobante copiada al portapapeles!');
                  } catch (err) {
                    console.error('Error al copiar imagen:', err);
                    alert('No se pudo copiar la imagen automáticamente.');
                  }
                }}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-xs font-bold transition"
              >
                Copiar imagen
              </button>
            </div>
          </div>
        </div>
      )}

      <QrModal
        qrModal={qrModal}
        setQrModal={setQrModal}
        qrCardLoading={qrCardLoading}
        setQrCardLoading={setQrCardLoading}
        qrCardRef={qrCardRef}
        handleCopyQrCardImage={handleCopyQrCardImage}
        cardBgClass={cardBgClass}
      />

      <ScannerModal
        scannerModal={scannerModal}
        setScannerModal={setScannerModal}
        videoRef={videoRef}
        cardBgClass={cardBgClass}
      />

      {deleteDateTarget && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[80] flex justify-center items-center p-4">
          <div className={`${cardBgClass} rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4`}>
            <div>
              <h3 className="text-lg font-bold">Confirmar eliminación</h3>
              <p className="text-sm text-slate-400 mt-2">
                ¿Deseas borrar todos los registros de {deleteDateTarget.type === 'misa' ? 'Misa' : 'Encuentro'} del día {deleteDateTarget.dateStr} para este grupo?
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteDateTarget(null)} className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-xs font-bold">Cancelar</button>
              <button type="button" onClick={confirmDeleteAttendanceDate} className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg text-xs font-bold">Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IMPORTAR O AÑADIR Catequizandos */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className={`${cardBgClass} rounded-2xl max-w-xl w-full p-4 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto`}>
            <div className="flex justify-between items-center border-b border-slate-700 pb-3">
              <h3 className="text-lg sm:text-xl font-bold">Gestión de Catequizandos</h3>
              <button onClick={() => { setIsImportModalOpen(false); setExcelPreview([]); }} className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1">✕</button>
            </div>

            {/* SECCIÓN 1: AÑADIR MANUALMENTE */}
            <div className="border border-slate-700/60 rounded-xl p-4 space-y-3 bg-slate-800/20">
              <h4 className="text-sm font-bold text-red-800 dark:text-red-400">Añadir Catequizando Manualmente</h4>
              <form onSubmit={handleAddStudent} className="space-y-3">
                <input
                  required
                  value={newStudentName}
                  onChange={event => setNewStudentName(event.target.value)}
                  placeholder="Nombre completo"
                  className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`}
                />
                <input
                  type="email"
                  value={newStudentParentEmail}
                  onChange={event => setNewStudentParentEmail(event.target.value)}
                  placeholder="Correo del encargado (opcional)"
                  className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`}
                />
                <select
                  required
                  value={selectedGroupForStudent}
                  onChange={event => setSelectedGroupForStudent(event.target.value)}
                  className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`}
                >
                  <option value="">Selecciona el grupo...</option>
                  {visibleGroups.map(group => (
                    <option key={group.id} value={group.id}>{group.name} ({group.year || '2026-2027'})</option>
                  ))}
                </select>
                <button type="submit" className="w-full bg-red-800 hover:bg-red-900 text-white py-2 rounded-lg text-xs font-bold transition">
                  Guardar Catequizando
                </button>
              </form>
            </div>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-700"></div>
              <span className="flex-shrink mx-3 text-slate-400 text-xs font-medium">o importar archivo</span>
              <div className="flex-grow border-t border-slate-700"></div>
            </div>

            {/* SECCIÓN 2: CARGAR EXCEL */}
            <div className="border border-slate-700/60 rounded-xl p-4 space-y-3 bg-slate-800/20">
              <h4 className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Cargar desde Excel / CSV</h4>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Grupo Destino para Excel</label>
                <select
                  value={excelTargetGroupId}
                  onChange={(e) => setExcelTargetGroupId(e.target.value)}
                  className={`w-full rounded-lg px-4 py-2 text-xs sm:text-sm ${inputBgClass}`}
                >
                  <option value="">Selecciona el grupo...</option>
                  {visibleGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.name} ({g.year || '2026-2027'})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Archivo Excel / CSV</label>
                <div className="flex items-center gap-2 mb-2">
                  <button type="button" onClick={handleDownloadStudentTemplate} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold">
                    Descargar plantilla
                  </button>
                </div>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="w-full text-xs sm:text-sm text-slate-400"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  disabled={!excelTargetGroupId || excelPreview.length === 0}
                  onClick={handleConfirmExcelImport}
                  className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 text-white rounded-lg shadow-sm"
                >
                  Importar Excel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL CREAR GRUPO */}
      {isCreateGroupModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className={`${cardBgClass} rounded-2xl max-w-md w-full p-4 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto`}>
            <div className="flex justify-between items-center border-b border-slate-700 pb-3">
              <h3 className="text-lg sm:text-xl font-bold">Crear Nuevo Grupo</h3>
              <button onClick={() => setIsCreateGroupModalOpen(false)} className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1">✕</button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nombre del Grupo</label>
                <input
                  required
                  value={newGroupName}
                  onChange={event => setNewGroupName(event.target.value)}
                  placeholder="Ej: Confirmación - A"
                  className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nivel</label>
                  <select
                    value={newGroupLevel}
                    onChange={(event) => setNewGroupLevel(event.target.value)}
                    className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`}
                  >
                    {levelOptions.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Ciclo</label>
                  <select
                    value={newGroupYear}
                    onChange={event => setNewGroupYear(event.target.value)}
                    className={`w-full rounded-lg px-3 py-2 text-sm ${inputBgClass}`}
                  >
                    {(() => {
                      const currYear = new Date().getFullYear();
                      return (
                        <>
                          <option value={`${currYear - 1}-${currYear}`}>{`${currYear - 1}-${currYear}`}</option>
                          <option value={`${currYear}-${currYear + 1}`}>{`${currYear}-${currYear + 1}`}</option>
                          <option value={`${currYear + 1}-${currYear + 2}`}>{`${currYear + 1}-${currYear + 2}`}</option>
                        </>
                      );
                    })()}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select value={newGroupDay} onChange={event => setNewGroupDay(event.target.value)} className={`rounded-lg px-3 py-2 text-sm ${inputBgClass}`}>
                  <option value="">Día...</option>
                  {groupScheduleOptions.days.map(day => <option key={day} value={day}>{day}</option>)}
                </select>
                <select value={newGroupTime} onChange={event => setNewGroupTime(event.target.value)} className={`rounded-lg px-3 py-2 text-sm ${inputBgClass}`}>
                  <option value="">Horario...</option>
                  {groupScheduleOptions.times.map(time => <option key={time} value={time}>{time}</option>)}
                </select>
                <select value={newGroupRoom} onChange={event => setNewGroupRoom(event.target.value)} className={`rounded-lg px-3 py-2 text-sm ${inputBgClass}`}>
                  <option value="">Salón...</option>
                  {groupScheduleOptions.rooms.map(room => <option key={room} value={room}>{room}</option>)}
                </select>
              </div>

              <div className="pt-2 flex gap-2 justify-end border-t border-slate-700">
                <button type="button" onClick={() => setIsCreateGroupModalOpen(false)} className="px-4 py-2 text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-white rounded-lg">
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 text-xs font-semibold bg-red-800 hover:bg-red-900 text-white rounded-lg shadow-sm">
                  Crear Grupo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL EDITAR MATRÍCULA / CATEQUIZANDO */}
      {editingEnrollmentStudent && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[70] flex justify-center items-center p-3 sm:p-6 overflow-y-auto">
          <div className={`${cardBgClass} rounded-2xl max-w-4xl w-full p-4 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto border border-slate-700 relative`}>
            <div className="flex justify-between items-center border-b border-slate-700 pb-3">
              <h3 className="text-lg sm:text-xl font-bold text-amber-400">{editingEnrollmentReadOnly ? 'Ver Expediente / Matrícula' : 'Editar Expediente / Matrícula'}</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadEnrollmentExpediente?.(editingEnrollmentStudent)}
                  className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-800"
                >
                  📄 Generar PDF
                </button>
                <button
                  onClick={() => { setEditingEnrollmentStudent(null); setEditingEnrollmentReadOnly(false); }}
                  aria-label="Cerrar"
                  className="rounded-lg bg-rose-700 px-2.5 py-1 text-lg font-bold leading-none text-white hover:bg-rose-800"
                >
                  ✕
                </button>
              </div>
            </div>

            <EnrollmentView
              currentUser={userData || user}
              parroquias={parroquias}
              diaconias={diaconias}
              groups={groups}
              paymentRecords={paymentRecords}
              setPaymentRecords={setPaymentRecords}
              handlePrintPaymentReceipt={handlePrintPaymentReceipt}
              handleGeneratePaymentProofPdf={handleGeneratePaymentProofPdf}
              handleViewPaymentQr={handleViewPaymentQr}
              initialStudent={editingEnrollmentStudent}
              readOnly={editingEnrollmentReadOnly}
              onNavigate={() => {
                setEditingEnrollmentStudent(null);
                setEditingEnrollmentReadOnly(false);
                setEditingStudentId(null);
                setMaintenanceMode('view');
                fetchAllData();
              }}
              cardBgClass={cardBgClass}
              inputBgClass={inputBgClass}
              themeMode={themeMode}
            />
          </div>
        </div>
      )}
      <div className="fixed bottom-4 right-4 z-[120] flex w-[min(calc(100vw-2rem),24rem)] flex-col gap-2 pointer-events-none">
        {appToasts.map(toast => (
          <div key={toast.id} className={`pointer-events-auto rounded-xl border px-4 py-3 text-sm font-semibold shadow-2xl backdrop-blur-lg ${toast.type === 'success' ? 'border-emerald-300/40 bg-emerald-600/45 text-white' : toast.type === 'warning' ? 'border-amber-300/40 bg-amber-500/45 text-slate-950' : 'border-slate-400/45 bg-slate-900/45 text-white'}`}>
            {toast.message}
          </div>
        ))}
      </div>
      {appModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 p-4" onMouseDown={event => event.target === event.currentTarget && setAppModal(null)}>
          <div className="w-full max-w-md rounded-2xl border border-slate-300 bg-white p-6 text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900 dark:text-white">
            <h3 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">{appModal.title}</h3>
            <p className="whitespace-pre-line text-sm leading-6 text-slate-700 dark:text-slate-200">{appModal.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setAppModal(null)} aria-label={appModal.confirm ? 'Cancelar' : 'Cerrar'} className="rounded-lg bg-rose-700 px-2.5 py-1 text-lg font-bold leading-none text-white hover:bg-rose-800">✕</button>
              {appModal.confirm && <button type="button" onClick={() => { const action = appModal.onConfirm; setAppModal(null); action?.(); }} className="rounded-lg bg-red-800 px-4 py-2 text-xs font-bold text-white">Aceptar</button>}
            </div>
          </div>
        </div>
      )}
      </div>
    </Suspense>
  );
}
