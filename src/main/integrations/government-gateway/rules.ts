import {
  GOVERNMENT_FINAL_STATUSES,
  GOVERNMENT_STATUS_LABELS,
  GOVERNMENT_STATUS_TRANSITIONS,
  type GovernmentStatus,
} from '../../../shared/government'
import { ConflictError } from '../../lib/errors'
import type { SubmissionState } from './types'

export const CIPHER_PREFIX = 'dpapi:'

export function assertGovernmentTransition(from: string, to: string): void {
  const allowed = GOVERNMENT_STATUS_TRANSITIONS[from as GovernmentStatus] ?? []
  if (!allowed.includes(to as GovernmentStatus)) {
    throw new ConflictError(
      `Status pengajuan tidak dapat berpindah dari "${GOVERNMENT_STATUS_LABELS[from as GovernmentStatus] ?? from}" ke "${
        GOVERNMENT_STATUS_LABELS[to as GovernmentStatus] ?? to
      }".`,
    )
  }
}

export function nextGovernmentStatuses(from: string): GovernmentStatus[] {
  return GOVERNMENT_STATUS_TRANSITIONS[from as GovernmentStatus] ?? []
}

export function isFinalGovernmentStatus(status: string): boolean {
  return GOVERNMENT_FINAL_STATUSES.includes(status as GovernmentStatus)
}

export function parseGovernmentData(dataJson?: string | null): Record<string, string> {
  if (!dataJson) return {}
  try {
    const raw: unknown = JSON.parse(dataJson)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>)
        .filter(([, v]) => typeof v === 'string' && (v as string).trim() !== '')
        .map(([k, v]) => [k, String(v)]),
    )
  } catch {
    return {}
  }
}

/**
 * Syarat yang belum terpenuhi sebelum status internal boleh berpindah.
 * Aturan ini yang menjaga aplikasi tidak menandai pengajuan sebagai berhasil
 * tanpa nomor resmi dan bukti dari pemerintah.
 */
export function missingRequirements(target: GovernmentStatus, state: SubmissionState): string[] {
  const missing: string[] = []
  const documents = state.supportingFiles + state.evidenceFiles
  switch (target) {
    case 'SIAP_DIAJUKAN':
      if (state.dataFields < 2) missing.push('Isi minimal dua data pengajuan (mis. nama badan hukum dan nomor akta).')
      if (documents < 1) missing.push('Unggah minimal satu dokumen pendukung.')
      break
    case 'MENUNGGU_PORTAL':
      break
    case 'DIAJUKAN':
      if (!state.externalRef) missing.push('Catat nomor permohonan/berkas yang diberikan portal resmi.')
      if (state.evidenceFiles < 1) missing.push('Unggah bukti pengajuan dari portal (tangkapan layar atau tanda terima).')
      break
    case 'DIPROSES':
      if (!state.externalRef) missing.push('Catat nomor permohonan/berkas terlebih dahulu.')
      break
    case 'SELESAI':
      if (!state.externalRef) missing.push('Catat nomor permohonan/berkas terlebih dahulu.')
      if (!state.officialStatus) missing.push('Isi status resmi sesuai keterangan portal atau surat resmi.')
      if (state.resultFiles < 1) missing.push('Unggah hasil layanan resmi (SK, sertifikat, atau dokumen keluaran).')
      break
    case 'DITOLAK':
      if (!state.externalRef) missing.push('Catat nomor permohonan/berkas terlebih dahulu.')
      if (!state.officialStatus) missing.push('Isi status resmi penolakan sesuai keterangan portal atau surat resmi.')
      break
    case 'DRAFT':
    case 'DIBATALKAN':
      break
  }
  return missing
}

export function isEncryptedCredential(value: string): boolean {
  return value.startsWith(CIPHER_PREFIX) && value.length > CIPHER_PREFIX.length + 16
}
