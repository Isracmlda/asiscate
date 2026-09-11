import { useEffect } from 'react';
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export function useInventoryCleanup({
  activeTab,
  userRole,
  inventoryItems,
  inventoryReservations,
  setInventoryItems,
  setInventoryReservations
}) {
  useEffect(() => {
    if (activeTab !== 'inventario' || !userRole || userRole === 'catequista') return undefined;

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
  }, [activeTab, userRole, inventoryItems, inventoryReservations, setInventoryItems, setInventoryReservations]);
}
