import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../config/firebase';

/**
 * Mantiene la suscripción de autenticación separada de la vista principal.
 * Las callbacks se guardan en un ref para que cambios de render no creen
 * suscripciones duplicadas en Firebase.
 */
export function useAuthSession({ resolveUser, loadData, onResolved, onSignedOut }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const callbacksRef = useRef({ resolveUser, loadData, onResolved, onSignedOut });

  useEffect(() => {
    callbacksRef.current = { resolveUser, loadData, onResolved, onSignedOut };
  }, [resolveUser, loadData, onResolved, onSignedOut]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      const callbacks = callbacksRef.current;

      if (currentUser) {
        setUser(currentUser);
        const resolvedRole = await callbacks.resolveUser(currentUser);
        callbacks.onResolved?.(resolvedRole);
        await callbacks.loadData();
      } else {
        setUser(null);
        callbacks.onSignedOut?.();
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { user, loading, setLoading };
}
