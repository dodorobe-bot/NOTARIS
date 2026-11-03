/**
 * Kebijakan pratinjau dokumen. Dipisahkan dari kode Electron supaya bisa diuji tanpa
 * menjalankan aplikasi: batas ukuran, kunci cache, dan pemilihan berkas cache yang dibuang.
 */

export const PREVIEW_LIMITS = {
  /** PDF di atas batas ini tidak dikirim sebagai data URL; pengguna memakai Buka Aplikasi/Unduh. */
  pdfMaxBytes: 12 * 1024 * 1024,
  /** Sumber gambar di atas ini tidak dibuka sama sekali (nativeImage akan memakan memori besar). */
  imageSourceMaxBytes: 40 * 1024 * 1024,
  /** Lebar maksimum thumbnail; gambar yang lebih kecil tidak diperbesar. */
  thumbnailWidth: 1024,
  /** Hasil thumbnail di atas ini dikodekan ulang sebagai JPEG berkualitas lebih rendah. */
  thumbnailTargetBytes: 2 * 1024 * 1024,
  /** Total ukuran folder cache thumbnail yang diizinkan. */
  cacheMaxBytes: 64 * 1024 * 1024,
  /** Umur maksimum berkas cache sebelum dibersihkan. */
  cacheMaxAgeMs: 30 * 24 * 60 * 60 * 1000,
} as const

export type PreviewKind = 'image' | 'pdf' | 'unsupported' | 'too-large' | 'missing'

export interface PreviewDecision {
  kind: PreviewKind
  /** true bila isi boleh dikirim lewat IPC (data URL). */
  inline: boolean
  reason?: string
}

export function isPreviewableImage(mimeType: string): boolean {
  return /^image\/(png|jpe?g|webp|bmp|gif)$/i.test(mimeType)
}

export function previewDecision(mimeType: string, sizeBytes: number): PreviewDecision {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { kind: 'missing', inline: false, reason: 'Berkas kosong atau tidak ditemukan di penyimpanan.' }
  }
  if (isPreviewableImage(mimeType)) {
    if (sizeBytes > PREVIEW_LIMITS.imageSourceMaxBytes) {
      return {
        kind: 'too-large',
        inline: false,
        reason: `Gambar ${formatMb(sizeBytes)} melebihi batas pratinjau ${formatMb(PREVIEW_LIMITS.imageSourceMaxBytes)}. Gunakan Buka Aplikasi atau Unduh.`,
      }
    }
    return { kind: 'image', inline: true }
  }
  if (mimeType === 'application/pdf') {
    if (sizeBytes > PREVIEW_LIMITS.pdfMaxBytes) {
      return {
        kind: 'too-large',
        inline: false,
        reason: `PDF ${formatMb(sizeBytes)} melebihi batas pratinjau ${formatMb(PREVIEW_LIMITS.pdfMaxBytes)}. Gunakan Buka Aplikasi atau Unduh; pratinjau tidak dikirim ke antarmuka agar memori tidak memberat.`,
      }
    }
    return { kind: 'pdf', inline: true }
  }
  return {
    kind: 'unsupported',
    inline: false,
    reason: 'Pratinjau hanya tersedia untuk gambar dan PDF. Gunakan Buka Aplikasi untuk DOCX/XLSX.',
  }
}

/** Ukuran thumbnail yang dipakai: tidak pernah memperbesar gambar kecil. */
export function thumbnailWidth(sourceWidth: number): number {
  if (!Number.isFinite(sourceWidth) || sourceWidth <= 0) return PREVIEW_LIMITS.thumbnailWidth
  return Math.min(Math.ceil(sourceWidth), PREVIEW_LIMITS.thumbnailWidth)
}

export function thumbnailCacheKey(input: {
  storagePath: string
  mtimeMs: number
  sizeBytes: number
  width: number
  mimeType: string
}): string {
  return [input.storagePath, Math.trunc(input.mtimeMs), input.sizeBytes, input.width, input.mimeType].join('|')
}

export interface CacheEntry {
  name: string
  sizeBytes: number
  mtimeMs: number
}

/**
 * Berkas cache yang harus dibuang agar total di bawah `maxBytes` dan tidak ada yang lebih tua dari
 * `maxAgeMs`. Yang paling lama diakses dibuang lebih dulu. Berkas terbaru tidak pernah dibuang
 * selama ukurannya masih muat, supaya pemakaian berulang tidak terus-menerus membuat ulang.
 */
export function selectCacheEvictions(
  entries: CacheEntry[],
  opts: { maxBytes: number; maxAgeMs: number; nowMs: number },
): string[] {
  const victims: string[] = []
  const survivors: CacheEntry[] = []
  for (const entry of entries) {
    if (opts.maxAgeMs > 0 && opts.nowMs - entry.mtimeMs > opts.maxAgeMs) victims.push(entry.name)
    else survivors.push(entry)
  }
  survivors.sort((a, b) => a.mtimeMs - b.mtimeMs)
  let total = survivors.reduce((sum, e) => sum + e.sizeBytes, 0)
  for (const entry of survivors) {
    if (total <= opts.maxBytes) break
    // Bila hanya tersisa satu berkas dan masih lebih besar dari batas, berkas itu tetap dibuang.
    victims.push(entry.name)
    total -= entry.sizeBytes
  }
  return victims
}

export function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
