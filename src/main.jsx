import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import '@fontsource/material-symbols-rounded/400.css'
import App from './App.jsx'
import { AppErrorBoundary } from './components/Shared/AppErrorBoundary.jsx'

const isFormationCheckinPage = new URLSearchParams(window.location.search).get('formationCheckin') === '1';
const isStudentAttendanceQrPage = new URLSearchParams(window.location.search).get('studentAttendanceQr') === '1';
const isFirebaseAuthHelperPage = window.location.pathname.startsWith('/__/');

// Keep the PWA service worker out of the OAuth redirect flow. Firebase uses
// /__/auth/* as a callback endpoint and the check-in page must stay in-browser.
if (!isFormationCheckinPage && !isStudentAttendanceQrPage && !isFirebaseAuthHelperPage) {
  registerSW({ immediate: true });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
