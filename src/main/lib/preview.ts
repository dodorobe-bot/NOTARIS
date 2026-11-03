import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { nativeImage } from 'electron'
import { dirs } from './paths'
import {
  PREVIEW_LIMITS,
  previewDecision,
  selectCacheEvictions,
  thumbnailCacheKey,
  thumbnailWidth,
  type PreviewKind,
} from '../../shared/preview-policy'

export interface PreviewPayload {
  kind: PreviewKind
  mimeType: string
  sourceBytes: number
  dataUrl?: string
  thumbnail?: boolean
  width?: number
  height?: number
  reason?: string
  cacheHit?: boolean
}

const PRUNE_INTERVAL_MS = 5 * 60 * 1000
let lastPrune = 0

export function thumbnailCacheDir(): string {
  return path.join(dirs.cache(), 'thumbnails')
}

/**
 * Menyiapkan pratinjau dengan batas ukuran yang tegas.
 *
 * Gambar selalu diperkecil lebih dulu (thumbnail) dan hasilnya di-cache; PDF dikirim apa adanya
 * hanya bila di bawah batas. Berkas yang terlalu besar atau formatnya tidak didukung tidak pernah
 * dikirim lewat IPC — antarmuka menawarkan Buka Aplikasi/Unduh, sehingga memori renderer tidak
 * meledak oleh berkas 40 MB.
 */
export function preparePreview(absPath: string, mimeType: string): PreviewPayload {
  let stat: fs.Stats
  try {
    stat = fs.statSync(absPath)
  } catch {
    return {
      kind: 'missing',
      mimeType,
      sourceBytes: 0,
      reason: 'Berkas tidak ditemukan di penyimpanan. Pulihkan dari backup atau unggah ulang dokumen ini.',
    }
  }

  const decision = previewDecision(mimeType, stat.size)
  if (decision.kind === 'pdf') {
    const buf = fs.readFileSync(absPath)
    return { kind: 'pdf', mimeType, sourceBytes: stat.size, dataUrl: `data:${mimeType};base64,${buf.toString('base64')}` }
  }
  if (decision.kind !== 'image') {
    return { kind: decision.kind, mimeType, sourceBytes: stat.size, reason: decision.reason }
  }
  return imagePreview(absPath, mimeType, stat)
}

function imagePreview(absPath: string, mimeType: string, stat: fs.Stats): PreviewPayload {
  const source = nativeImage.createFromPath(absPath)
  if (source.isEmpty()) {
    return {
      kind: 'unsupported', mimeType, sourceBytes: stat.size,
      reason: 'Gambar tidak dapat dibaca (mungkin rusak atau formatnya tidak didukung). Gunakan Buka Aplikasi.',
    }
  }
  const size = source.getSize()
  const width = thumbnailWidth(size.width)
  const image = width < size.width ? source.resize({ width, quality: 'good' }) : source
  const encoded = encodeThumbnail(image, mimeType)

  const key = thumbnailCacheKey({
    storagePath: absPath, mtimeMs: stat.mtimeMs, sizeBytes: stat.size, width, mimeType,
  })
  const cacheName = `${crypto.createHash('sha256').update(key).digest('hex')}.${encoded.ext}`
  const cachePath = path.join(thumbnailCacheDir(), cacheName)
  const cached = readCache(cachePath)
  if (cached) {
    return {
      kind: 'image', mimeType, sourceBytes: stat.size, dataUrl: cached,
      thumbnail: true, width: image.getSize().width, height: image.getSize().height, cacheHit: true,
    }
  }

  const dataUrl = `data:${encoded.mimeType};base64,${encoded.buf.toString('base64')}`
  writeCache(cachePath, encoded.buf)
  return {
    kind: 'image', mimeType, sourceBytes: stat.size, dataUrl,
    thumbnail: true, width: image.getSize().width, height: image.getSize().height, cacheHit: false,
  }
}

function encodeThumbnail(image: Electron.NativeImage, mimeType: string): { buf: Buffer; ext: string; mimeType: string } {
  const jpeg = () => ({ buf: image.toJPEG(80), ext: 'jpg', mimeType: 'image/jpeg' })
  if (mimeType === 'image/png') {
    const png = image.toPNG()
    if (png.length <= PREVIEW_LIMITS.thumbnailTargetBytes) {
      return { buf: png, ext: 'png', mimeType: 'image/png' }
    }
    return jpeg()
  }
  const first = jpeg()
  if (first.buf.length <= PREVIEW_LIMITS.thumbnailTargetBytes) return first
  return { buf: image.toJPEG(65), ext: 'jpg', mimeType: 'image/jpeg' }
}

function readCache(cachePath: string): string | null {
  try {
    const buf = fs.readFileSync(cachePath)
    if (buf.length === 0) return null
    const now = new Date()
    fs.utimesSync(cachePath, now, now)
    const mimeType = cachePath.endsWith('.png') ? 'image/png' : 'image/jpeg'
    return `data:${mimeType};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

function writeCache(cachePath: string, buf: Buffer): void {
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true })
    fs.writeFileSync(cachePath, buf, { mode: 0o600 })
  } catch {
    return
  }
  const now = Date.now()
  if (now - lastPrune < PRUNE_INTERVAL_MS) return
  lastPrune = now
  pruneThumbnailCache(now)
}

/** Membersihkan cache thumbnail agar tetap terbatas ukuran dan umurnya. */
export function pruneThumbnailCache(nowMs = Date.now()): number {
  const dir = thumbnailCacheDir()
  let names: string[]
  try {
    names = fs.readdirSync(dir)
  } catch {
    return 0
  }
  const entries = names.flatMap((name) => {
    try {
      const st = fs.statSync(path.join(dir, name))
      return st.isFile() ? [{ name, sizeBytes: st.size, mtimeMs: st.mtimeMs }] : []
    } catch {
      return []
    }
  })
  const victims = selectCacheEvictions(entries, {
    maxBytes: PREVIEW_LIMITS.cacheMaxBytes,
    maxAgeMs: PREVIEW_LIMITS.cacheMaxAgeMs,
    nowMs,
  })
  let removed = 0
  for (const name of victims) {
    try {
      fs.rmSync(path.join(dir, name), { force: true })
      removed++
    } catch {
      /* cache bersifat sementara */
    }
  }
  return removed
}
