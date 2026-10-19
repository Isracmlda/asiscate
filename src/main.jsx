import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import '@fontsource/material-symbols-rounded/400.css'
import App from './App.jsx'
import { AppErrorBoundary } from './components/Shared/AppErrorBoundary.jsx'

const isFormationCheckinPage = new URLSearchParams(window.location.search).get('formationCheckin') === '1';
const isFirebaseAuthHelperPage = window.location.pathname.startsWith('/__/');

// Keep the PWA service worker out of Firebase OAuth redirects. Attendance QR
// pages use a network-only navigation route so installed copies stay current.
if (!isFormationCheckinPage && !isFirebaseAuthHelperPage) {
  registerSW({ immediate: true });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
