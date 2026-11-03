import { describe, expect, it } from 'vitest'
import {
  PREVIEW_LIMITS,
  formatMb,
  previewDecision,
  selectCacheEvictions,
  thumbnailCacheKey,
  thumbnailWidth,
} from '../src/shared/preview-policy'

const MB = 1024 * 1024

describe('kebijakan pratinjau dokumen', () => {
  it('gambar kecil ditampilkan sebagai thumbnail', () => {
    expect(previewDecision('image/jpeg', 800 * 1024)).toEqual({ kind: 'image', inline: true })
    expect(previewDecision('image/png', 1)).toEqual({ kind: 'image', inline: true })
  })

  it('gambar di atas batas sumber tidak dibuka sama sekali', () => {
    const decision = previewDecision('image/png', PREVIEW_LIMITS.imageSourceMaxBytes + 1)
    expect(decision.kind).toBe('too-large')
    expect(decision.inline).toBe(false)
    expect(decision.reason).toContain('Gunakan Buka Aplikasi atau Unduh')
  })

  it('PDF dalam batas tetap dikirim inline, di atas batas tidak', () => {
    expect(previewDecision('application/pdf', PREVIEW_LIMITS.pdfMaxBytes)).toEqual({ kind: 'pdf', inline: true })
    const over = previewDecision('application/pdf', PREVIEW_LIMITS.pdfMaxBytes + 1)
    expect(over.kind).toBe('too-large')
    expect(over.inline).toBe(false)
    expect(over.reason).toContain(formatMb(PREVIEW_LIMITS.pdfMaxBytes))
  })

  it('format kantor tidak didukung pratinjau inline', () => {
    const decision = previewDecision('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 50_000)
    expect(decision.kind).toBe('unsupported')
    expect(decision.inline).toBe(false)
    expect(decision.reason).toContain('DOCX/XLSX')
  })

  it('ukuran nol atau tidak valid dianggap berkas hilang/kosong', () => {
    expect(previewDecision('image/png', 0).kind).toBe('missing')
    expect(previewDecision('application/pdf', -1).kind).toBe('missing')
    expect(previewDecision('image/png', Number.NaN).kind).toBe('missing')
  })
})

describe('lebar thumbnail', () => {
  it('tidak memperbesar gambar yang lebih kecil dari batas', () => {
    expect(thumbnailWidth(640)).toBe(640)
    expect(thumbnailWidth(1)).toBe(1)
  })

  it('membatasi gambar besar pada lebar maksimum', () => {
    expect(thumbnailWidth(6000)).toBe(PREVIEW_LIMITS.thumbnailWidth)
    expect(thumbnailWidth(PREVIEW_LIMITS.thumbnailWidth)).toBe(PREVIEW_LIMITS.thumbnailWidth)
  })

  it('lebar tidak valid memakai batas maksimum', () => {
    expect(thumbnailWidth(0)).toBe(PREVIEW_LIMITS.thumbnailWidth)
    expect(thumbnailWidth(Number.NaN)).toBe(PREVIEW_LIMITS.thumbnailWidth)
  })
})

describe('kunci cache thumbnail', () => {
  const base = { storagePath: 'clients/a/foto.jpg', mtimeMs: 1_700_000_000_123, sizeBytes: 90_000, width: 1024, mimeType: 'image/jpeg' }

  it('stabil untuk berkas yang sama', () => {
    expect(thumbnailCacheKey(base)).toBe(thumbnailCacheKey({ ...base }))
  })

  it('berubah bila berkas, ukuran, lebar, atau tipe berubah', () => {
    const original = thumbnailCacheKey(base)
    expect(thumbnailCacheKey({ ...base, storagePath: 'clients/b/foto.jpg' })).not.toBe(original)
    expect(thumbnailCacheKey({ ...base, mtimeMs: base.mtimeMs + 1 })).not.toBe(original)
    expect(thumbnailCacheKey({ ...base, sizeBytes: base.sizeBytes + 1 })).not.toBe(original)
    expect(thumbnailCacheKey({ ...base, width: 512 })).not.toBe(original)
    expect(thumbnailCacheKey({ ...base, mimeType: 'image/png' })).not.toBe(original)
  })
})

describe('pembersihan cache thumbnail', () => {
  const now = 1_800_000_000_000
  const minute = 60_000

  it('membuang berkas yang lebih tua dari umur maksimum', () => {
    const victims = selectCacheEvictions(
      [
        { name: 'lama.jpg', sizeBytes: 10, mtimeMs: now - PREVIEW_LIMITS.cacheMaxAgeMs - minute },
        { name: 'baru.jpg', sizeBytes: 10, mtimeMs: now },
      ],
      { maxBytes: PREVIEW_LIMITS.cacheMaxBytes, maxAgeMs: PREVIEW_LIMITS.cacheMaxAgeMs, nowMs: now },
    )
    expect(victims).toEqual(['lama.jpg'])
  })

  it('membuang yang paling lama diakses lebih dulu sampai muat', () => {
    const victims = selectCacheEvictions(
      [
        { name: 'a.jpg', sizeBytes: 40, mtimeMs: now - 3 * minute },
        { name: 'b.jpg', sizeBytes: 40, mtimeMs: now - 2 * minute },
        { name: 'c.jpg', sizeBytes: 40, mtimeMs: now - minute },
      ],
      { maxBytes: 80, maxAgeMs: 30 * 24 * 60 * minute, nowMs: now },
    )
    expect(victims).toEqual(['a.jpg'])
  })

  it('tetap membuang meski satu berkas saja sudah melebihi batas', () => {
    const victims = selectCacheEvictions(
      [{ name: 'besar.jpg', sizeBytes: 100, mtimeMs: now }],
      { maxBytes: 10, maxAgeMs: 30 * 24 * 60 * minute, nowMs: now },
    )
    expect(victims).toEqual(['besar.jpg'])
  })

  it('tidak membuang apa pun bila masih dalam batas', () => {
    expect(
      selectCacheEvictions(
        [{ name: 'a.jpg', sizeBytes: 10, mtimeMs: now }],
        { maxBytes: 10, maxAgeMs: 30 * 24 * 60 * minute, nowMs: now },
      ),
    ).toEqual([])
  })
})

describe('format ukuran', () => {
  it('menampilkan satu angka desimal dalam MB', () => {
    expect(formatMb(MB)).toBe('1.0 MB')
    expect(formatMb(12 * MB)).toBe('12.0 MB')
  })
})
