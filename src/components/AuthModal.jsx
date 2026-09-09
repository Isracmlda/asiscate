import React from 'react';
import { AsisCateLogo } from './Shared/AsisCateLogo';

export function AuthModal({
  themeMode,
  authError,
  authSubmitting,
  authMode,
  setAuthMode,
  setAuthError,
  emailAuthInput,
  setEmailAuthInput,
  passwordAuthInput,
  setPasswordAuthInput,
  nameAuthInput,
  setNameAuthInput,
  handleGoogleLogin,
  handleMicrosoftLogin,
  handleEmailAuthSubmit
}) {
  return (
    <div className={`min-h-screen flex flex-col justify-center items-center p-4 sm:p-6 ${themeMode === 'dark' ? 'bg-black text-slate-100' : 'bg-gradient-to-br from-red-50 to-slate-100'}`}>
      <div className={`p-6 sm:p-8 rounded-2xl shadow-xl max-w-md w-full border ${themeMode === 'dark' ? 'bg-black border-neutral-800' : 'bg-white border-red-100'}`}>
        <div className="flex flex-col items-center text-center mb-6">
          <AsisCateLogo className="w-16 h-16 sm:w-20 sm:h-20 mb-3" />
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">AsisCate</h1>
          <p className="text-xs sm:text-sm text-slate-400">Plataforma de Control de Asistencia y Gestión Parroquial.</p>
        </div>

        {authError && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-500 text-xs font-semibold text-center flex items-center justify-center gap-2">
            <span>⚠️</span>
            <span>{authError}</span>
          </div>
        )}

        {/* Botones de inicio de sesión social */}
        <div className="space-y-2.5 mb-5">
          <button
            onClick={handleGoogleLogin}
            disabled={authSubmitting}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2.5 px-4 rounded-xl shadow-sm border border-slate-300 transition duration-150 ease-in-out active:scale-95 text-xs sm:text-sm"
          >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.9h6.6c-.28 1.5-1.11 2.76-2.39 3.62v3h3.86c2.26-2.09 3.67-5.17 3.67-8.83z"/>
              <path fill="#34A853" d="M12 24c3.24 0 5.97-1.08 7.96-2.91l-3.86-3c-1.08.72-2.45 1.16-4.1 1.16-3.15 0-5.81-2.13-6.76-5.01H1.27v3.1A12 12 0 0012 24z"/>
              <path fill="#FBBC05" d="M5.24 14.24a7.22 7.22 0 010-4.48V6.66H1.27a12 12 0 000 10.68l3.97-3.1z"/>
              <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.37 2.67 1.27 6.66l3.97 3.1c.95-2.88 3.61-5.01 6.76-5.01z"/>
            </svg>
            Continuar con Google
          </button>

          <button
            onClick={handleMicrosoftLogin}
            disabled={authSubmitting}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 text-slate-700 font-semibold py-2.5 px-4 rounded-xl shadow-sm border border-slate-300 transition duration-150 ease-in-out active:scale-95 text-xs sm:text-sm"
          >
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 23 23">
              <path fill="#f35325" d="M1 1h10v10H1z"/>
              <path fill="#81bc06" d="M12 1h10v10H1z"/>
              <path fill="#05a6f0" d="M1 12h10v10H1z"/>
              <path fill="#ffba08" d="M12 12h10v10H1z"/>
            </svg>
            Continuar con Microsoft
          </button>
        </div>

        <div className="relative flex py-2 items-center mb-5">
          <div className="flex-grow border-t border-slate-300/40"></div>
          <span className="flex-shrink mx-3 text-slate-400 text-xs font-medium">o con correo</span>
          <div className="flex-grow border-t border-slate-300/40"></div>
        </div>

        {/* Selector Login / Registro */}
        <div className="flex rounded-xl p-1 bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 mb-4">
          <button
            type="button"
            onClick={() => { setAuthMode('login'); setAuthError(''); }}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${authMode === 'login' ? 'bg-white dark:bg-black shadow-sm text-red-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
          >
            Iniciar Sesión
          </button>
          <button
            type="button"
            onClick={() => { setAuthMode('register'); setAuthError(''); }}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-colors ${authMode === 'register' ? 'bg-white dark:bg-black shadow-sm text-red-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'}`}
          >
            Crear Cuenta
          </button>
        </div>

        {/* Formulario correo y contraseña */}
        <form onSubmit={handleEmailAuthSubmit} className="space-y-3">
          {authMode === 'register' && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 text-left">
                Nombre completo
              </label>
              <input
                type="text"
                required
                placeholder="Ej: María Rodríguez"
                value={nameAuthInput}
                onChange={(e) => setNameAuthInput(e.target.value)}
                className={`w-full px-3 py-2.5 rounded-xl border text-xs sm:text-sm focus:ring-2 focus:ring-red-500 outline-none transition-all ${themeMode === 'dark' ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-800'}`}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 text-left">
              Correo electrónico
            </label>
            <input
              type="email"
              required
              placeholder="correo@ejemplo.com"
              value={emailAuthInput}
              onChange={(e) => setEmailAuthInput(e.target.value)}
              className={`w-full px-3 py-2.5 rounded-xl border text-xs sm:text-sm focus:ring-2 focus:ring-red-500 outline-none transition-all ${themeMode === 'dark' ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-800'}`}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 text-left">
              Contraseña
            </label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={passwordAuthInput}
              onChange={(e) => setPasswordAuthInput(e.target.value)}
              className={`w-full px-3 py-2.5 rounded-xl border text-xs sm:text-sm focus:ring-2 focus:ring-red-500 outline-none transition-all ${themeMode === 'dark' ? 'bg-neutral-900 border-neutral-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-800'}`}
            />
          </div>

          <button
            type="submit"
            disabled={authSubmitting}
            className="w-full bg-red-800 hover:bg-red-900 text-white font-bold py-2.5 px-4 rounded-xl shadow-md transition duration-150 ease-in-out disabled:bg-slate-700 text-xs sm:text-sm mt-2"
          >
            {authSubmitting
              ? 'Procesando...'
              : authMode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta y Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
