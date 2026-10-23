import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MaterialIcon } from '../Shared/MaterialIcon';
import { firebaseConfig } from '../../config/firebaseConfig';
import {
  createStudentAttendanceQrSession,
  getStudentAttendanceQrSessionInfo,
  setStudentAttendanceQrSessionOpen
} from '../../services/studentAttendanceQrService';

const attendanceBrowserGateway = String(import.meta.env.VITE_STUDENT_ATTENDANCE_WORKER_URL || '').replace(/\/+$/, '');

function buildAttendanceBrowserLink(parameters, fallbackOrigin) {
  const url = new URL(attendanceBrowserGateway ? `${attendanceBrowserGateway}/open` : fallbackOrigin);
  Object.entries(parameters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  return url.toString();
}

const getCurrentDeviceLocation = () => new Promise((resolve, reject) => {
  if (!navigator.geolocation) {
    reject(new Error('Este dispositivo no ofrece acceso a la ubicación.'));
    return;
  }
  navigator.geolocation.getCurrentPosition(resolve, reject, {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 0
  });
});

function AnimatedHeight({ children, open = true, className = '', bottomOverflow = 0 }) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return undefined;

    let frameId = 0;
    const updateHeight = () => {
      const nextHeight = open ? content.scrollHeight + bottomOverflow : 0;
      const currentHeight = container.getBoundingClientRect().height;

      if (container.dataset.heightInitialized !== 'true') {
        container.style.height = `${nextHeight}px`;
        container.dataset.heightInitialized = 'true';
        return;
      }

      if (Math.abs(currentHeight - nextHeight) < 1) return;

      container.style.height = `${currentHeight}px`;
      container.getBoundingClientRect();
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        container.style.height = `${nextHeight}px`;
      });
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(content);

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frameId);
    };
  }, [open, bottomOverflow]);

  return (
    <div
      ref={containerRef}
      className={`overflow-hidden transition-[height] duration-300 ease-in-out motion-reduce:transition-none ${className}`}
      style={{ height: 0 }}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  );
}

