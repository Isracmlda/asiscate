import { useEffect } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';

export function useRealtimeSubscriptions({ user, setIssuedCertificates, setPaymentRecords, setIsEnrollmentEnabled }) {
  useEffect(() => {
    if (!user) return undefined;

    const unsubscribeCertificates = onSnapshot(collection(db, 'certificates'), (snapshot) => {
      setIssuedCertificates(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
    }, (error) => {
      console.warn('Error escuchando certificados en tiempo real:', error);
    });

    const unsubscribePayments = onSnapshot(collection(db, 'payments'), (snapshot) => {
      const payments = snapshot.docs
        .map(item => ({ id: item.id, ...item.data() }))
        .sort((a, b) => new Date(b.dateTime || b.date || 0) - new Date(a.dateTime || a.date || 0));
      setPaymentRecords(payments);
    }, (error) => {
      console.warn('Error escuchando pagos en tiempo real:', error);
    });

    const unsubscribeEnrollmentConfig = onSnapshot(doc(db, 'config', 'enrollment'), (snapshot) => {
      if (snapshot.exists()) setIsEnrollmentEnabled(snapshot.data().enabled !== false);
    }, (error) => {
      console.warn('Error escuchando estado de matrícula:', error);
    });

    return () => {
      unsubscribeCertificates();
      unsubscribePayments();
      unsubscribeEnrollmentConfig();
    };
  }, [setIssuedCertificates, setIsEnrollmentEnabled, setPaymentRecords, user]);
}
