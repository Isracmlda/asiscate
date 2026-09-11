import { doc, setDoc } from 'firebase/firestore';

export const savePaymentRecord = async (db, paymentRecord) => {
  await setDoc(doc(db, 'payments', paymentRecord.id), paymentRecord);
  return paymentRecord;
};
