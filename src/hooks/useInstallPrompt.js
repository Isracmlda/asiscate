import { useCallback, useEffect, useState } from 'react';

const isStandaloneDisplayMode = () => Boolean(
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
);

export function useInstallPrompt() {
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [isAppInstalled, setIsAppInstalled] = useState(isStandaloneDisplayMode);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPromptEvent(event);
    };
    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setInstallPromptEvent(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const installApp = useCallback(async () => {
    if (!installPromptEvent) return false;
    installPromptEvent.prompt();
    try {
      const choice = await installPromptEvent.userChoice;
      if (choice?.outcome === 'accepted') setIsAppInstalled(true);
    } finally {
      setInstallPromptEvent(null);
    }
    return true;
  }, [installPromptEvent]);

  return { installPromptEvent, isAppInstalled, installApp };
}
