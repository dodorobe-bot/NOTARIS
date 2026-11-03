import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/** Direktori data aplikasi (bukan direktori instalasi). */
export function dataRoot(): string {
  const override = process.env.NOTARIS_DATA_DIR
  if (override) return override
  return path.join(app.getPath('appData'), 'Notaris Pro')
}

export const dirs = {
  root: () => dataRoot(),
  database: () => path.join(dataRoot(), 'database'),
  documents: () => path.join(dataRoot(), 'documents'),
  templates: () => path.join(dataRoot(), 'templates'),
  exports: () => path.join(dataRoot(), 'exports'),
  backups: () => path.join(dataRoot(), 'backups'),
  logs: () => path.join(dataRoot(), 'logs'),
  config: () => path.join(dataRoot(), 'config'),
  tmp: () => path.join(dataRoot(), 'tmp'),
  cache: () => path.join(dataRoot(), 'cache'),
}

export const files = {
  db: () => path.join(dirs.database(), 'notaris_pro.db'),
  dbEnc: () => path.join(dirs.database(), 'notaris_pro.db.enc'),
  vault: () => path.join(dirs.config(), 'vault.json'),
  settingsLocal: () => path.join(dirs.config(), 'local.json'),
  appLog: () => path.join(dirs.logs(), 'app.log'),
  migrationLock: () => path.join(dirs.database(), '.migrating'),
}

const DOC_SUBDIRS = [
  'clients',
  'transactions',
  'deeds',
  'certificates',
  'invoices',
  'identities',
  'expenses',
  'government',
  'templates',
  'other',
]

export function ensureDirs(): void {
  for (const fn of Object.values(dirs)) {
    fs.mkdirSync(fn(), { recursive: true })
  }
  for (const sub of ['pdf', 'excel']) {
    fs.mkdirSync(path.join(dirs.exports(), sub), { recursive: true })
  }
  for (const sub of DOC_SUBDIRS) {
    fs.mkdirSync(path.join(dirs.documents(), sub), { recursive: true })
  }
  for (const sub of ['notary', 'ppat', 'invoices']) {
    fs.mkdirSync(path.join(dirs.templates(), sub), { recursive: true })
  }
  restrictPermissions(dirs.root())
}

/** Batasi izin baca folder data ke pengguna saat ini (best-effort di Windows). */
export function restrictPermissions(target: string): void {
  try {
    fs.chmodSync(target, 0o700)
  } catch {
    /* Windows mengabaikan chmod; ACL bawaan profil pengguna tetap berlaku */
  }
}

export function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

/** Path dokumen relatif terhadap folder documents/. */
export function documentRelativeDir(opts: {
  clientId?: string | null
  transactionId?: string | null
  deedNumber?: string | null
  governmentSubmissionId?: string | null
  kind?: 'identities' | 'certificates' | 'invoices' | 'expenses' | 'deeds' | 'government' | 'other'
}): string {
  if (opts.governmentSubmissionId) return path.join('government', safeSegment(opts.governmentSubmissionId))
  if (opts.clientId) return path.join('clients', safeSegment(opts.clientId))
  if (opts.transactionId) return path.join('transactions', safeSegment(opts.transactionId))
  if (opts.deedNumber) return path.join('deeds', safeSegment(opts.deedNumber))
  const d = new Date()
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
  return path.join(opts.kind ?? 'other', ym)
}

export function resolveStoragePath(relative: string): string {
  const root = path.resolve(dirs.documents())
  const target = path.resolve(root, relative)
  if (!target.startsWith(root + path.sep)) {
    throw new Error('Path dokumen tidak valid')
  }
  return target
}

/** Lokasi berkas migrasi SQL. */
export function migrationsDir(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'migrations')
  return path.join(app.getAppPath(), 'migrations')
}

export function templatesBundledDir(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'templates')
  return path.join(app.getAppPath(), 'templates')
}
