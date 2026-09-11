import { Component } from 'react';

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Error no controlado en la aplicación:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-slate-900 dark:bg-slate-950 dark:text-white">
        <section className="w-full max-w-lg rounded-2xl border border-slate-300 bg-white p-8 text-center shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <h1 className="text-2xl font-bold">AsisCate necesita recargar</h1>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            Ocurrió un error inesperado. Tus datos guardados en la base de datos no se han eliminado.
          </p>
          <button type="button" onClick={this.handleReload} className="mt-6 rounded-lg bg-red-800 px-5 py-3 font-bold text-white hover:bg-red-900">
            Recargar aplicación
          </button>
        </section>
      </main>
    );
  }
}