export function DashboardView({
  userData,
  user,
  legacyPanelEnabled,
  setIsImportModalOpen,
  cardBgClass,
  dashboardPanelOpen,
  setDashboardPanelOpen,
  attendanceType,
  setAttendanceType,
  dashboardGroupId,
  setDashboardGroupId,
  dashboardAttendanceType,
  setDashboardAttendanceType,
  userRole,
  visibleGroups,
  dashboardDate,
  setDashboardDate,
  browserThemeStyle,
  inputBgClass,
  themeMode,
  dashboardAttendanceStats,
  AssistantWidget,
  absentRate,
  activeViewMode,
  labelTextClass,
  attendanceDate,
  setAttendanceDate,
  setAttendanceLabel,
  getAttendanceLabel,
  visibleStudents,
  selectedGroupId,
  attendanceLabel,
  attendanceLabelSaveTimeoutRef,
  handleSaveAttendanceLabelForDate,
  setSelectedGroupId,
  handleScanQr,
  setDeleteDateTarget,
  diaconias,
  getAttendanceStatus,
  handleMarkAttendance,
  handleOpenAttendanceMessage,
  handleCopyAttendanceContact,
  handleCreateGroup,
  newGroupName,
  setNewGroupName,
  newGroupYear,
  setNewGroupYear,
  newGroupDay,
  setNewGroupDay,
  newGroupTime,
  setNewGroupTime,
  newGroupRoom,
  setNewGroupRoom,
  groupScheduleOptions = { days: [], times: [], rooms: [] },
  newGroupParroquia,
  setNewGroupParroquia,
  newGroupDiaconia,
  setNewGroupDiaconia,
  parroquias,
  handleAddStudent,
  newStudentName,
  setNewStudentName,
  newStudentParentEmail,
  setNewStudentParentEmail,
  selectedGroupForStudent,
  setSelectedGroupForStudent
}) {
  const [hoveredDonutSegment, setHoveredDonutSegment] = useState(null);
  const [isAttendanceSummaryOpen, setIsAttendanceSummaryOpen] = useState(false);
  const [isAssistantSectionOpen, setIsAssistantSectionOpen] = useState(true);
  const [isFormationQrOpen, setIsFormationQrOpen] = useState(false);
  const [attendanceLocationModal, setAttendanceLocationModal] = useState(null);
  const [formationLinkCopied, setFormationLinkCopied] = useState(false);
  const [formationPdfBusy, setFormationPdfBusy] = useState(false);
  const [formationPdfError, setFormationPdfError] = useState('');
  const [isStudentAttendanceQrOpen, setIsStudentAttendanceQrOpen] = useState(false);
  const [studentAttendanceQrSession, setStudentAttendanceQrSession] = useState(null);
  const [studentQrSessionLoading, setStudentQrSessionLoading] = useState(false);
  const [studentQrBusy, setStudentQrBusy] = useState(false);
  const [studentQrError, setStudentQrError] = useState('');
  const [studentQrCopied, setStudentQrCopied] = useState(false);
  const studentQrBusyRef = useRef(false);
  const sortedAttendanceStudents = visibleStudents
    .filter(student => student.groupId === selectedGroupId)
    .sort((a, b) => String(a.name || a.fullName || '').localeCompare(String(b.name || b.fullName || ''), 'es', { sensitivity: 'base' }));
  const selectedAttendanceGroup = visibleGroups.find(group => group.id === selectedGroupId);
  const selectedDashboardGroup = visibleGroups.find(group => group.id === dashboardGroupId);
  const isCatechistAttendanceGroup = selectedAttendanceGroup?.type === 'catequistas';
  const studentQrStorageKey = selectedGroupId && attendanceDate
    ? `asiscate-student-attendance-qr:${selectedGroupId}:${attendanceDate}:${attendanceType}`
    : '';
  const studentAttendanceQrUrl = studentAttendanceQrSession?.sessionId
    && studentAttendanceQrSession.groupId === selectedGroupId
    && studentAttendanceQrSession.date === attendanceDate
    ? (() => {
      const fallbackOrigin = typeof window === 'undefined' ? `https://${firebaseConfig.projectId}.firebaseapp.com/` : window.location.origin;
      return buildAttendanceBrowserLink({ studentAttendanceQr: '1', sessionId: studentAttendanceQrSession.sessionId }, fallbackOrigin);
    })()
    : '';

  useEffect(() => {
    if (!isStudentAttendanceQrOpen || !studentQrStorageKey) return undefined;
    let active = true;
    setStudentQrSessionLoading(true);
    setStudentQrError('');
    const restoreSession = async () => {
      try {
        const savedSessionId = sessionStorage.getItem(studentQrStorageKey);
        if (!savedSessionId) {
          if (active) setStudentAttendanceQrSession(null);
          return;
        }
        const session = await getStudentAttendanceQrSessionInfo(savedSessionId);
        if (active) setStudentAttendanceQrSession(session);
      } catch (error) {
        console.warn('No se pudo recuperar el QR del encuentro:', error);
        try { sessionStorage.removeItem(studentQrStorageKey); } catch { /* El almacenamiento puede estar deshabilitado. */ }
        if (active) setStudentAttendanceQrSession(null);
      } finally {
        if (active) setStudentQrSessionLoading(false);
      }
    };
    restoreSession();
    return () => { active = false; };
  }, [isStudentAttendanceQrOpen, studentQrStorageKey]);

  const createStudentQrSession = async () => {
    if (!selectedGroupId || !attendanceDate || studentQrBusyRef.current) return;
    studentQrBusyRef.current = true;
    setStudentQrBusy(true);
    setStudentQrError('');
    try {
      const position = await getCurrentDeviceLocation();
      const session = await createStudentAttendanceQrSession({
        groupId: selectedGroupId,
        date: attendanceDate,
        label: attendanceLabel,
        attendanceType,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      });
      setStudentAttendanceQrSession(session);
      if (studentQrStorageKey) {
        try { sessionStorage.setItem(studentQrStorageKey, session.sessionId); } catch { /* El QR funciona aunque no se pueda guardar localmente. */ }
      }
    } catch (error) {
      console.error('No se pudo abrir el registro QR del encuentro:', error);
      setStudentQrError(error?.code === 1
        ? 'Permite la ubicación del navegador para establecer el punto de referencia del encuentro.'
        : error?.code === 3
          ? 'No se pudo obtener la ubicación a tiempo. Inténtalo nuevamente en un lugar abierto.'
          : error?.message || 'No se pudo crear el QR del encuentro.');
    } finally {
      studentQrBusyRef.current = false;
      setStudentQrBusy(false);
    }
  };

  const toggleStudentQrSession = async () => {
    if (!studentAttendanceQrSession?.sessionId || studentQrBusyRef.current) return;
    if (studentAttendanceQrSession.expired && !studentAttendanceQrSession.isOpen) {
      setStudentQrError('Este QR venció. Genera un QR nuevo para volver a abrir el registro.');
      return;
    }
    studentQrBusyRef.current = true;
    setStudentQrBusy(true);
    setStudentQrError('');
    try {
      const nextIsOpen = !studentAttendanceQrSession.isOpen;
      await setStudentAttendanceQrSessionOpen(studentAttendanceQrSession.sessionId, nextIsOpen);
      setStudentAttendanceQrSession(previous => ({ ...previous, isOpen: nextIsOpen }));
    } catch (error) {
      console.error('No se pudo cambiar el estado de la asistencia QR:', error);
      setStudentQrError(error?.message || 'No se pudo cambiar el estado del registro.');
    } finally {
      studentQrBusyRef.current = false;
      setStudentQrBusy(false);
    }
  };

  const handleCopyStudentQrLink = async () => {
    if (!studentAttendanceQrUrl) return;
    try {
      await navigator.clipboard.writeText(studentAttendanceQrUrl);
      setStudentQrCopied(true);
      window.setTimeout(() => setStudentQrCopied(false), 2200);
    } catch {
      setStudentQrError('No se pudo copiar el enlace desde este navegador.');
    }
  };
  const formationCheckinUrl = (() => {
    if (!selectedAttendanceGroup || typeof window === 'undefined') return '';
    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const browserOrigin = isLocalhost ? window.location.origin : `https://${firebaseConfig.projectId}.firebaseapp.com`;
    return buildAttendanceBrowserLink({
      formationCheckin: '1',
      groupId: 'catequistas:formacion',
      parroquiaId: selectedAttendanceGroup.parroquiaId || '',
      date: attendanceDate,
      label: attendanceLabel
    }, browserOrigin);
  })();
  const getSelectedAttendanceRecord = student => (student.attendance || []).find(record => (
    record.date === attendanceDate && (record.type || 'encuentro') === attendanceType
  ));
  const handleCopyFormationLink = async () => {
    try {
      await navigator.clipboard.writeText(formationCheckinUrl);
      setFormationLinkCopied(true);
      window.setTimeout(() => setFormationLinkCopied(false), 2200);
    } catch {
      setFormationLinkCopied(false);
    }
  };
  const handleDownloadFormationQrPdf = async () => {
    if (!formationCheckinUrl || formationPdfBusy) return;
    setFormationPdfBusy(true);
    setFormationPdfError('');
    try {
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=900x900&margin=16&ecc=H&data=${encodeURIComponent(formationCheckinUrl)}`;
      const [jsPdfModule, qrResponse] = await Promise.all([import('jspdf'), fetch(qrUrl)]);
      if (!qrResponse.ok) throw new Error('No se pudo descargar el código QR.');
      const qrBlob = await qrResponse.blob();
      const qrDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('No se pudo preparar la imagen del código QR.'));
        reader.readAsDataURL(qrBlob);
      });
      const JsPdf = jsPdfModule.jsPDF || jsPdfModule.default?.jsPDF || jsPdfModule.default;
      const pdf = new JsPdf({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      pdf.setFillColor(127, 29, 29);
      pdf.rect(0, 0, pageWidth, 46, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.text('AsisCate', 18, 17);
      pdf.setFontSize(21);
      pdf.text('Registro de asistencia', 18, 30);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(11);
      pdf.text('Formación de catequistas', 18, 38);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(11);
      pdf.setTextColor(100, 116, 139);
      const formattedAttendanceDate = /^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)
        ? attendanceDate.split('-').reverse().join('/')
        : attendanceDate;
      pdf.text(`Fecha: ${formattedAttendanceDate}`, pageWidth / 2, 61, { align: 'center' });

      const qrSize = 112;
      const qrX = (pageWidth - qrSize) / 2;
      const qrY = 74;
      pdf.setDrawColor(226, 232, 240);
      pdf.setLineWidth(0.8);
      pdf.roundedRect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 10, 4, 4, 'S');
      pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize, undefined, 'FAST');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.setTextColor(31, 41, 55);
      pdf.text('Escanea para registrar tu asistencia', pageWidth / 2, 216, { align: 'center' });

      pdf.save(`QR-formacion-${attendanceDate || 'asistencia'}.pdf`);
    } catch (error) {
      console.error('Error generando PDF del QR de formación:', error);
      setFormationPdfError('No se pudo generar el PDF. Inténtalo de nuevo.');
    } finally {
      setFormationPdfBusy(false);
    }
  };
  const donutSegments = [
    { key: 'present', label: 'Presentes', value: dashboardAttendanceStats.present, color: '#10b981' },
    { key: 'justified', label: 'Justificados', value: dashboardAttendanceStats.justified, color: '#f59e0b' },
    { key: 'absent', label: 'Ausentes', value: dashboardAttendanceStats.absent, color: '#f43f5e' }
  ];
  const donutTotal = dashboardAttendanceStats.total || 0;
  const donutRadius = 38;
  const donutCircumference = 2 * Math.PI * donutRadius;
  let donutOffset = 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h2 className="text-lg sm:text-xl font-bold">
            Bienvenido(a), {(userData?.name || user?.displayName || user?.email || 'Catequista').trim().split(/\s+/)[0]}
          </h2>
        </div>
        {legacyPanelEnabled && (
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2"
          >
            <MaterialIcon name="table_view" /> Cargar Catequizandos en Excel
          </button>
        )}
      </div>

      <div className={`${cardBgClass} p-3 sm:p-4 rounded-xl border shadow-sm`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold">Panel inteligente</h3>
            <p className="text-[11px] text-slate-400">Ausencias y asistente IA</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDashboardPanelOpen(prev => !prev)}
              aria-expanded={dashboardPanelOpen}
              className="dashboard-toggle-button inline-flex items-center gap-1.5 rounded-full border border-sky-400/25 bg-sky-500/10 px-3.5 py-2 text-xs font-bold text-sky-200 shadow-sm transition-all hover:border-sky-300/50 hover:bg-sky-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <MaterialIcon name={dashboardPanelOpen ? 'expand_less' : 'expand_more'} />
              {dashboardPanelOpen ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
        </div>

        <AnimatedHeight open={dashboardPanelOpen} bottomOverflow={8}>
          {dashboardPanelOpen && (
            <div className="mt-3 grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-4">
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => setIsAttendanceSummaryOpen(open => !open)} aria-expanded={isAttendanceSummaryOpen} className="flex min-w-0 flex-1 items-center justify-between rounded-lg py-1 text-left text-sm font-bold text-slate-300 hover:text-sky-300 md:hidden">
                  <span>Consulta de asistencia</span>
                  <MaterialIcon name={isAttendanceSummaryOpen ? 'expand_less' : 'expand_more'} />
                </button>
                <p className="hidden text-sm font-bold text-slate-300 md:block">Consulta de asistencia</p>
                <span className="shrink-0 text-[11px] text-slate-400 uppercase">{dashboardAttendanceType === 'all' ? 'Todas' : dashboardAttendanceType === 'misa' ? 'Misa' : dashboardAttendanceType === 'formacion' ? 'Formación' : 'Encuentro'}</span>
              </div>

              <AnimatedHeight open={isAttendanceSummaryOpen} className="mt-2 md:!h-auto md:!overflow-visible">
              <div className="space-y-4 pb-1">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <select value={dashboardGroupId} onChange={(event) => {
                  const nextGroupId = event.target.value;
                  setDashboardGroupId(nextGroupId);
                  if (visibleGroups.find(group => group.id === nextGroupId)?.type !== 'catequistas' && dashboardAttendanceType === 'formacion') {
                    setDashboardAttendanceType('all');
                  }
                }} className={`col-span-2 min-w-0 rounded-lg px-3 py-2 text-xs sm:col-span-1 ${inputBgClass}`}>
                  <option value="">{userRole === 'catequista' ? 'Todos mis grupos' : 'Todos los grupos visibles'}</option>
                  {visibleGroups.map(group => <option key={group.id} value={group.id}>{group.name}{group.diaconiaName ? ` - ${group.diaconiaName}` : ''}</option>)}
                </select>
                <select value={dashboardAttendanceType} onChange={(event) => setDashboardAttendanceType(event.target.value)} className={`min-w-0 rounded-lg px-3 py-2 text-xs ${inputBgClass}`} aria-label="Tipo de asistencia del gráfico">
                  <option value="all">Todas</option>
                  <option value="encuentro">Encuentro</option>
                  <option value="misa">Misa</option>
                  {selectedDashboardGroup?.type === 'catequistas' && <option value="formacion">Formación</option>}
                </select>
                <input type="date" value={dashboardDate} onChange={(event) => setDashboardDate(event.target.value)} style={browserThemeStyle} aria-label="Fecha de asistencia" className={`min-w-0 rounded-lg px-2 sm:px-3 py-2 text-xs ${inputBgClass}`} />
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3 sm:p-4 flex flex-row items-center gap-3 sm:gap-5">
                <div className="relative h-28 w-28 shrink-0 sm:h-32 sm:w-32">
                  <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-label="Distribución de asistencia">
                    <circle cx="50" cy="50" r={donutRadius} fill="none" stroke={themeMode === 'dark' ? '#334155' : '#cbd5e1'} strokeWidth="18" />
                    {donutSegments.map(segment => {
                      const segmentLength = donutTotal ? (segment.value / donutTotal) * donutCircumference : 0;
                      const segmentOffset = -donutOffset;
                      donutOffset += segmentLength;
                      return segmentLength > 0 ? (
                        <circle
                          key={segment.key}
                          cx="50"
                          cy="50"
                          r={donutRadius}
                          fill="none"
                          stroke={segment.color}
                          strokeWidth="18"
                          strokeDasharray={`${segmentLength} ${donutCircumference - segmentLength}`}
                          strokeDashoffset={segmentOffset}
                          className="cursor-pointer transition-opacity hover:opacity-70"
                          onMouseEnter={() => setHoveredDonutSegment(segment.key)}
                          onMouseLeave={() => setHoveredDonutSegment(null)}
                        >
                          <title>{`${segment.label}: ${donutTotal ? Math.round((segment.value / donutTotal) * 100) : 0}%`}</title>
                        </circle>
                      ) : null;
                    })}
                  </svg>
                  <div className={`pointer-events-none absolute inset-5 rounded-full flex flex-col items-center justify-center ${themeMode === 'dark' ? 'bg-black' : 'bg-white'}`}>
                    <span className="text-2xl font-black">{dashboardAttendanceStats.total}</span>
                    <span className="text-[10px] text-slate-400">registros</span>
                  </div>
                  {hoveredDonutSegment && (() => {
                    const segment = donutSegments.find(item => item.key === hoveredDonutSegment);
                    return segment ? <div className="attendance-chart-tooltip pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-bold shadow-lg">{segment.label}: {donutTotal ? Math.round((segment.value / donutTotal) * 100) : 0}%</div> : null;
                  })()}
                </div>
                <div className="min-w-0 flex-1 space-y-2 text-xs text-slate-400">
                  <div className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Presentes</span><span className={`font-bold ${themeMode === 'dark' ? 'text-emerald-400' : 'text-emerald-700'}`}>{dashboardAttendanceStats.present}</span></div>
                  <div className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />Justificados</span><span className={`font-bold ${themeMode === 'dark' ? 'text-amber-400' : 'text-amber-700'}`}>{dashboardAttendanceStats.justified}</span></div>
                  <div className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" />Ausentes</span><span className={`font-bold ${themeMode === 'dark' ? 'text-rose-400' : 'text-rose-700'}`}>{dashboardAttendanceStats.absent}</span></div>
                  <p className="pt-1 text-[11px] text-slate-500">{dashboardDate ? `Fecha: ${dashboardDate}` : 'Resumen acumulado del grupo'}</p>
                </div>
              </div>
              </div>
              </AnimatedHeight>
            </div>

            <div className="min-w-0 pb-1">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-300">Asistente MarIA</span>
                <button type="button" onClick={() => setIsAssistantSectionOpen(open => !open)} aria-expanded={isAssistantSectionOpen} className="inline-flex items-center gap-1 rounded-full border border-sky-400/20 px-2.5 py-1 text-[11px] font-semibold text-sky-300 transition-colors hover:bg-sky-500/10 md:hidden">
                  <MaterialIcon name={isAssistantSectionOpen ? 'expand_less' : 'expand_more'} />
                  {isAssistantSectionOpen ? 'Contraer' : 'Expandir'}
                </button>
              </div>
              <AnimatedHeight open={isAssistantSectionOpen} bottomOverflow={8} className="md:!h-auto md:!overflow-visible">
              <AssistantWidget 
                attendanceType={dashboardAttendanceType} 
                absentRate={absentRate} 
                userRole={activeViewMode}
                userName={userData?.fullName || user?.displayName || 'Usuario'}
                themeMode={themeMode}
                visibleStudents={visibleStudents}
                visibleGroups={visibleGroups}
                selectedGroupId={selectedGroupId}
                attendanceDate={attendanceDate}
              />
              </AnimatedHeight>
            </div>
            </div>
          )}
        </AnimatedHeight>
      </div>

      {/* SECCIÓN PRINCIPAL DE TOMA DE ASISTENCIA */}
      <div className="space-y-4">
        <div className={`${cardBgClass} p-3 sm:p-6 rounded-xl border shadow-sm space-y-3 sm:space-y-4`}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
              <MaterialIcon name="fact_check" /> {selectedAttendanceGroup?.type === 'catequistas' ? 'Control de Asistencia de Catequistas' : 'Control de Asistencia'}
            </h2>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
            <div>
              <label className={`block text-[10px] sm:text-xs font-bold ${labelTextClass} uppercase mb-1`}>Fecha del Encuentro</label>
              <input
                type="date"
                value={attendanceDate}
                style={browserThemeStyle}
                onChange={(e) => {
                  const date = e.target.value;
                  setAttendanceDate(date);
                  setAttendanceLabel(getAttendanceLabel(sortedAttendanceStudents, date, attendanceType));
                }}
                className={`w-full min-w-0 rounded-lg px-2.5 sm:px-4 py-2 text-xs sm:text-sm ${inputBgClass}`}
              />
            </div>

            <div>
              <label className="block text-[10px] sm:text-xs font-bold text-slate-400 uppercase mb-1">Tipo de asistencia</label>
              <select
                value={attendanceType}
                onChange={(e) => {
                  const nextType = e.target.value;
                  setAttendanceType(nextType);
                  setAttendanceLabel(getAttendanceLabel(sortedAttendanceStudents, attendanceDate, nextType));
                }}
                className={`w-full min-w-0 rounded-lg px-2.5 sm:px-4 py-2 text-xs sm:text-sm ${inputBgClass}`}
              >
                <option value="encuentro">Encuentro</option>
                <option value="misa">Misa</option>
                {selectedAttendanceGroup?.type === 'catequistas' && <option value="formacion">Formación</option>}
              </select>
            </div>

            <div>
              <label className="block text-[10px] sm:text-xs font-bold text-slate-400 uppercase mb-1">
                Tema (Opcional)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder={attendanceType === 'formacion' ? 'Ej. Formación de catequistas' : attendanceType === 'misa' ? 'Ej. Misa de niños' : 'Ej. Encuentro #3 - Los Mandamientos'}
                  value={attendanceLabel}
                  onChange={(e) => {
                    const nextLabel = e.target.value;
                    setAttendanceLabel(nextLabel);
                    if (attendanceLabelSaveTimeoutRef.current) {
                      window.clearTimeout(attendanceLabelSaveTimeoutRef.current);
                    }
                    if (selectedGroupId) {
                      attendanceLabelSaveTimeoutRef.current = window.setTimeout(() => {
                        handleSaveAttendanceLabelForDate(selectedGroupId, attendanceDate, nextLabel, attendanceType);
                      }, 700);
                    }
                  }}
                  onBlur={() => {
                    if (attendanceLabelSaveTimeoutRef.current) {
                      window.clearTimeout(attendanceLabelSaveTimeoutRef.current);
                    }
                    if (selectedGroupId) {
                      handleSaveAttendanceLabelForDate(selectedGroupId, attendanceDate, attendanceLabel, attendanceType);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (attendanceLabelSaveTimeoutRef.current) {
                        window.clearTimeout(attendanceLabelSaveTimeoutRef.current);
                      }
                      if (selectedGroupId) {
                        handleSaveAttendanceLabelForDate(selectedGroupId, attendanceDate, attendanceLabel, attendanceType);
                      }
                    }
                  }}
                  className={`w-full min-w-0 rounded-lg px-2.5 sm:px-4 py-2 text-xs sm:text-sm ${inputBgClass}`}
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] sm:text-xs font-bold text-slate-400 uppercase mb-1">Seleccionar Grupo</label>
              <select
                value={selectedGroupId}
                onChange={(e) => {
                  const groupId = e.target.value;
                  setSelectedGroupId(groupId);
                  const nextType = visibleGroups.find(group => group.id === groupId)?.type === 'catequistas'
                    ? 'formacion'
                    : attendanceType === 'formacion' ? 'encuentro' : attendanceType;
                  setAttendanceType(nextType);
                  setAttendanceLabel(getAttendanceLabel(visibleStudents.filter(student => student.groupId === groupId), attendanceDate, nextType));
                }}
                className={`w-full min-w-0 rounded-lg px-2.5 sm:px-4 py-2 text-xs sm:text-sm ${inputBgClass}`}
              >
                <option value="">Selecciona un Grupo...</option>
                {visibleGroups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}{g.diaconiaName ? ` - ${g.diaconiaName}` : ''} ({g.year || '2026-2027'})</option>
                ))}
              </select>
            </div>

            {selectedGroupId && (
              <div className={`col-span-2 sm:col-span-4 grid grid-cols-2 gap-2 pt-0.5 sm:pt-1 transition-[grid-template-columns] duration-300 ease-out ${isCatechistAttendanceGroup && ['misa', 'encuentro'].includes(attendanceType) ? 'sm:grid-cols-2 lg:grid-cols-2' : 'sm:grid-cols-3 lg:grid-cols-3'}`}>
                {isCatechistAttendanceGroup && attendanceType === 'formacion' && (
                  <button type="button" onClick={() => setIsFormationQrOpen(true)} className="col-span-2 flex w-full min-w-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2 py-2 text-[10px] sm:text-[11px] font-bold text-white hover:bg-emerald-500 sm:col-span-3 lg:col-span-1">
                    <MaterialIcon name="qr_code_2" /> QR para registrar asistencia
                  </button>
                )}
                {!isCatechistAttendanceGroup && ['encuentro', 'misa'].includes(attendanceType) && (
                  <button type="button" onClick={() => { setStudentQrCopied(false); setIsStudentAttendanceQrOpen(true); }} className="col-span-2 flex w-full min-w-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2 py-2 text-[10px] sm:text-[11px] font-bold text-white hover:bg-emerald-500 sm:col-span-3 lg:col-span-1">
                    <MaterialIcon name="qr_code_2" /> QR para asistencia de {attendanceType === 'misa' ? 'misa' : 'catequizandos'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleScanQr}
                  className="order-3 flex w-full min-w-0 items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-2 py-2 text-[10px] sm:order-3 sm:text-[11px] lg:order-none font-bold text-white hover:bg-sky-700"
                >
                  <MaterialIcon name="qr_code_scanner" /> <span>Escanear QR</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteDateTarget({ groupId: selectedGroupId, dateStr: attendanceDate, type: attendanceType })}
                  className="order-2 flex w-full min-w-0 items-center justify-center gap-1.5 rounded-lg bg-rose-600/10 border border-rose-500/50 px-2 py-2 text-[10px] sm:order-2 sm:text-[11px] lg:order-none font-bold text-rose-400 hover:bg-rose-600/20"
                >
                  <MaterialIcon name="delete" /> <span>Borrar asistencia de este encuentro</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <AnimatedHeight open={Boolean(selectedGroupId)}>
          {selectedGroupId ? (
          <div className={`${cardBgClass} rounded-xl border shadow-sm overflow-hidden`}>
            {/* VISTA EN TARJETAS PARA PANTALLAS PEQUEÑAS */}
            <div className="block md:hidden divide-y divide-slate-700">
              {sortedAttendanceStudents.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400 italic">
                  {selectedAttendanceGroup?.type === 'catequistas' ? 'No hay catequistas registrados en este grupo.' : 'No hay Catequizandos matriculados en este grupo.'}
                </div>
              ) : (
                sortedAttendanceStudents.map(student => {
                    const status = getAttendanceStatus(student, attendanceDate);
                    const attendanceRecord = getSelectedAttendanceRecord(student);
                    const displayEmail = student.email || student.parentEmail || student.family?.guardian?.email || student.family?.mother?.email || student.family?.father?.email || '';
                    const displayPhone = student.parentPhone || student.phone || student.family?.guardian?.phone1 || student.family?.mother?.phone1 || student.family?.father?.phone1 || '';
                    const contactStudent = { ...student, parentEmail: displayEmail, parentPhone: displayPhone };
                    return (
                      <div key={student.id} className="p-3 sm:p-4 space-y-2">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h4 className="truncate font-bold text-sm">{student.fullName || student.name}</h4>
                          </div>
                          <div className="inline-flex shrink-0 items-center gap-0 rounded-full border border-slate-600/70 bg-slate-800/70 p-0.5">
                            <button type="button" disabled={!displayEmail} onClick={() => status === null ? handleCopyAttendanceContact(displayEmail, 'Correo') : handleOpenAttendanceMessage(contactStudent, 'email')} title={!displayEmail ? 'Correo no registrado' : status === null ? 'Copiar correo' : 'Preparar mensaje por correo'} aria-label={!displayEmail ? 'Correo no registrado' : status === null ? 'Copiar correo' : 'Preparar mensaje por correo'} className="rounded-full px-2 py-1 text-[14px] leading-none text-sky-400 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"><MaterialIcon name="mail" /></button>
                            <button type="button" disabled={!displayPhone} onClick={() => status === null ? handleCopyAttendanceContact(displayPhone, 'Teléfono') : handleOpenAttendanceMessage(contactStudent, 'phone')} title={!displayPhone ? 'Teléfono no registrado' : status === null ? 'Copiar teléfono' : 'Preparar mensaje por WhatsApp'} aria-label={!displayPhone ? 'Teléfono no registrado' : status === null ? 'Copiar teléfono' : 'Preparar mensaje por WhatsApp'} className="rounded-full px-2 py-1 text-[14px] leading-none text-emerald-400 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"><MaterialIcon name="phone" /></button>
                          </div>
                        </div>

                        <div className="inline-grid w-full grid-cols-3 gap-0.5 rounded-full border border-slate-700/70 bg-slate-900/40 p-0.5">
                          <button
                            onClick={() => handleMarkAttendance(student.id, 'present')}
                            className={`whitespace-nowrap px-1 py-1.5 text-[9px] font-bold rounded-full transition-all sm:text-[10px] ${
                              status === 'present'
                                ? 'bg-emerald-600 border-emerald-500 text-white shadow-sm'
                                : (themeMode === 'dark' ? 'bg-black border-neutral-800 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100')
                            }`}
                          >
                            Presente
                          </button>
                          <button
                            onClick={() => handleMarkAttendance(student.id, 'justified')}
                            className={`whitespace-nowrap px-1 py-1.5 text-[9px] font-bold rounded-full transition-all sm:text-[10px] ${
                              status === 'justified'
                                ? 'bg-amber-500 border-amber-400 text-white shadow-sm'
                                : (themeMode === 'dark' ? 'bg-black border-neutral-800 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100')
                            }`}
                          >
                            Justificada
                          </button>
                          <button
                            onClick={() => handleMarkAttendance(student.id, 'absent')}
                            className={`whitespace-nowrap px-1 py-1.5 text-[9px] font-bold rounded-full transition-all sm:text-[10px] ${
                              status === 'absent'
                                ? 'bg-rose-600 border-rose-500 text-white shadow-sm'
                                : (themeMode === 'dark' ? 'bg-black border-neutral-800 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300' : 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100')
                            }`}
                          >
                            Ausente
                          </button>
                        </div>
                        {attendanceRecord?.location && <button type="button" onClick={() => setAttendanceLocationModal({ member: student, record: attendanceRecord })} title="Ver ubicación en Google Maps" aria-label={`Ver ubicación de ${student.name || student.fullName}`} className="rounded-full border border-sky-500/30 px-2 text-sky-400 hover:bg-sky-500/10"><MaterialIcon name="location_on" /></button>}
                      </div>
                    );
                  })
                )}
            </div>

            {/* VISTA EN TABLA */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-700">
                <thead className={themeMode === 'dark' ? 'bg-black' : 'bg-slate-50'}>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase">{selectedAttendanceGroup?.type === 'catequistas' ? 'Catequista' : 'Catequizando'}</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-slate-400 uppercase">Estado de Asistencia</th>
                    <th className="px-6 py-3 text-right text-xs font-bold text-slate-400 uppercase">Contacto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {sortedAttendanceStudents.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="px-6 py-8 text-center text-slate-400 italic">{selectedAttendanceGroup?.type === 'catequistas' ? 'No hay catequistas registrados en este grupo.' : 'No hay Catequizandos matriculados en este grupo.'}</td>
                    </tr>
                  ) : (
                    sortedAttendanceStudents.map(student => {
                        const status = getAttendanceStatus(student, attendanceDate);
                        const attendanceRecord = getSelectedAttendanceRecord(student);
                        const displayEmail = student.email || student.parentEmail || student.family?.guardian?.email || student.family?.mother?.email || student.family?.father?.email || '';
                        const displayPhone = student.parentPhone || student.phone || student.family?.guardian?.phone1 || student.family?.mother?.phone1 || student.family?.father?.phone1 || '';
                        const contactStudent = { ...student, parentEmail: displayEmail, parentPhone: displayPhone };

                        return (
                          <tr key={student.id} className="hover:bg-slate-700/20 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold">
                              {student.fullName || student.name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className={`inline-flex rounded-lg shadow-sm border p-1 gap-1 ${themeMode === 'dark' ? 'border-neutral-800 bg-black' : 'border-slate-200 bg-white'}`}>
                                <button
                                  onClick={() => handleMarkAttendance(student.id, 'present')}
                                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                                    status === 'present'
                                      ? 'bg-emerald-600 text-white shadow-sm'
                                      : (themeMode === 'dark' ? 'text-emerald-400 hover:bg-emerald-500/10' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100')
                                  }`}
                                >
                                  Presente
                                </button>
                                <button
                                  onClick={() => handleMarkAttendance(student.id, 'justified')}
                                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                                    status === 'justified'
                                      ? 'bg-amber-500 text-white shadow-sm'
                                      : (themeMode === 'dark' ? 'text-amber-400 hover:bg-amber-500/10' : 'bg-amber-50 text-amber-700 hover:bg-amber-100')
                                  }`}
                                >
                                  Justificada
                                </button>
                                <button
                                  onClick={() => handleMarkAttendance(student.id, 'absent')}
                                  className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                                    status === 'absent'
                                      ? 'bg-rose-600 text-white shadow-sm'
                                      : (themeMode === 'dark' ? 'text-rose-400 hover:bg-rose-500/10' : 'bg-rose-50 text-rose-700 hover:bg-rose-100')
                                  }`}
                                >
                                  Ausente
                                </button>
                                {attendanceRecord?.location && <button type="button" onClick={() => setAttendanceLocationModal({ member: student, record: attendanceRecord })} title="Ver ubicación en Google Maps" aria-label={`Ver ubicación de ${student.name || student.fullName}`} className="rounded-md px-2 py-1.5 text-sky-400 hover:bg-sky-500/10"><MaterialIcon name="location_on" /></button>}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <div className="flex justify-end gap-2">
                                <button type="button" disabled={!displayEmail} onClick={() => status === null ? handleCopyAttendanceContact(displayEmail, 'Correo') : handleOpenAttendanceMessage(contactStudent, 'email')} title={!displayEmail ? 'Correo no registrado' : status === null ? 'Copiar correo' : 'Preparar mensaje por correo'} aria-label={!displayEmail ? 'Correo no registrado' : status === null ? 'Copiar correo' : 'Preparar mensaje por correo'} className={`${status === null ? 'rounded-lg border border-slate-500 bg-slate-600/70 p-2 text-slate-200 hover:bg-slate-600' : 'attendance-email-button rounded-lg p-2'} disabled:cursor-not-allowed disabled:opacity-40`}><MaterialIcon name="mail" /></button>
                                <button type="button" disabled={!displayPhone} onClick={() => status === null ? handleCopyAttendanceContact(displayPhone, 'Teléfono') : handleOpenAttendanceMessage(contactStudent, 'phone')} title={!displayPhone ? 'Teléfono no registrado' : status === null ? 'Copiar teléfono' : 'Preparar mensaje por WhatsApp'} aria-label={!displayPhone ? 'Teléfono no registrado' : status === null ? 'Copiar teléfono' : 'Preparar mensaje por WhatsApp'} className={`${status === null ? 'rounded-lg border border-slate-500 bg-slate-600/70 p-2 text-slate-200 hover:bg-slate-600' : 'attendance-phone-button rounded-lg p-2'} disabled:cursor-not-allowed disabled:opacity-40`}><MaterialIcon name="phone" /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="border border-dashed border-slate-700 rounded-xl p-6 text-center text-xs sm:text-sm text-slate-400">
            Selecciona un grupo en la parte superior para pasar lista.
          </div>
          )}
        </AnimatedHeight>
      </div>

      {legacyPanelEnabled ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 pt-4">
            {/* Crear Grupo */}
            <div className={`${cardBgClass} p-4 sm:p-6 rounded-xl border shadow-sm`}>
              <h3 className="text-base sm:text-lg font-bold mb-3 sm:mb-4">Añadir Nuevo Grupo</h3>
              <form onSubmit={handleCreateGroup} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Nombre del Grupo (Ej. Confirmación - A)"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className={`sm:col-span-2 rounded-lg px-4 py-2 text-xs sm:text-sm ${inputBgClass}`}
                  />
                  <input
                    type="text"
                    placeholder="Año (2026-2027)"
                    value={newGroupYear}
                    onChange={(e) => setNewGroupYear(e.target.value)}
                    className={`rounded-lg px-3 py-2 text-xs sm:text-sm ${inputBgClass}`}
                  />
                </div>

                {activeViewMode === 'admin' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select
                      value={newGroupParroquia}
                      onChange={(e) => { setNewGroupParroquia(e.target.value); setNewGroupDiaconia(''); }}
                      className={`w-full rounded-lg px-3 py-2 text-xs ${inputBgClass}`}
                    >
                      <option value="">Parroquia...</option>
                      {parroquias.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <select
                      disabled={!newGroupParroquia}
                      value={newGroupDiaconia}
                      onChange={(e) => setNewGroupDiaconia(e.target.value)}
                      className={`w-full rounded-lg px-3 py-2 text-xs ${inputBgClass}`}
                    >
                      <option value="">Diaconía...</option>
                      {diaconias.filter(d => d.parroquiaId === newGroupParroquia).map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 bg-slate-700/30 p-2 rounded border border-slate-700">
                    Se asignará a tu Parroquia y Diaconía registrada.
                  </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select value={newGroupDay || ''} onChange={event => setNewGroupDay(event.target.value)} className={`rounded-lg px-3 py-2 text-xs ${inputBgClass}`}><option value="">Día...</option>{groupScheduleOptions.days.map(day => <option key={day} value={day}>{day}</option>)}</select>
                  <select value={newGroupTime || ''} onChange={event => setNewGroupTime(event.target.value)} className={`rounded-lg px-3 py-2 text-xs ${inputBgClass}`}><option value="">Horario...</option>{groupScheduleOptions.times.map(time => <option key={time} value={time}>{time}</option>)}</select>
                  <select value={newGroupRoom || ''} onChange={event => setNewGroupRoom(event.target.value)} className={`rounded-lg px-3 py-2 text-xs ${inputBgClass}`}><option value="">Salón...</option>{groupScheduleOptions.rooms.map(room => <option key={room} value={room}>{room}</option>)}</select>
                </div>

                <button
                  type="submit"
                  className="w-full bg-red-800 hover:bg-red-900 text-white font-semibold py-2 rounded-lg text-xs sm:text-sm transition-colors"
                >
                  Crear Grupo
                </button>
              </form>
            </div>

            {/* Crear Catequizando */}
            <div className={`${cardBgClass} p-4 sm:p-6 rounded-xl border shadow-sm`}>
              <h3 className="text-base sm:text-lg font-bold mb-3 sm:mb-4">Inscribir Catequizando</h3>
              <form onSubmit={handleAddStudent} className="space-y-3">
                <input
                  type="text"
                  placeholder="Nombre Completo del Catequizando"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  className={`w-full rounded-lg px-4 py-2 text-xs sm:text-sm ${inputBgClass}`}
                />
                <input
                  type="email"
                  placeholder="Correo de Padres (Opcional)"
                  value={newStudentParentEmail}
                  onChange={(e) => setNewStudentParentEmail(e.target.value)}
                  className={`w-full rounded-lg px-4 py-2 text-xs sm:text-sm ${inputBgClass}`}
                />
                <select
                  value={selectedGroupForStudent}
                  onChange={(e) => setSelectedGroupForStudent(e.target.value)}
                  className={`w-full rounded-lg px-4 py-2 text-xs sm:text-sm ${inputBgClass}`}
                >
                  <option value="">Selecciona un grupo...</option>
                  {visibleGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.name} ({g.year || '2026-2027'})</option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="w-full bg-red-800 hover:bg-red-900 text-white font-semibold py-2 rounded-lg text-xs sm:text-sm transition-colors"
                >
                  Inscribir Catequizando
                </button>
              </form>
            </div>
          </div>

          {/* LISTA DE GRUPOS DISPONIBLES */}
          <div className={`${cardBgClass} p-4 sm:p-6 rounded-xl border shadow-sm`}>
            <h3 className="text-base sm:text-lg font-bold mb-4">Grupos Disponibles ({activeViewMode})</h3>
            {visibleGroups.length === 0 ? (
              <p className="text-xs sm:text-sm text-slate-400 italic">No hay grupos asignados o visibles en esta vista.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {visibleGroups.map(group => {
                  const countStudents = visibleStudents.filter(s => s.groupId === group.id).length;
                  const catechists = group.catechistNames ? group.catechistNames.join(', ') : 'Sin asignar';
                  const parroquiaObj = parroquias.find(p => p.id === group.parroquiaId);
                  const diaconiaObj = diaconias.find(d => d.id === group.diaconiaId);

                  return (
                    <div key={group.id} className={`p-4 border rounded-xl flex flex-col justify-between ${themeMode === 'dark' ? 'bg-black border-neutral-800' : 'bg-slate-50 border-slate-200'}`}>
                      <div>
                        <div className="flex justify-between items-start">
                          <p className="font-bold text-sm sm:text-base">{group.name}</p>
                          <span className={`text-xs px-2 py-0.5 rounded font-mono ${themeMode === 'dark' ? 'bg-neutral-900 text-neutral-300' : 'bg-slate-200 text-slate-600'}`}>
                            {group.year || '2026-2027'}
                          </span>
                        </div>
                        <p className="text-[11px] font-semibold text-emerald-500 mt-0.5">
                          {parroquiaObj?.name || 'Parroquia'} - {diaconiaObj?.name || 'Diaconía'}
                        </p>
                        <p className="text-xs text-slate-400 mt-2">Catequistas: <span className="font-semibold text-slate-300">{catechists}</span></p>
                        <p className="text-xs text-slate-500 mt-1">{countStudents} Catequizandos matriculados</p>
                        {group.isVisibleForCatechists === false && (
                          <span className="inline-block mt-2 text-[10px] bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded font-bold">
                            <MaterialIcon name="lock" /> Oculto a Catequistas
                          </span>
                        )}
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={(event) => { event.stopPropagation(); setSelectedGroupId(group.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                          className="w-full text-center text-xs bg-red-800/10 hover:bg-red-800/20 text-red-700 dark:text-red-400 font-bold px-3 py-2 rounded-lg transition-colors border border-red-800/20"
                        >
                          Tomar Asistencia ↑
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}

      {isStudentAttendanceQrOpen && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onMouseDown={event => event.target === event.currentTarget && setIsStudentAttendanceQrOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="student-attendance-qr-title" className={`${cardBgClass} w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl`}>
            <div className="flex items-center justify-between border-b border-slate-500/20 p-4 sm:p-5">
              <div>
                <h3 id="student-attendance-qr-title" className="text-lg font-bold">Asistencia de {attendanceType === 'misa' ? 'misa' : 'encuentro'}</h3>
                <p className="mt-1 text-xs text-slate-400">{selectedAttendanceGroup?.name || 'Grupo'} · {attendanceDate}</p>
              </div>
              <button type="button" onClick={() => setIsStudentAttendanceQrOpen(false)} aria-label="Cerrar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-500/10"><MaterialIcon name="close" /></button>
            </div>

            <div className="flex flex-col items-center gap-4 p-5 text-center">
              {studentQrSessionLoading ? (
                <div className="flex flex-col items-center gap-3 py-10 text-sm text-slate-400"><div className="h-9 w-9 animate-spin rounded-full border-4 border-emerald-500/25 border-t-emerald-500" />Recuperando sesión de asistencia…</div>
              ) : studentAttendanceQrUrl ? (
                <>
                  <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${studentAttendanceQrSession.isOpen ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                    <span className={`h-2 w-2 rounded-full ${studentAttendanceQrSession.isOpen ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    {studentAttendanceQrSession.expired ? 'QR vencido' : studentAttendanceQrSession.isOpen ? 'Registro abierto' : 'Registro cerrado'}
                  </div>
                  <div className={`rounded-2xl p-3 shadow-lg ${studentAttendanceQrSession.isOpen && !studentAttendanceQrSession.expired ? 'bg-white' : 'bg-white opacity-50'}`}>
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=640x640&margin=12&ecc=H&data=${encodeURIComponent(studentAttendanceQrUrl)}`} alt="Código QR para registrar asistencia al encuentro" className="h-60 w-60 sm:h-72 sm:w-72" />
                  </div>
                  <p className="max-w-sm text-sm text-slate-400">Escanea este QR y luego escanea el carnet del catequizando. Debe estar lo suficientemente cerca del área para marcar asistencia; su ubicación no se guarda.</p>
                  <div className="grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-3">
                    <button type="button" onClick={handleCopyStudentQrLink} className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-500/30 px-2 py-3 text-xs font-bold hover:bg-slate-500/10"><MaterialIcon name={studentQrCopied ? 'check' : 'content_copy'} />{studentQrCopied ? 'Enlace copiado' : 'Copiar enlace'}</button>
                    <a href={`https://wa.me/?text=${encodeURIComponent(`Registra tu asistencia a ${attendanceType === 'misa' ? 'la misa' : 'el encuentro'}: ${studentAttendanceQrUrl}`)}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-2 py-3 text-xs font-bold text-white hover:bg-emerald-500"><MaterialIcon name="chat" /> WhatsApp</a>
                    {studentAttendanceQrSession.expired ? (
                      <button type="button" onClick={createStudentQrSession} disabled={studentQrBusy} className="flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-2 py-3 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-60"><MaterialIcon name="autorenew" /> Nuevo QR</button>
                    ) : (
                      <button type="button" onClick={toggleStudentQrSession} disabled={studentQrBusy} className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-3 text-xs font-bold text-white disabled:opacity-60 ${studentAttendanceQrSession.isOpen ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}><MaterialIcon name={studentQrBusy ? 'hourglass_empty' : studentAttendanceQrSession.isOpen ? 'lock' : 'lock_open'} />{studentQrBusy ? 'Guardando…' : studentAttendanceQrSession.isOpen ? 'Cerrar registro' : 'Abrir registro'}</button>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-2xl border border-dashed border-emerald-500/30 bg-emerald-500/5 p-8">
                    <MaterialIcon name="my_location" className="text-5xl text-emerald-500" />
                    <p className="mt-3 max-w-sm text-sm text-slate-400">Al abrir el registro se guardará la ubicación de este dispositivo como referencia. Los catequizandos deberán estar lo suficientemente cerca del área para marcar asistencia.</p>
                  </div>
                  <button type="button" onClick={createStudentQrSession} disabled={studentQrBusy} className="flex w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-500 disabled:cursor-wait disabled:opacity-60"><MaterialIcon name={studentQrBusy ? 'hourglass_empty' : 'qr_code_2'} />{studentQrBusy ? 'Obteniendo ubicación y creando QR…' : 'Abrir registro y generar QR'}</button>
                </>
              )}
              {studentQrError && <p role="alert" className="w-full max-w-md rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs font-semibold text-rose-400">{studentQrError}</p>}
              <p className="text-[11px] text-slate-500">El registro permanece abierto hasta que lo cierres manualmente desde este modal.</p>
            </div>
          </div>
        </div>
      )}

      {isFormationQrOpen && formationCheckinUrl && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onMouseDown={event => event.target === event.currentTarget && setIsFormationQrOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="formation-qr-title" className={`${cardBgClass} w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl`}>
            <div className="flex items-center justify-between border-b border-slate-500/20 p-4 sm:p-5">
              <div><h3 id="formation-qr-title" className="text-lg font-bold">Registro de asistencia</h3><p className="mt-1 text-xs text-slate-400">{selectedAttendanceGroup?.diaconiaName || selectedAttendanceGroup?.name} · {attendanceDate}</p></div>
              <button type="button" onClick={() => setIsFormationQrOpen(false)} aria-label="Cerrar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-500/10"><MaterialIcon name="close" /></button>
            </div>
            <div className="flex flex-col items-center gap-4 p-5 text-center">
              <p className="max-w-sm text-sm text-slate-400">Cada catequista escanea el código, inicia sesión con su cuenta y confirma el permiso de ubicación para registrar su asistencia.</p>
              <div className="rounded-2xl bg-white p-3 shadow-lg"><img src={`https://api.qrserver.com/v1/create-qr-code/?size=640x640&margin=12&ecc=H&data=${encodeURIComponent(formationCheckinUrl)}`} alt="Código QR para registrar asistencia de formación" className="h-64 w-64 sm:h-80 sm:w-80" /></div>
              <div className="grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-3">
                <button type="button" onClick={handleCopyFormationLink} className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-500/30 px-2 py-3 text-xs font-bold hover:bg-slate-500/10"><MaterialIcon name={formationLinkCopied ? 'check' : 'content_copy'} /> {formationLinkCopied ? 'Enlace copiado' : 'Copiar enlace'}</button>
                <a href={`https://wa.me/?text=${encodeURIComponent(`Registra tu asistencia a la formación: ${formationCheckinUrl}`)}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-2 py-3 text-xs font-bold text-white hover:bg-emerald-500"><MaterialIcon name="chat" /> Enviar por WhatsApp</a>
                <button type="button" onClick={handleDownloadFormationQrPdf} disabled={formationPdfBusy} className="flex items-center justify-center gap-1.5 rounded-xl bg-red-800 px-2 py-3 text-xs font-bold text-white hover:bg-red-700 disabled:cursor-wait disabled:opacity-60"><MaterialIcon name={formationPdfBusy ? 'hourglass_empty' : 'picture_as_pdf'} /> {formationPdfBusy ? 'Generando…' : 'PDF para imprimir'}</button>
              </div>
              {formationPdfError && <p role="alert" className="text-xs font-semibold text-rose-400">{formationPdfError}</p>}
              <p className="text-xs text-slate-500">El registro solo funciona para la cuenta del catequista y la diaconía correspondiente.</p>
            </div>
          </div>
        </div>
      )}

      {attendanceLocationModal?.record?.location && (() => {
        const { latitude, longitude, accuracy } = attendanceLocationModal.record.location;
        const mapUrl = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
        return (
          <div className="fixed inset-0 z-[145] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onMouseDown={event => event.target === event.currentTarget && setAttendanceLocationModal(null)}>
            <div role="dialog" aria-modal="true" aria-labelledby="attendance-location-title" className={`${cardBgClass} w-full max-w-3xl overflow-hidden rounded-2xl border shadow-2xl`}>
              <div className="flex items-center justify-between border-b border-slate-500/20 p-4">
                <div><h3 id="attendance-location-title" className="font-bold">Ubicación del registro</h3><p className="mt-1 text-xs text-slate-400">{attendanceLocationModal.member.name || attendanceLocationModal.member.fullName} · Precisión aproximada {Math.round(accuracy || 0)} m</p></div>
                <button type="button" onClick={() => setAttendanceLocationModal(null)} aria-label="Cerrar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-500/10"><MaterialIcon name="close" /></button>
              </div>
              <iframe title={`Mapa de asistencia de ${attendanceLocationModal.member.name || attendanceLocationModal.member.fullName}`} src={`https://maps.google.com/maps?q=${latitude},${longitude}&z=16&output=embed`} className="h-[min(65vh,30rem)] w-full border-0" loading="lazy" />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-500/20 p-4 text-xs text-slate-400"><span>{latitude.toFixed(6)}, {longitude.toFixed(6)}</span><a href={mapUrl} target="_blank" rel="noreferrer" className="font-semibold text-sky-400 hover:underline">Abrir en Google Maps <MaterialIcon name="open_in_new" /></a></div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
