import { describe, expect, it } from 'vitest'
import { WORKFLOW_STATUSES, WORKFLOW_TRANSITIONS, WORKFLOW_LABELS } from '../src/shared/constants'

describe('alur kerja transaksi', () => {
  it('setiap status memiliki label Indonesia', () => {
    for (const status of WORKFLOW_STATUSES) {
      expect(WORKFLOW_LABELS[status]).toBeTruthy()
    }
  })

  it('setiap transisi menuju status yang dikenal', () => {
    const known = new Set<string>(WORKFLOW_STATUSES)
    for (const [from, targets] of Object.entries(WORKFLOW_TRANSITIONS)) {
      expect(known.has(from)).toBe(true)
      for (const target of targets) {
        expect(known.has(target), `${from} -> ${target}`).toBe(true)
      }
    }
  })

  it('SELESAI dan BATAL adalah status akhir', () => {
    expect(WORKFLOW_TRANSITIONS.SELESAI).toEqual([])
    expect(WORKFLOW_TRANSITIONS.BATAL).toEqual([])
  })

  it('status selain akhir dapat menuju BATAL atau maju', () => {
    for (const status of WORKFLOW_STATUSES) {
      if (status === 'SELESAI' || status === 'BATAL') continue
      expect(WORKFLOW_TRANSITIONS[status]?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it('jalur utama dari registrasi hingga selesai dapat dilalui', () => {
    let current = 'REGISTRASI_KLIEN'
    const visited = [current]
    const preferred = [
      'REGISTRASI_TRANSAKSI', 'UPLOAD_DOKUMEN', 'VERIFIKASI', 'DRAFT', 'REVIEW', 'APPROVAL',
      'PENJADWALAN', 'PENANDATANGANAN', 'PENCATATAN_AKTA', 'PENGARSIPAN', 'PEMBAYARAN',
      'SERAH_TERIMA', 'SELESAI',
    ]
    for (const next of preferred) {
      expect(WORKFLOW_TRANSITIONS[current], `${current} harus dapat menuju ${next}`).toContain(next)
      current = next
      visited.push(current)
    }
    expect(current).toBe('SELESAI')
    expect(visited).toHaveLength(preferred.length + 1)
  })

  it('tidak ada lompatan mundur diam-diam dari status akhir', () => {
    const reachableFromEnd = new Set([...WORKFLOW_TRANSITIONS.SELESAI, ...WORKFLOW_TRANSITIONS.BATAL])
    expect(reachableFromEnd.size).toBe(0)
  })
})
