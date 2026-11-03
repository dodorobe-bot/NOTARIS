import { formatNumber } from './format'

/**
 * Pesan peringatan ketika hasil laporan tidak memuat seluruh baris yang ada pada filter.
 * Tanpa pesan ini, PDF dan Excel terlihat seperti laporan yang lengkap.
 */
export function truncationNotice(shownRows: number, rowTotal: number | null | undefined): string {
  if (rowTotal === null || rowTotal === undefined || shownRows >= rowTotal) return ''
  return (
    `Perhatian: laporan ini dipotong pada ${formatNumber(shownRows)} baris dari ${formatNumber(rowTotal)} baris yang ada. ` +
    'Persempit periode atau filter untuk mencetak seluruh baris.'
  )
}
