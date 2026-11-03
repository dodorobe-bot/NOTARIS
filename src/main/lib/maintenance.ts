import { AppError } from './errors'

/**
 * Penjaga operasi eksklusif (kunci/buka vault, restore). Selama operasi berjalan, rute sesi
 * ditolak dengan kode BUSY agar tidak ada permintaan yang membaca database ketika berkasnya
 * sedang diganti atau dienkripsi.
 */
let activeReason: string | null = null
let activeSince = 0

export function maintenanceReason(): string | null {
  return activeReason
}

export function maintenanceInfo(): { reason: string; since: string } | null {
  if (!activeReason) return null
  return { reason: activeReason, since: new Date(activeSince).toISOString() }
}

export function beginMaintenance(reason: string): () => void {
  if (activeReason) {
    throw new AppError(`Aplikasi sedang sibuk (${activeReason}). Coba lagi setelah selesai.`, 'BUSY')
  }
  activeReason = reason
  activeSince = Date.now()
  let released = false
  return () => {
    if (released) return
    released = true
    activeReason = null
    activeSince = 0
  }
}
