import { useState, useEffect, useCallback, useRef } from 'react';
import { toPng } from 'html-to-image';
import { auth, db, googleProvider, microsoftProvider } from './config/firebase';
import { AssistantWidget } from './components/AssistantWidget';
import { AuthModal } from './components/AuthModal';
import { QrModal } from './components/Modals/QrModal';
import { ScannerModal } from './components/Modals/ScannerModal';
import { MaintenanceModal } from './components/Modals/MaintenanceModal';
import { AsisCateLogo } from './components/Shared/AsisCateLogo';
import { CountryCodeSelect } from './components/Shared/CountryCodeSelect';
import { DashboardView } from './components/Views/DashboardView';
import { GroupsView } from './components/Views/GroupsView';
import { ReportsView } from './components/Views/ReportsView';
import { InventoryView } from './components/Views/InventoryView';
import { PaymentsView } from './components/Views/PaymentsView';
import { UserManagementView } from './components/Views/UserManagementView';
import { levelOptions } from './utils/constants';
import EnrollmentView from './components/Views/EnrollmentView';
import EnrollmentDashboardView from './components/Views/EnrollmentDashboardView';
import { validatePhoneNumber, COUNTRY_CODES } from './utils/validators';
import { 
  signInWithPopup, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  addDoc, 
  getDocs, 
  updateDoc,
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
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

export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [activeViewMode, setActiveViewMode] = useState('catequista'); 
  const [themeMode, setThemeMode] = useState('light'); // 'light' | 'dark'
  const [navbarColor, setNavbarColor] = useState('#7f1d1d');
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine !== false);
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Estados para Modal de Onboarding
  const [modalParroquiaId, setModalParroquiaId] = useState('');
  const [modalDiaconiaId, setModalDiaconiaId] = useState('');
  const [userPhoneCode, setUserPhoneCode] = useState('+506');
  const [userPhoneNumber, setUserPhoneNumber] = useState('');
  const [savingTerritory, setSavingTerritory] = useState(false);
  const [isTerritoryModalSkipped, setIsTerritoryModalSkipped] = useState(false);

  const isTerritoryPending = Boolean(user && userData && (!userData.parroquiaId || !userData.diaconiaId || !userData.phoneNumber));
  const isUserUnapproved = Boolean(user && userData && userData.approved === false);
  const isUserInactive = Boolean(user && userData && userData.active === false);

  // Datos
  const [isEnrollmentEnabled, setIsEnrollmentEnabled] = useState(true);
  const [parroquias, setParroquias] = useState([]);
  const [diaconias, setDiaconias] = useState([]);
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
  const [reportStudentIds, setReportStudentIds] = useState(null);
  const [maintenanceGroup, setMaintenanceGroup] = useState(null);
  const [maintenanceMode, setMaintenanceMode] = useState('view');
  const [isAddStudentFormOpen, setIsAddStudentFormOpen] = useState(false);
  const [messageModal, setMessageModal] = useState(null);
  const [reportSubTab, setReportSubTab] = useState('asistencia');
  const [reportFilters, setReportFilters] = useState({ dateFrom: '', dateTo: '', search: '' });
  const [reportAttendanceType, setReportAttendanceType] = useState('all');
  const [certificateFilters, setCertificateFilters] = useState({ search: '', scope: 'all' });
  const [selectedCertificateIds, setSelectedCertificateIds] = useState([]);
  const [attendanceDateEditor, setAttendanceDateEditor] = useState(null);
  const [certificateLetterDate, setCertificateLetterDate] = useState(new Date().toISOString().split('T')[0]);
  const [dashboardGroupId, setDashboardGroupId] = useState('');
  const [dashboardDate, setDashboardDate] = useState('');
  const [dashboardPanelOpen, setDashboardPanelOpen] = useState(false);
  const [certificateGenerationType, setCertificateGenerationType] = useState('asistencia');
  const [certificateSearchType, setCertificateSearchType] = useState('all');
  const [certificateSearch, setCertificateSearch] = useState('');
  const [certificatePage, setCertificatePage] = useState(1);
  const [certificatePageSize, setCertificatePageSize] = useState(10);
  const [certificateGenerationOpen, setCertificateGenerationOpen] = useState(true);
  const [certificateSearchOpen, setCertificateSearchOpen] = useState(true);


  const [issuedCertificates, setIssuedCertificates] = useState([]);
  const [generatedCertificates, setGeneratedCertificates] = useState(() => {
    try {
      const saved = localStorage.getItem('asiscate-generated-certificates');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [levelCertificateHistory, setLevelCertificateHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('asiscate-level-certificates');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [attendanceLetterHistory, setAttendanceLetterHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('asiscate-attendance-letters');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [levelCertificateFilters, setLevelCertificateFilters] = useState({ year: 'all', level: 'all', search: '' });
  const [inventoryItems, setInventoryItems] = useState(() => {
    try {
      const saved = localStorage.getItem('asiscate-inventory');
      return saved ? JSON.parse(saved) : [
        { id: 'material-1', name: 'Biblia del catequista', category: 'Material', stock: 6, unit: 'pza' },
        { id: 'material-2', name: 'Fichas de trabajo', category: 'Papelería', stock: 20, unit: 'pza' }
      ];
    } catch {
      return [
        { id: 'material-1', name: 'Biblia del catequista', category: 'Material', stock: 6, unit: 'pza' },
        { id: 'material-2', name: 'Fichas de trabajo', category: 'Papelería', stock: 20, unit: 'pza' }
      ];
    }
  });
  const [inventoryAssets, setInventoryAssets] = useState(() => {
    try {
      const saved = localStorage.getItem('asiscate-inventory-assets');
      return saved ? JSON.parse(saved) : [
        { id: 'asset-1', name: 'Micrófono portátil', category: 'Equipo audiovisual', stock: 2, unit: 'unidad', showTogether: false },
        { id: 'asset-2', name: 'Proyector', category: 'Equipo', stock: 1, unit: 'unidad', showTogether: false }
      ];
    } catch {
      return [
        { id: 'asset-1', name: 'Micrófono portátil', category: 'Equipo audiovisual', stock: 2, unit: 'unidad', showTogether: false },
        { id: 'asset-2', name: 'Proyector', category: 'Equipo', stock: 1, unit: 'unidad', showTogether: false }
      ];
    }
  });
  const [inventoryReservations, setInventoryReservations] = useState(() => {
    try {
      const saved = localStorage.getItem('asiscate-inventory-reservations');
      return saved ? JSON.parse(saved) : [
        { id: 'demo-res-1', itemId: 'demo-1', itemName: 'Biblia del catequista', reservedBy: 'María', date: new Date().toISOString().split('T')[0], slot: '08:00-10:00', quantity: 1, status: 'confirmado' }
      ];
    } catch {
      return [
        { id: 'demo-res-1', itemId: 'demo-1', itemName: 'Biblia del catequista', reservedBy: 'María', date: new Date().toISOString().split('T')[0], slot: '08:00-10:00', quantity: 1, status: 'confirmado' }
      ];
    }
  });
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
  const [paymentRecords, setPaymentRecords] = useState(() => {
    try {
      const saved = localStorage.getItem('asiscate-payments');
      return saved ? JSON.parse(saved) : [
        { id: 'demo-pay-1', studentName: 'Ana López', concept: 'Matrícula', amount: 250, date: new Date().toISOString().split('T')[0], status: 'pagado' }
      ];
    } catch {
      return [
        { id: 'demo-pay-1', studentName: 'Ana López', concept: 'Matrícula', amount: 250, date: new Date().toISOString().split('T')[0], status: 'pagado' }
      ];
    }
  });
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
  const [editGroupCatechists, setEditGroupCatechists] = useState([]);
  const [editGroupVisibleForCatechists, setEditGroupVisibleForCatechists] = useState(true);

  const [excelPreview, setExcelPreview] = useState([]);
  const [excelTargetGroupId, setExcelTargetGroupId] = useState('');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false);
  const [editingEnrollmentStudent, setEditingEnrollmentStudent] = useState(null);

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
    document.title = 'AsisCate';
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('asiscate-generated-certificates', JSON.stringify(generatedCertificates));
    } catch (error) {
      console.warn('No se pudieron guardar los certificados generados:', error);
    }
  }, [generatedCertificates]);

  useEffect(() => {
    try {
      localStorage.setItem('asiscate-level-certificates', JSON.stringify(levelCertificateHistory));
    } catch (error) {
      console.warn('No se pudieron guardar los certificados de nivel:', error);
    }
  }, [levelCertificateHistory]);

  useEffect(() => {
    try {
      localStorage.setItem('asiscate-attendance-letters', JSON.stringify(attendanceLetterHistory));
    } catch (error) {
      console.warn('No se pudieron guardar las cartas de asistencia:', error);
    }
  }, [attendanceLetterHistory]);

  useEffect(() => {
    try {
      localStorage.setItem('asiscate-inventory', JSON.stringify(inventoryItems));
    } catch (error) {
      console.warn('No se pudieron guardar los elementos de inventario:', error);
    }
  }, [inventoryItems]);

  useEffect(() => {
    try {
      localStorage.setItem('asiscate-inventory-assets', JSON.stringify(inventoryAssets));
    } catch (error) {
      console.warn('No se pudieron guardar los activos de inventario:', error);
    }
  }, [inventoryAssets]);

  useEffect(() => {
    try {
      localStorage.setItem('asiscate-inventory-reservations', JSON.stringify(inventoryReservations));
    } catch (error) {
      console.warn('No se pudieron guardar las reservas de inventario:', error);
    }
  }, [inventoryReservations]);

  useEffect(() => {
    try {
      localStorage.setItem('asiscate-payments', JSON.stringify(paymentRecords));
    } catch (error) {
      console.warn('No se pudieron guardar los pagos:', error);
    }
  }, [paymentRecords]);

  const cachePrimaryData = useCallback(() => {
    try {
      localStorage.setItem('asiscate-parroquias-cache', JSON.stringify(parroquias));
      localStorage.setItem('asiscate-diaconias-cache', JSON.stringify(diaconias));
      localStorage.setItem('asiscate-groups-cache', JSON.stringify(groups));
      localStorage.setItem('asiscate-students-cache', JSON.stringify(students));
      localStorage.setItem('asiscate-users-cache', JSON.stringify(allUsers));
    } catch (error) {
      console.warn('No se pudo guardar la caché local:', error);
    }
  }, [parroquias, diaconias, groups, students, allUsers]);

  useEffect(() => {
    cachePrimaryData();
  }, [cachePrimaryData]);

  useEffect(() => {
    if (activeTab !== 'inventario' || !userRole || userRole === 'catequista') return;

    const today = new Date().toISOString().split('T')[0];
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const cutoff = oneYearAgo.toISOString();

    const cleanupId = window.setTimeout(() => {
      const expiredItems = inventoryItems.filter(item => item.createdAt && new Date(item.createdAt) < new Date(cutoff));
      const expiredReservations = inventoryReservations.filter(reservation => reservation.date && reservation.date < today);
      Promise.all([
        ...expiredItems.map(item => deleteDoc(doc(db, 'inventoryItems', item.id))),
        ...expiredReservations.map(reservation => deleteDoc(doc(db, 'inventoryReservations', reservation.id)))
      ]).catch(error => console.warn('No se pudo completar la limpieza de Inventario en Firestore:', error));
      setInventoryItems(previous => previous.filter(item => !expiredItems.some(expired => expired.id === item.id)));
      setInventoryReservations(previous => previous.filter(reservation => !expiredReservations.some(expired => expired.id === reservation.id)));
    }, 0);

    return () => window.clearTimeout(cleanupId);
  }, [activeTab, userRole]);

  const fetchAndResolveUser = async (currentUser) => {
    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDocSnap = await getDoc(userDocRef);

      const targetEmail = currentUser.email ? currentUser.email.toLowerCase() : '';
      const defaultAdminEmails = ['cmisra2407@gmail.com', 'asiscate.elcarmen@gmail.com'];
      const isDefaultAdmin = defaultAdminEmails.includes(targetEmail);

      if (userDocSnap.exists()) {
        const uData = userDocSnap.data();
        let currentRole = uData.role || 'catequista';
        const savedTheme = uData.theme || 'light';
        const savedNavbarColor = uData.navbarColor || '#7f1d1d';

        if (isDefaultAdmin && currentRole !== 'admin') {
          currentRole = 'admin';
        }

        const resolvedName = uData.name || currentUser.displayName || 'Usuario';

        await updateDoc(userDocRef, {
          name: resolvedName,
          email: currentUser.email || uData.email,
          role: currentRole
        });
        
        setUserData({ id: currentUser.uid, ...uData, name: resolvedName, role: currentRole, theme: savedTheme, navbarColor: savedNavbarColor });
        setUserPhoneCode(uData.phoneCode || '+506');
        setUserPhoneNumber(uData.phoneNumber || '');
        setModalParroquiaId(uData.parroquiaId || '');
        setModalDiaconiaId(uData.diaconiaId || '');
        setThemeMode(savedTheme);
        if (isAllowedNavbarColor(savedNavbarColor)) {
          setNavbarColor(savedNavbarColor);
        }
        return currentRole;
      } else {
        const defaultRole = isDefaultAdmin ? 'admin' : 'catequista';

        // Verificar si el correo está en la lista de autoadmitidos
        let isPreApproved = isDefaultAdmin;
        if (!isPreApproved && targetEmail) {
          try {
            const allowedDocRef = doc(db, 'allowedEmails', targetEmail);
            const allowedSnap = await getDoc(allowedDocRef);
            if (allowedSnap.exists()) {
              isPreApproved = true;
              await deleteDoc(allowedDocRef).catch(err => console.warn('No se pudo borrar de allowedEmails:', err));
            }
          } catch (allowErr) {
            console.warn('Error consultando allowedEmails:', allowErr);
          }
        }

        const newUserObj = {
          name: currentUser.displayName || 'Usuario',
          email: currentUser.email,
          role: defaultRole,
          parroquiaId: '',
          diaconiaId: '',
          phoneCode: '+506',
          phoneNumber: '',
          phone: '',
          approved: isPreApproved ? true : false,
          active: true,
          theme: 'light',
          navbarColor: '#7f1d1d',
          createdAt: new Date().toISOString()
        };
        await setDoc(userDocRef, newUserObj);
        setUserData({ id: currentUser.uid, ...newUserObj });
        setUserPhoneCode('+506');
        setUserPhoneNumber('');
        setThemeMode('light');
        setNavbarColor('#7f1d1d');
        return defaultRole;
      }
    } catch (error) {
      console.error("Error resolviendo usuario:", error);
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

      const parroquiasSnap = await getDocs(collection(db, 'parroquias'));
      const nextParroquias = parroquiasSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setParroquias(nextParroquias);

      const diaconiasSnap = await getDocs(collection(db, 'diaconias'));
      const nextDiaconias = diaconiasSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setDiaconias(nextDiaconias);

      const usersSnap = await getDocs(collection(db, 'users'));
      const nextUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllUsers(nextUsers);

      if (user) {
        const currentUserFreshData = nextUsers.find(u => u.id === user.uid);
        if (currentUserFreshData) {
          setUserData(currentUserFreshData);
        }
      }

      try {
        const allowedEmailsSnap = await getDocs(collection(db, 'allowedEmails'));
        const nextAllowedEmails = allowedEmailsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAllowedEmails(nextAllowedEmails);
      } catch (e) {
        console.warn('No se pudo cargar allowedEmails:', e);
      }

      const groupsSnap = await getDocs(collection(db, 'groups'));
      const nextGroups = groupsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setGroups(nextGroups);

      const studentsSnap = await getDocs(collection(db, 'students'));
      const nextStudents = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setStudents(nextStudents);

      const inventoryItemsSnap = await getDocs(collection(db, 'inventoryItems'));
      const inventoryAssetsSnap = await getDocs(collection(db, 'inventoryAssets'));
      const inventoryReservationsSnap = await getDocs(collection(db, 'inventoryReservations'));
      const today = new Date().toISOString().split('T')[0];
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const certificatesSnap = await getDocs(collection(db, 'certificates'));
      const nextCertificates = certificatesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setIssuedCertificates(nextCertificates);

      const inventoryDocs = inventoryItemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const assetDocs = inventoryAssetsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const reservationDocs = inventoryReservationsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
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

  useEffect(() => {
    if (!user) return;
    try {
      const unsubCerts = onSnapshot(collection(db, 'certificates'), (snap) => {
        const certs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setIssuedCertificates(certs);
      }, (error) => {
        console.warn('Error escuchando certificados en tiempo real:', error);
      });

      const unsubConfig = onSnapshot(doc(db, 'config', 'enrollment'), (docSnap) => {
        if (docSnap.exists()) {
          setIsEnrollmentEnabled(docSnap.data().enabled !== false);
        }
      }, (error) => {
        console.warn('Error escuchando estado de matrícula:', error);
      });

      return () => {
        unsubCerts();
        unsubConfig();
      };
    } catch (err) {
      console.warn('No se pudo suscribir a Firestore:', err);
    }
  }, [user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (currentUser) {
        setUser(currentUser);
        const resolvedRole = await fetchAndResolveUser(currentUser);
        setUserRole(resolvedRole);
        
        const initialView = resolvedRole === 'admin' ? 'admin' : (resolvedRole === 'coordinadorGeneral' ? 'coordinadorGeneral' : (resolvedRole === 'coordinador' ? 'coordinador' : 'catequista'));
        setActiveViewMode(initialView);
        await fetchAllData();
      } else {
        setUser(null);
        setUserData(null);
        setUserRole(null);
        setGroups([]);
        setStudents([]);
        setAllUsers([]);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [fetchAllData]);

  const handleSaveInitialTerritory = async (e) => {
    e.preventDefault();
    if (!modalParroquiaId || !modalDiaconiaId) {
      alert("Debes seleccionar tanto la parroquia como la diaconía.");
      return;
    }

    const phoneResult = validatePhoneNumber(userPhoneCode, userPhoneNumber);
    if (!phoneResult.valid) {
      alert(phoneResult.message);
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
    } catch (error) {
      console.error("Error guardando selección inicial:", error);
      alert("Error al guardar la selección. Intenta nuevamente.");
    } finally {
      setSavingTerritory(false);
    }
  };

  const checkTerritoryConfigured = () => {
    if (isTerritoryPending) {
      alert("Debes configurar tu Parroquia, Diaconía y Número de Teléfono en tus Preferencias (haz clic en tu usuario en el navbar) para realizar esta acción.");
      setUserNameDraft(userData?.name || user?.displayName || '');
      setModalParroquiaId(userData?.parroquiaId || '');
      setModalDiaconiaId(userData?.diaconiaId || '');
      setUserPhoneCode(userData?.phoneCode || '+506');
      setUserPhoneNumber(userData?.phoneNumber || '');
      setIsUserNameModalOpen(true);
      return false;
    }
    if (isUserUnapproved) {
      alert("Tu cuenta aún está pendiente de aprobación por parte del Coordinador o Administrador. No puedes realizar ediciones hasta ser aprobado.");
      return false;
    }
    if (isUserInactive) {
      alert("Tu cuenta se encuentra inactiva. Contacta al Coordinador o Administrador para reactivarla.");
      return false;
    }
    return true;
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

  const handleNavbarColorChange = (nextColor) => {
    if (!nextColor) return;
    if (!isAllowedNavbarColor(nextColor)) {
      setNavbarColor('#7f1d1d');
      return;
    }
    setNavbarColor(nextColor);
  };

  const handleToggleViewMode = (mode) => {
    setActiveViewMode(mode);
    if (mode === 'catequista' && (activeTab === 'parroquias' || activeTab === 'admin')) {
      setActiveTab('dashboard');
    }
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
      fetchAllData();
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

    const groupParroquia = userData?.parroquiaId || newGroupParroquia || (parroquias[0]?.id || '');
    const groupDiaconia = userData?.diaconiaId || newGroupDiaconia || (diaconias[0]?.id || '');

    try {
      const groupData = {
        name: newGroupName,
        level: newGroupLevel,
        year: newGroupYear || '2026-2027',
        parroquiaId: groupParroquia,
        diaconiaId: groupDiaconia,
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
        year: group.year || '2026-2027',
        parroquiaId: group.parroquiaId,
        diaconiaId: group.diaconiaId,
        catechistIds: group.catechistIds || [],
        catechistNames: group.catechistNames || [],
        isVisibleForCatechists: group.isVisibleForCatechists !== false,
        createdAt: new Date().toISOString()
      });

      const studentsToDuplicate = students.filter(student => student.groupId === group.id);
      for (const student of studentsToDuplicate) {
        await addDoc(collection(db, 'students'), {
          name: student.name,
          parentEmail: student.parentEmail || '',
          parentPhone: student.parentPhone || '',
          groupId: duplicateGroupRef.id,
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
    const existingIds = group.catechistIds || (group.catechistId ? [group.catechistId] : []);
    setEditGroupCatechists(existingIds);
    setEditGroupVisibleForCatechists(group.isVisibleForCatechists !== false);
  };

  const handleSaveGroupEdit = async () => {
    if (!editingGroupId || !editGroupName.trim()) return;

    try {
      const selectedUsers = allUsers.filter(u => editGroupCatechists.includes(u.id));
      const names = selectedUsers.map(u => u.name || u.email);

      const groupRef = doc(db, 'groups', editingGroupId);
      await updateDoc(groupRef, {
        name: editGroupName,
        level: editGroupLevel,
        year: editGroupYear || '2026-2027',
        catechistIds: editGroupCatechists,
        catechistNames: names,
        isVisibleForCatechists: editGroupVisibleForCatechists
      });

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

    try {
      const studentData = {
        name: newStudentName.trim(),
        parentEmail: newStudentParentEmail.trim(),
        parentPhone: newStudentParentPhone.trim(),
        groupId: selectedGroupForStudent,
        parroquiaId: groupObj?.parroquiaId || userData?.parroquiaId || '',
        diaconiaId: groupObj?.diaconiaId || userData?.diaconiaId || '',
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
    setEditingStudentId(student.id);
    setEditStudentName(student.fullName || student.name || '');
    setEditStudentParentEmail(student.parentEmail || student.family?.guardian?.email || '');
    setEditStudentParentPhone(student.parentPhone || student.family?.guardian?.phone1 || '');
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

  const handleDownloadStudentTemplate = () => {
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
          diaconiaId: groupObj?.diaconiaId || userData?.diaconiaId || '',
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
          updatedAttendance.push({
            date: dateStr,
            status: 'present',
            present: true,
            label: cleanedLabel,
            type: targetType
          });
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
    const payload = JSON.stringify({
      type: 'student',
      studentId: student.id,
      name: student.name,
      groupId: student.groupId
    });

    const group = groups.find(item => item.id === student.groupId);
    const parroquia = parroquias.find(item => item.id === group?.parroquiaId)?.name || 'Parroquia';

    setQrCardLoading(true);
    setQrModal({
      title: student.name,
      name: student.name,
      level: group?.level || 'Cate-Kinder',
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
    let record = null;

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
      let rec = null;

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

  const getAttendanceReportView = (groupId) => {
    const groupStudents = visibleStudents.filter(student => (
      student.groupId === groupId &&
      (!reportFilters.search || student.name.toLowerCase().includes(reportFilters.search.toLowerCase()))
    ));
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
      const [jsPdfModule, autoTableModule] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable')
      ]);
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

  const getGroupReportStudents = (groupId) => students.filter(student => student.groupId === groupId);

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
    doc.line(28, 200, 92, 200);
    doc.line(118, 200, 182, 200);
    doc.setTextColor(71, 85, 105);
    doc.setFontSize(9);
    doc.text('Firma del Coordinador', 35, 206);
    doc.text('Firma del Catequista', 130, 206);

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
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, 210, 297, 'F');
      doc.addImage(faviconPng, 'PNG', 14, 10, 14, 14);
      doc.setFillColor(127, 29, 29);
      doc.rect(32, 10, 164, 14, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('AsisCate - Constancia de asistencia', 36, 19);
      doc.setTextColor(55, 65, 81);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Grupo: ${group.name}`, 18, 38);
      doc.text(`Ciclo Catequético: ${group.year || '2026-2027'}`, 18, 45);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(18, 56, 174, 112, 6, 6, 'F');
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(18, 56, 174, 112, 6, 6, 'S');
      doc.setTextColor(31, 41, 55);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text(student.name, 28, 78);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      const body = [
        `Por medio de la presente, se constata que ${student.name}`,
        `el día ${dateStr}, ${statusLabel} al encuentro de catequesis correspondiente a ${description}.`,
        `Esta constancia se emite para respaldar la participación del proceso formativo de la comunidad parroquial.`,
        ``,
        `En la ciudad de Alajuela, ${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}.`
      ];
      body.forEach((line, index) => {
        doc.text(line, 28, 96 + index * 11, { maxWidth: 154 });
      });
      doc.setDrawColor(127, 29, 29);
      doc.line(30, 190, 90, 190);
      doc.setFont('helvetica', 'bold');
      doc.text('Firma del catequista', 60, 198, { align: 'center' });
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
    const canEdit = activeViewMode === 'admin' || item.createdBy === currentUserKey;
    if (!canEdit) {
      alert('Solo puedes modificar tus propios materiales.');
      return;
    }
    setEditingInventoryItemId(item.id);
    setInventoryForm({ name: item.name, stock: String(item.stock || 0) });
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
      stock: Number(inventoryForm.stock) || 0,
      createdBy: user?.uid || userData?.id || userData?.fullName || 'system',
      createdByName: userData?.name || user?.displayName || 'Usuario',
      createdAt: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    };

    if (editingInventoryItemId) {
      const updatedItem = { id: editingInventoryItemId, ...payload };
      await setDoc(doc(db, 'inventoryItems', editingInventoryItemId), payload, { merge: true });
      setInventoryItems(prev => prev.map(item => item.id === editingInventoryItemId ? updatedItem : item));
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
    if (activeViewMode !== 'admin' && item.createdBy !== currentUserKey) {
      alert('Solo puedes eliminar tus propios materiales.');
      return;
    }
    await deleteDoc(doc(db, 'inventoryItems', itemId));
    setInventoryItems(prev => prev.filter(item => item.id !== itemId));
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
      await setDoc(doc(db, 'inventoryReservations', editingInventoryReservationId), reservationPayload, { merge: true });
      setInventoryReservations(prev => prev.map(reservation => reservation.id === editingInventoryReservationId ? { ...reservation, ...reservationPayload } : reservation));
      setEditingInventoryReservationId(null);
    } else {
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
    if (activeViewMode !== 'admin' && reservation.createdBy !== currentUserKey) {
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
      const [jsPdfModule, autoTableModule] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable')
      ]);
      const JsPdf = jsPdfModule.jsPDF || jsPdfModule.default?.jsPDF || jsPdfModule.default;
      const autoTable = autoTableModule.default || autoTableModule.autoTable;

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
      const totalStock = itemsToExport.reduce((acc, item) => acc + Number(item.stock || 0), 0);
      doc.text(`Unidades en stock total: ${totalStock}`, pageWidth - 70, 32);

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

      autoTable(doc, {
        startY: inventoryDateFilters.dateFrom || inventoryDateFilters.dateTo ? 50 : 46,
        head: [['#', 'Material', 'Cantidad', 'Fecha de Registro', 'Ingresado por']],
        body: itemsToExport.map((item, index) => [
          String(index + 1),
          String(item.name || 'Sin nombre'),
          String(item.stock ?? 0),
          item.date || item.createdAt?.split('T')[0] || 'Sin fecha',
          resolveRegisteredBy(item)
        ]),
        theme: 'grid',
        headStyles: {
          fillColor: [127, 29, 29],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 9,
          cellPadding: 3
        },
        bodyStyles: {
          fontSize: 8.5,
          cellPadding: 3,
          textColor: [31, 41, 55]
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252]
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 62 },
          2: { cellWidth: 20, halign: 'center' },
          3: { cellWidth: 32, halign: 'center' },
          4: { cellWidth: 58 }
        },
        didDrawPage: () => {
          doc.setTextColor(75, 85, 105);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.text('Parroquia Nuestra Señora de El Carmen • Pastoral de Catequesis', 14, pageHeight - 10);
          doc.setTextColor(127, 29, 29);
          doc.setFont('helvetica', 'bold');
          doc.text('AsisCate', pageWidth - 14, pageHeight - 10, { align: 'right' });
        }
      });

      doc.save(`Lista_Materiales_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Error exportando lista de materiales PDF:', error);
      alert('No se pudo exportar la lista de materiales.');
    }
  };

  const handleAddPaymentRecord = (event) => {
    event.preventDefault();
    const selectedStudent = paymentForm.studentId ? students.find(student => student.id === paymentForm.studentId) : null;
    const resolvedStudentName = selectedStudent?.name || paymentForm.studentName.trim();
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
      groupName: visibleGroups.find(group => group.id === paymentForm.groupId)?.name || '',
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

    setPaymentRecords(prev => [newRecord, ...prev]);
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
  };

  const handleDeletePaymentRecord = (paymentId) => {
    setPaymentRecords(prev => prev.filter(record => record.id !== paymentId));
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
    let qrUrl = '';
    try {
      qrUrl = await buildPaymentQrDataUrl(record);
    } catch {
      qrUrl = buildPaymentProofQrUrl(record);
    }
    let logoUrl = '';
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

  const levelOptions = ['Cate-Kinder', '1er Nivel', '2do Nivel', '3er Nivel', '4to Nivel', '5to Nivel', '6to Nivel', '7mo Nivel', 'Confirma'];

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

  const handleChangeRole = async (targetUserId, newRole) => {
    if (userRole !== 'admin' && userRole !== 'coordinadorGeneral') return;
    const targetUserObj = allUsers.find(u => u.id === targetUserId);
    const targetEmail = targetUserObj?.email?.toLowerCase() || '';
    if (['cmisra2407@gmail.com', 'asiscate.elcarmen@gmail.com'].includes(targetEmail)) {
      alert("Este usuario es Administrador Principal por defecto y no se le puede cambiar el rol.");
      return;
    }
    try {
      const userRef = doc(db, 'users', targetUserId);
      await updateDoc(userRef, { role: newRole });
      fetchAllData();
    } catch (error) {
      console.error("Error cambiando el rol:", error);
    }
  };

  const handleApproveUser = async (targetUserId) => {
    if (userRole !== 'admin' && userRole !== 'coordinador' && userRole !== 'coordinadorGeneral') return;
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
      const userRef = doc(db, 'users', targetUserId);
      await updateDoc(userRef, { parroquiaId: pId, diaconiaId: dId });
      fetchAllData();
    } catch (error) {
      console.error("Error asignando ubicación a usuario:", error);
    }
  };

  const handleDeleteUser = async (targetUser) => {
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

  const visibleGroups = groups.filter(g => {
    if (activeViewMode === 'admin') return true;
    if (activeViewMode === 'coordinador') return g.diaconiaId === userData?.diaconiaId;
    if (activeViewMode === 'coordinadorGeneral') {
      const sameParish = userRole === 'admin' || g.parroquiaId === userData?.parroquiaId;
      return sameParish && (!generalDiaconiaId || g.diaconiaId === generalDiaconiaId);
    }
    
    // Vista Catequista: Debe estar asignado Y el grupo debe ser visible para catequistas
    const isAssigned = Array.isArray(g.catechistIds) ? g.catechistIds.includes(user?.uid) : g.catechistId === user?.uid;
    const isVisible = g.isVisibleForCatechists !== false;
    return isAssigned && isVisible;
  });

  const visibleGroupIds = visibleGroups.map(g => g.id);

  const visibleStudents = activeViewMode === 'admin'
    ? students 
    : students.filter(s => visibleGroupIds.includes(s.groupId));

  const latestAttendanceDate = visibleStudents
    .flatMap(student => (student.attendance || []).map(record => record.date).filter(Boolean))
    .sort()
    .at(-1) || '';

  useEffect(() => {
    if (!latestAttendanceDate) return;

    const timeoutId = window.setTimeout(() => {
      setDashboardDate(previousDate => previousDate || latestAttendanceDate);
      if (!attendanceDateInitializedRef.current) {
        setAttendanceDate(latestAttendanceDate);
        attendanceDateInitializedRef.current = true;
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [latestAttendanceDate]);

  const currentUserKey = user?.uid || userData?.id || userData?.fullName || 'system';
  const inventoryDateFilteredItems = inventoryItems.filter(item => {
    const itemDate = item.date || item.createdAt?.split('T')[0] || '';
    if (inventoryDateFilters.dateFrom && itemDate < inventoryDateFilters.dateFrom) return false;
    if (inventoryDateFilters.dateTo && itemDate > inventoryDateFilters.dateTo) return false;
    return true;
  });
  const visibleInventoryItems = activeViewMode === 'admin'
    ? inventoryDateFilteredItems
    : activeViewMode === 'catequista'
      ? inventoryDateFilteredItems.filter(item => item.createdBy === currentUserKey)
      : inventoryDateFilteredItems;
  const visibleInventoryAssets = activeViewMode === 'admin'
    ? inventoryAssets
    : inventoryAssets.filter(asset => !asset.createdBy || asset.createdBy === currentUserKey);
  const visibleInventoryReservations = activeViewMode === 'admin'
    ? inventoryReservations
    : inventoryReservations.filter(reservation => !reservation.createdBy || reservation.createdBy === currentUserKey);
  const displayInventoryAssets = inventoryAssets.flatMap(asset => {
    const isGrouped = asset.showTogether === true;
    if (isGrouped || Number(asset.stock || 0) <= 1) return [{ ...asset, showTogether: isGrouped }];
    return Array.from({ length: Number(asset.stock || 0) }, (_, index) => ({
      ...asset,
      id: `${asset.id}__unit__${index + 1}`,
      name: `${asset.name} #${index + 1}`,
      stock: 1,
      parentAssetId: asset.id,
      showTogether: false
    }));
  });

  const visiblePaymentRecords = paymentRecords.filter(record => {
    if (activeViewMode === 'admin' || userRole === 'admin' || userRole === 'coordinadorGeneral') return true;
    if (activeViewMode === 'coordinador') {
      const group = groups.find(g => g.id === record.groupId);
      return record.createdBy === currentUserKey || (group && group.diaconiaId === userData?.diaconiaId);
    }
    // Catequista: solo información que ellos ingresen O perteneciente a los grupos que tienen a cargo
    const isCreator = record.createdBy === currentUserKey || record.createdBy === user?.uid || record.createdBy === userData?.id;
    const isAssignedGroup = record.groupId && visibleGroupIds.includes(record.groupId);
    return isCreator || isAssignedGroup;
  });

  const filteredPaymentRecords = visiblePaymentRecords.filter(record => {
    const matchesGroup = paymentFilters.groupId === 'all' || record.groupId === paymentFilters.groupId;
    const recordDate = record.date || record.dateTime?.split('T')[0] || '';
    const matchesDate = !paymentFilters.date || recordDate === paymentFilters.date;
    const receiptNum = String(record.id || '').replace(/\D/g, '').slice(-6) || String(record.id || '').slice(-6);
    const searchTarget = `${record.studentName || ''} ${record.invoiceName || ''} ${record.concept || ''} ${record.id || ''} ${receiptNum}`.toLowerCase();
    const matchesSearch = !paymentFilters.search || searchTarget.includes(paymentFilters.search.toLowerCase());
    return matchesGroup && matchesDate && matchesSearch;
  });

  const paymentPageSize = 10;
  const paymentTotalPages = Math.max(1, Math.ceil(filteredPaymentRecords.length / paymentPageSize));
  const paginatedPaymentRecords = filteredPaymentRecords.slice(
    (paymentCurrentPage - 1) * paymentPageSize,
    paymentCurrentPage * paymentPageSize
  );

  const totalCollected = visiblePaymentRecords.reduce((sum, record) => sum + Number(record.amount || 0), 0);
  const totalPending = 0;
  const dashboardAttendanceRecords = visibleStudents.flatMap(student => {
    if (dashboardGroupId && student.groupId !== dashboardGroupId) return [];
    return (student.attendance || []).filter(record => {
      const matchesType = (record.type || 'encuentro') === attendanceType;
      const matchesDate = !dashboardDate || record.date === dashboardDate;
      return matchesType && matchesDate;
    });
  });
  const dashboardAttendanceStats = {
    total: dashboardAttendanceRecords.length,
    present: dashboardAttendanceRecords.filter(record => (record.status || (record.present ? 'present' : 'absent')) === 'present').length,
    justified: dashboardAttendanceRecords.filter(record => (record.status || (record.present ? 'present' : 'absent')) === 'justified').length,
    absent: dashboardAttendanceRecords.filter(record => (record.status || (record.present ? 'present' : 'absent')) === 'absent').length
  };
  const absentRate = dashboardAttendanceStats.total
    ? Math.round((dashboardAttendanceStats.absent / dashboardAttendanceStats.total) * 100)
    : 0;
  const dashboardDonutStyle = dashboardAttendanceStats.total
    ? { background: `conic-gradient(#10b981 0 ${dashboardAttendanceStats.present / dashboardAttendanceStats.total * 100}%, #f59e0b ${dashboardAttendanceStats.present / dashboardAttendanceStats.total * 100}% ${(dashboardAttendanceStats.present + dashboardAttendanceStats.justified) / dashboardAttendanceStats.total * 100}%, #f43f5e ${(dashboardAttendanceStats.present + dashboardAttendanceStats.justified) / dashboardAttendanceStats.total * 100}% 100%)` }
    : { background: 'conic-gradient(#475569 0 100%)' };

  

  const managedUsers = activeViewMode === 'coordinadorGeneral'
    ? allUsers.filter(u => u.parroquiaId === userData?.parroquiaId)
    : userRole === 'coordinador'
    ? allUsers.filter(u => u.diaconiaId === userData?.diaconiaId)
    : userRole === 'coordinadorGeneral'
      ? allUsers.filter(u => u.parroquiaId === userData?.parroquiaId)
      : allUsers;
  const legacyPanelEnabled = userRole === '__legacy__';

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
  const inputBgClass = themeMode === 'dark' ? 'bg-neutral-950 border-neutral-700 text-white placeholder-neutral-400' : 'bg-white border-slate-300 text-slate-800';
  const mutedTextClass = themeMode === 'dark' ? 'text-slate-300' : 'text-slate-600';
  const softTextClass = themeMode === 'dark' ? 'text-slate-400' : 'text-slate-500';
  const labelTextClass = themeMode === 'dark' ? 'text-slate-300' : 'text-slate-600';
  const browserThemeStyle = { colorScheme: themeMode === 'dark' ? 'dark' : 'light' };

  return (
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
                className="rounded-lg border border-red-700 bg-red-950 px-3 py-2 text-xs font-bold text-white"
                aria-label="Seleccionar vista"
              >
                {userRole === 'admin' && <option value="admin">Admin</option>}
                {(userRole === 'admin' || userRole === 'coordinador') && <option value="coordinador">Coordinador</option>}
                {(userRole === 'admin' || userRole === 'coordinadorGeneral') && <option value="coordinadorGeneral">Cord. General</option>}
                <option value="catequista">Catequista</option>
              </select>
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
                  Panel
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                    activeTab === 'history' 
                      ? 'bg-white text-red-900 font-bold'
                      : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                  }`}
                >
                  Reportes
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
                {(isEnrollmentEnabled && userData?.canEnroll !== false) && (
                  <button
                    onClick={() => setActiveTab('enrollment')}
                    className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                      activeTab === 'enrollment' 
                        ? 'bg-white text-red-900 font-bold'
                        : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                    }`}
                  >
                    Matriculación
                  </button>
                )}
                <button
                  onClick={() => setActiveTab('inventario')}
                  className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                    activeTab === 'inventario' 
                      ? 'bg-white text-red-900 font-bold'
                      : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                  }`}
                >
                  Inventario
                </button>
                <button
                  onClick={() => setActiveTab('pagos')}
                  className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                    activeTab === 'pagos' 
                      ? 'bg-white text-red-900 font-bold'
                      : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                  }`}
                >
                  Pagos
                </button>
                {(activeViewMode === 'admin' || activeViewMode === 'coordinador' || activeViewMode === 'coordinadorGeneral') && (
                  <button
                    onClick={() => setActiveTab('enrollmentDashboard')}
                    className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                      activeTab === 'enrollmentDashboard' 
                        ? 'bg-white text-red-900 font-bold' 
                        : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                    }`}
                  >
                    Dash. Matrícula
                  </button>
                )}
                {activeViewMode === 'admin' && (
                  <button
                    onClick={() => setActiveTab('parroquias')}
                    className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                      activeTab === 'parroquias' 
                        ? 'bg-emerald-600 text-white font-bold' 
                        : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                    }`}
                  >
                    Parroquias
                  </button>
                )}

                {(activeViewMode === 'admin' || activeViewMode === 'coordinador' || activeViewMode === 'coordinadorGeneral') && (
                  <button
                    onClick={() => setActiveTab('admin')}
                    className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
                      activeTab === 'admin' 
                        ? 'bg-rose-600 text-white font-bold' 
                        : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                    }`}
                  >
                    Usuarios
                  </button>
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
          <div className={`lg:hidden border-b px-4 pt-2 pb-4 space-y-3 ${themeMode === 'dark' ? 'border-neutral-800 bg-black text-slate-100' : 'border-slate-200 bg-white text-slate-800'}`}>
            <div className="flex flex-col space-y-1">
              <button
                onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }}
                className={`px-3 py-2 rounded-lg text-left font-medium text-sm ${activeTab === 'dashboard' ? (themeMode === 'dark' ? 'bg-slate-700 text-white font-bold' : 'bg-white text-red-900 font-bold') : themeMode === 'dark' ? 'text-slate-400' : 'text-slate-400'}`}
              >
                Panel Principal
              </button>
              <button
                onClick={() => { setActiveTab('history'); setIsMobileMenuOpen(false); }}
                className={`px-3 py-2 rounded-lg text-left font-medium text-sm ${activeTab === 'history' ? (themeMode === 'dark' ? 'bg-slate-700 text-white font-bold' : 'bg-white text-red-900 font-bold') : themeMode === 'dark' ? 'text-slate-400' : 'text-slate-400'}`}
              >
                Reportes
              </button>
              <button
                onClick={() => { setActiveTab('groups'); setIsMobileMenuOpen(false); }}
                className={`px-3 py-2 rounded-lg text-left font-medium text-sm ${activeTab === 'groups' ? (themeMode === 'dark' ? 'bg-slate-700 text-white font-bold' : 'bg-white text-red-900 font-bold') : themeMode === 'dark' ? 'text-slate-400' : 'text-slate-400'}`}
              >
                Grupos
              </button>
              {(isEnrollmentEnabled && userData?.canEnroll !== false) && (
                <button
                  onClick={() => { setActiveTab('enrollment'); setIsMobileMenuOpen(false); }}
                  className={`px-3 py-2 rounded-lg text-left font-medium text-sm ${activeTab === 'enrollment' ? (themeMode === 'dark' ? 'bg-slate-700 text-white font-bold' : 'bg-white text-red-900 font-bold') : themeMode === 'dark' ? 'text-slate-400' : 'text-slate-400'}`}
                >
                  Matriculación
                </button>
              )}
              <button
                onClick={() => { setActiveTab('inventario'); setIsMobileMenuOpen(false); }}
                className={`px-3 py-2 rounded-lg text-left font-medium text-sm ${activeTab === 'inventario' ? (themeMode === 'dark' ? 'bg-slate-700 text-white font-bold' : 'bg-white text-red-900 font-bold') : themeMode === 'dark' ? 'text-slate-400' : 'text-slate-400'}`}
              >
                Inventario
              </button>
              <button
                onClick={() => { setActiveTab('pagos'); setIsMobileMenuOpen(false); }}
                className={`px-3 py-2 rounded-lg text-left font-medium text-sm ${activeTab === 'pagos' ? (themeMode === 'dark' ? 'bg-slate-700 text-white font-bold' : 'bg-white text-red-900 font-bold') : themeMode === 'dark' ? 'text-slate-400' : 'text-slate-400'}`}
              >
                Pagos
              </button>
              {activeViewMode === 'admin' && (
                <button
                  onClick={() => { setActiveTab('parroquias'); setIsMobileMenuOpen(false); }}
                  className={`px-3 py-2 rounded-lg text-left font-medium text-sm ${activeTab === 'parroquias' ? 'bg-emerald-600 text-white font-bold' : themeMode === 'dark' ? 'text-slate-400' : 'text-slate-400'}`}
                >
                  Parroquias & Diaconías
                </button>
              )}

              {(activeViewMode === 'admin' || activeViewMode === 'coordinador' || activeViewMode === 'coordinadorGeneral') && (
                <button
                  onClick={() => { setActiveTab('admin'); setIsMobileMenuOpen(false); }}
                  className={`px-3 py-2 rounded-lg text-left font-medium text-sm ${activeTab === 'admin' ? 'bg-rose-600 text-white font-bold' : themeMode === 'dark' ? 'text-slate-400' : 'text-slate-400'}`}
                >
                  Gestión Usuarios
                </button>
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
            attendanceType={attendanceType}
            setAttendanceType={setAttendanceType}
            dashboardGroupId={dashboardGroupId}
            setDashboardGroupId={setDashboardGroupId}
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
            currentUser={userData || user}
            userRole={userRole}
            cardBgClass={cardBgClass}
            inputBgClass={inputBgClass}
            isEnrollmentEnabled={isEnrollmentEnabled}
            setIsEnrollmentEnabled={setIsEnrollmentEnabled}
            students={students}
            paymentRecords={paymentRecords}
            groups={groups}
            parroquias={parroquias}
            diaconias={diaconias}
            setGroups={setGroups}
            setStudents={setStudents}
            handleDeleteStudent={handleDeleteStudent}
            handleStartEditStudent={handleStartEditStudent}
            allUsers={allUsers}
            fetchAllData={fetchAllData}
          />
        )}
        {activeTab === 'enrollment' && (
          (isEnrollmentEnabled && userData?.canEnroll !== false) ? (
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
              onNavigate={(tab) => setActiveTab(tab)}
              cardBgClass={cardBgClass}
              inputBgClass={inputBgClass}
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
                      <div key={p.id} className="py-2 text-sm font-semibold flex justify-between">
                        <span>{p.name}</span>
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
                        <div key={d.id} className="py-2 text-xs flex justify-between">
                          <span className="font-semibold">{d.name}</span>
                          <span className="text-slate-500">({par?.name || 'Sin Parroquia'})</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
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

      {isUserNameModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex justify-center items-center p-4">
          <div className={`${cardBgClass} rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Preferencias</h3>
              <button onClick={() => setIsUserNameModalOpen(false)} className="text-slate-400 hover:text-white text-sm">Cerrar</button>
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
        editingStudentId={editingStudentId}
        setEditingStudentId={setEditingStudentId}
        editStudentName={editStudentName}
        setEditStudentName={setEditStudentName}
        editStudentParentEmail={editStudentParentEmail}
        setEditStudentParentEmail={setEditStudentParentEmail}
        editStudentParentPhone={editStudentParentPhone}
        setEditStudentParentPhone={setEditStudentParentPhone}
        handleSaveStudentEdit={handleSaveStudentEdit}
        handleStartEditStudent={handleStartEditStudent}
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
      />

      {messageModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[60] flex justify-center items-center p-4">
          <div className={`${cardBgClass} rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4`}>
            <div className="flex justify-between items-start gap-3">
              <div>
                <h3 className="text-lg font-bold">Mensaje para {messageModal.student.name}</h3>
                <p className="text-xs text-slate-400">Copia el mensaje y pégalo en el canal seleccionado.</p>
              </div>
              <button onClick={() => setMessageModal(null)} className="bg-red-900 text-white px-3 py-1.5 rounded-lg text-xs font-bold">Cancelar</button>
            </div>
            <textarea readOnly value={messageModal.message} rows="9" className={`w-full rounded-lg px-3 py-2 text-sm resize-none ${inputBgClass}`} />
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={() => navigator.clipboard.writeText(messageModal.message)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-bold">Copiar mensaje</button>
              {messageModal.channel === 'email' && <a href={`mailto:${messageModal.student.parentEmail}`} className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg text-xs font-bold">Abrir correo</a>}
              {messageModal.channel === 'phone' && <a href={buildWhatsAppLink(messageModal.student.parentPhone, messageModal.message)} target="_blank" rel="noreferrer" className="bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-xs font-bold">Abrir WhatsApp</a>}
            </div>
          </div>
        </div>
      )}

      {paymentProofModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[60] flex justify-center items-center p-3">
          <div className={`${cardBgClass} rounded-2xl w-full max-w-sm flex flex-col shadow-2xl`} style={{ maxHeight: 'calc(100dvh - 24px)' }}>
            <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0">
              <h3 className="text-sm font-bold truncate pr-2">{paymentProofModal.title}</h3>
              <button type="button" onClick={() => setPaymentProofModal(null)} className="bg-red-900 text-white px-3 py-1.5 rounded-lg text-xs font-bold shrink-0">Cerrar</button>
            </div>

            <div className="flex justify-center items-center flex-1 min-h-0 overflow-hidden px-3 pb-2">
              <img
                src={paymentProofModal.imageUrl}
                alt="Comprobante de pago"
                className="rounded-lg border border-slate-700 bg-white shadow-lg"
                style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', objectFit: 'contain', display: 'block' }}
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

              <p className="text-xs text-slate-400 bg-slate-800/40 p-2.5 rounded-lg border border-slate-700">
                El grupo se creará automáticamente asignado a tu parroquia y diaconía.
              </p>

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
              <h3 className="text-lg sm:text-xl font-bold text-amber-400">Editar Expediente / Matrícula</h3>
              <button
                onClick={() => setEditingEnrollmentStudent(null)}
                className="text-slate-400 hover:text-white text-base font-bold px-3 py-1 bg-slate-800 rounded-lg"
              >
                ✕ Cerrar
              </button>
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
              onNavigate={() => {
                setEditingEnrollmentStudent(null);
                fetchAllData();
              }}
              cardBgClass={cardBgClass}
              inputBgClass={inputBgClass}
            />
          </div>
        </div>
      )}
    </div>
  );
}