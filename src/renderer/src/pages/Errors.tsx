import { Link } from 'react-router-dom'
import { ArrowLeft, ShieldAlert } from 'lucide-react'

export function NotFound() {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-20 text-center">
      <p className="text-5xl font-extrabold tracking-tight text-gold-500">404</p>
      <h1 className="mt-2 text-lg font-bold text-navy-900 dark:text-white">Halaman tidak ditemukan</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Menu yang Anda tuju tidak tersedia atau telah dipindahkan.</p>
      <Link to="/" className="btn-primary mt-5"><ArrowLeft className="h-4 w-4" /> Kembali ke Dashboard</Link>
    </div>
  )
}

export function AccessDenied() {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300">
        <ShieldAlert className="h-7 w-7" />
      </div>
      <h1 className="mt-3 text-lg font-bold text-navy-900 dark:text-white">Akses ditolak</h1>
      <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">
        Role Anda tidak memiliki hak akses ke modul ini. Hubungi Administrator apabila akses diperlukan.
      </p>
      <Link to="/" className="btn-primary mt-5"><ArrowLeft className="h-4 w-4" /> Kembali ke Dashboard</Link>
    </div>
  )
}
