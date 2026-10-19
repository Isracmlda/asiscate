import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config/firebase';

/**
 * Mantiene la suscripción de autenticación separada de la vista principal.
 * Las callbacks se guardan en un ref para que cambios de render no creen
 * suscripciones duplicadas en Firebase.
 */
export function useAuthSession({ resolveUser, loadData, onResolved, onSignedOut, beforeResolve }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const authEventVersionRef = useRef(0);
  const callbacksRef = useRef({ resolveUser, loadData, onResolved, onSignedOut, beforeResolve });

  useEffect(() => {
    callbacksRef.current = { resolveUser, loadData, onResolved, onSignedOut, beforeResolve };
  }, [resolveUser, loadData, onResolved, onSignedOut, beforeResolve]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      const eventVersion = ++authEventVersionRef.current;
      const isLatestEvent = () => authEventVersionRef.current === eventVersion;
      setLoading(true);
      const callbacks = callbacksRef.current;

      try {
        if (currentUser && callbacks.beforeResolve && !(await callbacks.beforeResolve(currentUser))) {
          if (!isLatestEvent()) return;
          setUser(null);
          callbacks.onSignedOut?.();
        } else if (currentUser) {
          if (!isLatestEvent()) return;
          setUser(currentUser);
          const resolvedRole = await callbacks.resolveUser(currentUser);
          if (!isLatestEvent()) return;
          callbacks.onResolved?.(resolvedRole);
          await callbacks.loadData();
        } else {
          if (!isLatestEvent()) return;
          setUser(null);
          callbacks.onSignedOut?.();
        }
      } catch (error) {
        if (!isLatestEvent()) return;
        console.error('No se pudo completar la carga de la sesión:', error);
        // Keep the Firebase-authenticated user signed in if profile loading fails.
        if (currentUser) setUser(currentUser);
      } finally {
        if (isLatestEvent()) setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return { user, loading, setLoading };
}
