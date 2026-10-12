import { useEffect } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { normalizeStudentRecord } from '../services/firestoreDataMappers';

export function useRealtimeSubscriptions({
  user,
  setIssuedCertificates,
  setPaymentRecords,
  setIsEnrollmentEnabled,
  setStudents,
  setAttendanceRemindersEnabled,
  setAttendanceRemindersConfigReady,
  setHasPendingWrites
}) {
  useEffect(() => {
    if (!user) return undefined;

    const pendingWritesBySource = new Map();
    const updatePendingWrites = (source, snapshot) => {
      pendingWritesBySource.set(source, snapshot.metadata.hasPendingWrites);
      setHasPendingWrites([...pendingWritesBySource.values()].some(Boolean));
    };
    const snapshotOptions = { includeMetadataChanges: true };

    const unsubscribeStudents = onSnapshot(collection(db, 'students'), snapshotOptions, (snapshot) => {
      setStudents(snapshot.docs.map(normalizeStudentRecord));
      updatePendingWrites('students', snapshot);
    }, (error) => {
      console.warn('Error escuchando catequizandos en tiempo real:', error);
    });

    const unsubscribeCertificates = onSnapshot(collection(db, 'certificates'), snapshotOptions, (snapshot) => {
      setIssuedCertificates(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
      updatePendingWrites('certificates', snapshot);
    }, (error) => {
      console.warn('Error escuchando certificados en tiempo real:', error);
    });

    const unsubscribePayments = onSnapshot(collection(db, 'payments'), snapshotOptions, (snapshot) => {
      const payments = snapshot.docs
        .map(item => ({ id: item.id, ...item.data() }))
        .sort((a, b) => new Date(b.dateTime || b.date || 0) - new Date(a.dateTime || a.date || 0));
      setPaymentRecords(payments);
      updatePendingWrites('payments', snapshot);
    }, (error) => {
      console.warn('Error escuchando pagos en tiempo real:', error);
    });

    const unsubscribeEnrollmentConfig = onSnapshot(doc(db, 'config', 'enrollment'), snapshotOptions, (snapshot) => {
      if (snapshot.exists()) setIsEnrollmentEnabled(snapshot.data().enabled !== false);
      updatePendingWrites('enrollmentConfig', snapshot);
    }, (error) => {
      console.warn('Error escuchando estado de matrícula:', error);
    });

    const unsubscribeAttendanceReminders = onSnapshot(doc(db, 'config', 'attendanceReminders'), snapshotOptions, (snapshot) => {
      setAttendanceRemindersEnabled(snapshot.exists() && snapshot.data().enabled === true);
      setAttendanceRemindersConfigReady(true);
      updatePendingWrites('attendanceReminders', snapshot);
    }, (error) => {
      console.warn('Error escuchando la configuración de recordatorios:', error);
    });

    const unsubscribeCurrentUser = onSnapshot(doc(db, 'users', user.uid), snapshotOptions, (snapshot) => {
      updatePendingWrites('currentUser', snapshot);
    }, (error) => {
      console.warn('Error escuchando el estado de sincronización del usuario:', error);
    });

    return () => {
      unsubscribeStudents();
      unsubscribeCertificates();
      unsubscribePayments();
      unsubscribeEnrollmentConfig();
      unsubscribeAttendanceReminders();
      unsubscribeCurrentUser();
    };
  }, [setAttendanceRemindersConfigReady, setAttendanceRemindersEnabled, setHasPendingWrites, setIssuedCertificates, setIsEnrollmentEnabled, setPaymentRecords, setStudents, user]);
}
