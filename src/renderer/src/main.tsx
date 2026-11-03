import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { ToastProvider } from '@/components/ui'
import './index.css'

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('Renderer error', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-navy-950 p-6 text-white">
          <div className="max-w-md rounded-xl border border-red-500/40 bg-navy-900 p-6 text-center">
            <p className="text-sm font-bold">Terjadi kesalahan pada antarmuka</p>
            <p className="mt-2 break-words text-xs text-navy-200">{this.state.error.message}</p>
            <button className="btn-gold mt-4" onClick={() => window.location.reload()}>Muat ulang aplikasi</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
