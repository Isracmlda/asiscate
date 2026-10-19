import { useEffect, useRef, useState } from 'react';
import { AsisCateLogo } from './Shared/AsisCateLogo';
import { MaterialIcon } from './Shared/MaterialIcon';
import { checkInStudentWithAttendanceQr, getStudentAttendanceQrSessionInfo } from '../services/studentAttendanceQrService';

const formatDate = value => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || '');
};

const parseStudentId = value => {
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'string') return parsed;
    if (!parsed || typeof parsed !== 'object' || parsed.type === 'catechist') return '';
    return String(parsed.studentId || parsed.id || '');
  } catch {
    return String(value || '').trim();
  }
};

const getCurrentPosition = () => new Promise((resolve, reject) => {
  if (!navigator.geolocation) {
    reject(new Error('Este dispositivo no ofrece acceso a la ubicación.'));
    return;
  }
  navigator.geolocation.getCurrentPosition(resolve, reject, {
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 0
  });
});

export function StudentAttendanceQrPage({ sessionId, themeMode = 'light' }) {
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const busyRef = useRef(false);
  const lastScannedStudentRef = useRef('');
  const mountedRef = useRef(true);

  const isDark = themeMode === 'dark';

  useEffect(() => {
    mountedRef.current = true;
    getStudentAttendanceQrSessionInfo(sessionId)
      .then(data => { if (mountedRef.current) setSession(data); })
      .catch(error => {
        console.error('No se pudo validar la sesión QR de asistencia:', error);
        if (mountedRef.current) setSessionError('Este enlace de asistencia no es válido o ya venció. Pide a la catequista que genere uno nuevo.');
      })
      .finally(() => { if (mountedRef.current) setSessionLoading(false); });
    return () => {
      mountedRef.current = false;
      streamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, [sessionId]);

  useEffect(() => {
    if (sessionLoading || !session || session.isOpen || session.expired) return undefined;
    const intervalId = window.setInterval(() => {
      getStudentAttendanceQrSessionInfo(sessionId)
        .then(setSession)
        .catch(error => console.warn('No se pudo actualizar el estado del registro QR:', error));
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [session?.expired, session?.isOpen, sessionId, sessionLoading]);

  useEffect(() => {
    if (!scanning) {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      return undefined;
    }

    let active = true;
    let timeoutId;
    let detector;

    const scanLoop = async () => {
      if (!active || !videoRef.current?.videoWidth) {
        if (active) timeoutId = window.setTimeout(scanLoop, 250);
        return;
      }

      try {
        const codes = await detector.detect(videoRef.current);
        const rawValue = codes?.[0]?.rawValue;
        const studentId = rawValue ? parseStudentId(rawValue) : '';
        if (!studentId) lastScannedStudentRef.current = '';
        if (studentId && studentId !== lastScannedStudentRef.current && !busyRef.current) {
          lastScannedStudentRef.current = studentId;
          busyRef.current = true;
          setScanBusy(true);
          setLastResult(null);
          try {
            const position = await getCurrentPosition();
            const result = await checkInStudentWithAttendanceQr({
              sessionId,
              studentId,
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy
            });
            setLastResult(result);
          } catch (error) {
            console.error('Error validando asistencia por QR:', error);
            const message = error?.code === 1
              ? 'Permite el acceso a la ubicación para comprobar que estás en el encuentro.'
              : error?.code === 3
                ? 'No se pudo obtener la ubicación a tiempo. Inténtalo de nuevo en un lugar abierto.'
                : error?.message || 'No se pudo validar la asistencia. Inténtalo de nuevo.';
            setLastResult({ status: 'error', message });
          } finally {
            if (active) {
              setScanBusy(false);
              window.setTimeout(() => { busyRef.current = false; }, 1200);
            }
          }
        }
      } catch (error) {
        console.warn('No se pudo leer el QR del carnet:', error);
      }

      if (active) timeoutId = window.setTimeout(scanLoop, 350);
    };

    const startCamera = async () => {
      try {
        if (!('BarcodeDetector' in window)) {
          throw new Error('Este navegador no permite leer QR desde la cámara. Prueba con Chrome o Edge actualizado.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false
        });
        if (!active) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        scanLoop();
      } catch (error) {
        if (active) {
          setScanning(false);
          setCameraError(error?.name === 'NotAllowedError'
            ? 'Permite el acceso a la cámara para escanear el carnet.'
            : error?.message || 'No se pudo iniciar la cámara.');
        }
      }
    };

    startCamera();
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      busyRef.current = false;
      lastScannedStudentRef.current = '';
    };
  }, [scanning, sessionId]);

  const startScanning = async () => {
    setCameraError('');
    setLastResult(null);
    if (!session?.isOpen) {
      setCameraError('La catequista todavía no ha abierto el registro de asistencia.');
      return;
    }
    try {
      await getCurrentPosition();
      setScanning(true);
    } catch (error) {
      setCameraError(error?.code === 1
        ? 'Permite el acceso a la ubicación para registrar asistencia.'
        : error?.code === 3
          ? 'No se pudo obtener la ubicación. Inténtalo de nuevo en un lugar abierto.'
          : error?.message || 'No se pudo obtener tu ubicación.');
    }
  };

  return (
    <main className={`min-h-screen flex items-center justify-center p-4 ${isDark ? 'bg-black text-white' : 'bg-gradient-to-br from-red-50 to-slate-100 text-slate-800'}`}>
      <section className={`w-full max-w-lg rounded-3xl border p-5 text-center shadow-xl sm:p-8 ${isDark ? 'border-neutral-800 bg-neutral-950' : 'border-red-100 bg-white'}`}>
        <AsisCateLogo className="mx-auto mb-4 h-14 w-14" />
        <h1 className="text-2xl font-extrabold">Asistencia del encuentro</h1>

        {sessionLoading ? (
          <div className="mt-8 flex flex-col items-center gap-3 text-sm text-slate-400">
            <div className="h-9 w-9 animate-spin rounded-full border-4 border-emerald-500/25 border-t-emerald-500" />
            Validando el enlace…
          </div>
        ) : sessionError ? (
          <div className="mt-6 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-5 text-sm text-rose-500">{sessionError}</div>
        ) : (
          <>
            <div className={`mt-5 rounded-2xl border p-4 text-left ${isDark ? 'border-neutral-800 bg-black' : 'border-slate-200 bg-slate-50'}`}>
              <p className="font-bold">{session?.groupName || 'Grupo de catequesis'}</p>
              <p className="mt-1 text-sm text-slate-500">{formatDate(session?.date)}{session?.label ? ` · ${session.label}` : ''}</p>
              <p className={`mt-3 flex items-center gap-2 text-xs font-bold ${session?.isOpen ? 'text-emerald-500' : 'text-rose-500'}`}>
                <span className={`h-2 w-2 rounded-full ${session?.isOpen ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                {session?.isOpen ? 'Registro abierto' : session?.expired ? 'Este QR venció' : 'Registro cerrado'}
              </p>
            </div>

            {scanning && <video ref={videoRef} playsInline muted autoPlay className="mt-5 max-h-[55vh] w-full rounded-2xl bg-black object-cover" />}
            {!scanning && session?.isOpen && (
              <div className={`mt-5 rounded-2xl border border-dashed p-8 ${isDark ? 'border-neutral-700 bg-black/50' : 'border-slate-300 bg-slate-50'}`}>
                <MaterialIcon name="qr_code_scanner" className="text-5xl text-emerald-500" />
                <p className="mt-3 text-sm text-slate-500">Escanea el QR del carnet del catequizando para registrar su asistencia.</p>
              </div>
            )}

            {scanBusy && <p role="status" className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-slate-400"><span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500/30 border-t-emerald-500" /> Comprobando ubicación y asistencia…</p>}
            {lastResult && (
              <div role="status" className={`mt-4 rounded-xl border p-3 text-sm font-semibold ${['success', 'already_registered'].includes(lastResult.status) ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' : 'border-rose-500/30 bg-rose-500/10 text-rose-500'}`}>
                <MaterialIcon name={['success', 'already_registered'].includes(lastResult.status) ? 'check_circle' : 'error'} className="mr-1 align-middle" />
                {lastResult.status === 'success'
                  ? `Asistencia registrada para ${lastResult.studentName}.`
                  : lastResult.status === 'already_registered'
                    ? `${lastResult.studentName} ya tenía asistencia registrada.`
                    : lastResult.message || 'No se pudo registrar la asistencia.'}
              </div>
            )}
            {cameraError && <p role="alert" className="mt-4 rounded-xl bg-rose-500/10 p-3 text-sm font-semibold text-rose-500">{cameraError}</p>}

            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {!scanning ? (
                <button type="button" onClick={startScanning} disabled={!session?.isOpen} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50">
                  <MaterialIcon name="qr_code_scanner" /> Activar cámara y ubicación
                </button>
              ) : (
                <button type="button" onClick={() => { setScanning(false); setCameraError(''); }} className="flex items-center justify-center gap-2 rounded-xl bg-slate-700 px-4 py-3 font-bold text-white transition hover:bg-slate-600">
                  <MaterialIcon name="stop_circle" /> Detener escáner
                </button>
              )}
              <p className="flex items-center justify-center gap-2 rounded-xl border border-slate-500/20 px-3 py-3 text-xs text-slate-500"><MaterialIcon name="my_location" /> La ubicación solo se usa para comprobar el área de 200 m; no se guarda.</p>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
