import { AppError } from '../../lib/errors'
import { GOVERNMENT_OFFICIAL_PORTALS, type GovernmentAgency } from '../../../shared/government'

/**
 * Domain yang diizinkan untuk dibuka sebagai portal resmi.
 * Daftarnya tetap (bukan dari input pengguna) sehingga tidak dapat dialihkan
 * ke situs lain, dan tidak dipakai untuk mengambil data secara otomatis.
 */
const ALLOWED_PORTAL_HOSTS: Record<string, GovernmentAgency> = {
  'layanan.ahu.go.id': 'AHU',
  'mitra.atrbpn.go.id': 'BPN',
}

export function officialPortalUrl(agency: string): string {
  const url = GOVERNMENT_OFFICIAL_PORTALS[agency as GovernmentAgency]
  if (!url) throw new AppError(`Portal resmi untuk "${agency}" tidak dikenal.`, 'VALIDATION')
  return url
}

export function assertOfficialPortalUrl(value: string): URL {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new AppError('URL portal tidak valid.', 'VALIDATION')
  }
  if (parsed.protocol !== 'https:') throw new AppError('Hanya portal HTTPS yang boleh dibuka.', 'VALIDATION')
  const agency = ALLOWED_PORTAL_HOSTS[parsed.hostname.toLowerCase()]
  if (!agency) throw new AppError('URL bukan portal resmi AHU/ATR-BPN yang terdaftar.', 'VALIDATION')
  return parsed
}

export function portalAgencyForUrl(value: string): GovernmentAgency {
  return assertOfficialPortalUrl(value).hostname.toLowerCase() === 'layanan.ahu.go.id' ? 'AHU' : 'BPN'
}
