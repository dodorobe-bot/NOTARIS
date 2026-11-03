import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { dirs, documentRelativeDir, resolveStoragePath, safeSegment } from './paths'

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
}

export const ALLOWED_EXTENSIONS = Object.keys(MIME_BY_EXT)
export const MAX_FILE_BYTES = 50 * 1024 * 1024

export interface StoredFile {
  fileName: string
  storagePath: string
  mimeType: string
  sizeBytes: number
  checksum: string
}

export function assertAllowedFile(filePath: string, sizeBytes?: number): { ext: string; mimeType: string } {
  const ext = path.extname(filePath).toLowerCase()
  const mimeType = MIME_BY_EXT[ext]
  if (!mimeType) throw new Error(`Format berkas tidak didukung (${ext || 'tanpa ekstensi'}). Gunakan PDF, DOCX, XLSX, JPG, atau PNG.`)
  const size = sizeBytes ?? (fs.existsSync(filePath) ? fs.statSync(filePath).size : 0)
  if (size <= 0) throw new Error('Berkas kosong atau tidak ditemukan.')
  if (size > MAX_FILE_BYTES) throw new Error('Ukuran berkas melebihi batas 50 MB.')
  return { ext, mimeType }
}

export function storeFile(
  tempPath: string,
  originalName: string,
  opts: {
    clientId?: string | null
    transactionId?: string | null
    deedNumber?: string | null
    governmentSubmissionId?: string | null
    kind?: 'identities' | 'certificates' | 'invoices' | 'expenses' | 'deeds' | 'government' | 'other'
  },
): StoredFile {
  if (!fs.existsSync(tempPath)) throw new Error('Berkas sumber tidak ditemukan.')
  const { ext, mimeType } = assertAllowedFile(tempPath)
  const relDir = documentRelativeDir(opts)
  const absDir = path.join(dirs.documents(), relDir)
  fs.mkdirSync(absDir, { recursive: true })
  const fileName = `${crypto.randomUUID()}${ext}`
  const absTarget = path.join(absDir, fileName)
  fs.copyFileSync(tempPath, absTarget)
  const buf = fs.readFileSync(absTarget)
  const checksum = crypto.createHash('sha256').update(buf).digest('hex')
  const storagePath = path.join(relDir, fileName).replace(/\\/g, '/')
  return { fileName: originalName || fileName, storagePath, mimeType, sizeBytes: buf.length, checksum }
}

export function deleteStoredFile(storagePath: string): void {
  try {
    fs.rmSync(resolveStoragePath(storagePath), { force: true })
  } catch {
    /* berkas mungkin sudah tidak ada */
  }
}

export function copyExport(storagePath: string, targetPath: string): string {
  const abs = resolveStoragePath(storagePath)
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.copyFileSync(abs, targetPath)
  return targetPath
}

export function docFolderName(seed: string): string {
  return safeSegment(seed)
}
