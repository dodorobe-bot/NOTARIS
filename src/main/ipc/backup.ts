import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow, dialog, shell } from 'electron'
import { z } from 'zod'
import { db } from '../db'
import { route } from './router'
import { backupCreateSchema } from '../../shared/schemas'
import { audit } from '../lib/audit'
import { dirs } from '../lib/paths'
import { clearSession } from '../lib/session'
import { getVaultKey } from '../lib/vault'
import { prepareDatabase } from '../lifecycle'
import { disconnectDb } from '../db'
import { migrationFiles } from '../lib/migrate'
import { audit as writeAudit } from '../lib/audit'
import {
  MAX_LEGACY_BACKUP_BYTES,
  assessBackupLocation,
  createBackup,
  listBackupFiles,
  restoreBackup,
  sha256File,
  validateBackup,
  type BackupManifest,
} from '../lib/backup'
import { isStreamContainer } from '../lib/backup-stream'
import { ConflictError, NotFoundError } from '../lib/errors'
import { beginMaintenance } from '../lib/maintenance'
import { log } from '../lib/logger'

function backupFile(fileName: string): string {
  const base = path.basename(fileName)
  if (base !== fileName || !base.toLowerCase().endsWith('.npbackup')) throw new ConflictError('Nama berkas backup tidak valid.')
  const full = path.join(dirs.backups(), base)
  if (!fs.existsSync(full)) throw new NotFoundError('Berkas backup tidak ditemukan.')
  return full
}

route('backup.list', {
  auth: 'session',
  perm: 'backup.manage',
  handler: async () => {
    const files = listBackupFiles()
    const names = new Set(files.map((f) => f.fileName))
    const logs = await db().backupLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { createdBy: { select: { fullName: true } } },
    })
    return {
      files: files.map((f) => ({ ...f, exists: true })),
      logs: logs.map((l) => ({ ...l, fileExists: names.has(l.fileName) })),
      folder: dirs.backups(),
      location: assessBackupLocation(),
      totals: {
        count: files.length,
        sizeBytes: files.reduce((s, f) => s + f.sizeBytes, 0),
        lastBackupAt: files[0]?.modifiedAt ?? null,
      },
    }
  },
})

route('backup.create', {
  auth: 'session',
  perm: 'backup.manage',
  schema: backupCreateSchema,
  handler: async (input, ctx) => {
    const vaultKey = getVaultKey()
    if (!input.passphrase && !vaultKey) {
      throw new ConflictError('Vault terkunci. Sediakan passphrase backup atau buka vault terlebih dahulu.')
    }
    const result = await createBackup({
      passphrase: input.passphrase,
      includeDocuments: input.includeDocuments,
      vaultKey: input.passphrase ? null : vaultKey,
      type: 'MANUAL',
      note: input.note ?? undefined,
    })
    // Berkas backup sudah sah dan tersimpan. Kegagalan menulis log/audit tidak boleh membuat
    // pemanggil mengira backup gagal lalu mengulanginya (menghabiskan disk dengan duplikat).
    try {
      await db().backupLog.create({
        data: {
          fileName: result.fileName,
          type: 'MANUAL',
          sizeBytes: result.sizeBytes,
          checksum: result.checksum,
          encryption: 'AES-256-GCM',
          status: 'SUCCESS',
          notes: input.note ?? `Backup manual${input.includeDocuments ? ' (database + dokumen)' : ' (database)'}`,
          createdById: ctx.session!.userId,
        },
      })
      await audit(db(), {
        userId: ctx.session!.userId, username: ctx.username, action: 'BACKUP', entity: 'Backup',
        entityId: result.fileName,
        after: { sizeBytes: result.sizeBytes, includeDocuments: input.includeDocuments, keySource: input.passphrase ? 'passphrase' : 'vault' },
      })
    } catch (err) {
      log.warn('Backup berhasil tetapi log/audit gagal ditulis', String(err))
    }
    return result
  },
})

route('backup.import', {
  auth: 'session',
  perm: 'backup.manage',
  handler: async (_p, ctx) => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
    const result = win
      ? await dialog.showOpenDialog(win, {
          title: 'Impor berkas backup',
          properties: ['openFile'],
          filters: [{ name: 'Backup NOTARIS PRO', extensions: ['npbackup'] }],
        })
      : await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Backup NOTARIS PRO', extensions: ['npbackup'] }] })
    if (result.canceled || !result.filePaths[0]) return null
    const source = result.filePaths[0]
    if (!source.toLowerCase().endsWith('.npbackup')) throw new ConflictError('Berkas bukan backup NOTARIS PRO.')
    const stat = fs.statSync(source)
    // Format 2 diproses secara streaming; format lama dimuat ke memori sehingga ukurannya dibatasi.
    if (!isStreamContainer(source) && stat.size > MAX_LEGACY_BACKUP_BYTES) {
      throw new ConflictError(
        `Berkas backup format lama melebihi ${Math.floor(MAX_LEGACY_BACKUP_BYTES / 1024 / 1024)} MB dan tidak dapat dibaca. Buat backup baru dari aplikasi sumber.`,
      )
    }
    const base = path.basename(source).replace(/[^a-zA-Z0-9._-]/g, '_')
    let target = path.join(dirs.backups(), base)
    if (fs.existsSync(target)) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      target = path.join(dirs.backups(), `${base.replace(/\.npbackup$/i, '')}-${stamp}.npbackup`)
    }
    // Salin ke `.part` lalu ganti nama agar impor yang terputus tidak meninggalkan berkas
    // setengah jadi yang tampak seperti backup sah.
    const staging = `${target}.part`
    try {
      fs.rmSync(staging, { force: true })
      fs.copyFileSync(source, staging)
      fs.chmodSync(staging, 0o600)
      fs.renameSync(staging, target)
    } catch (err) {
      fs.rmSync(staging, { force: true })
      throw err
    }
    try {
      await audit(db(), {
        userId: ctx.session!.userId, username: ctx.username, action: 'IMPORT_BACKUP', entity: 'Backup',
        entityId: path.basename(target), after: { sizeBytes: stat.size },
      })
    } catch (err) {
      log.warn('Impor backup berhasil tetapi audit gagal ditulis', String(err))
    }
    return { fileName: path.basename(target), sizeBytes: stat.size }
  },
})

route('backup.validate', {
  auth: 'session',
  perm: 'backup.manage',
  schema: z.object({ fileName: z.string().min(1).max(300), passphrase: z.string().max(200).optional() }),
  handler: async (input) => {
    const full = backupFile(input.fileName)
    const result = await validateBackup(full, input.passphrase, getVaultKey())
    return { ...result, fileName: path.basename(full) }
  },
})

route('backup.delete', {
  auth: 'session',
  perm: 'backup.manage',
  schema: z.object({ fileName: z.string().min(1).max(300) }),
  handler: async ({ fileName }, ctx) => {
    const full = backupFile(fileName)
    fs.rmSync(full, { force: true })
    await audit(db(), {
      userId: ctx.session!.userId, username: ctx.username, action: 'DELETE_BACKUP', entity: 'Backup',
      entityId: path.basename(full),
    })
    return { ok: true }
  },
})

route('backup.openFolder', {
  auth: 'session',
  perm: 'backup.manage',
  handler: async () => {
    fs.mkdirSync(dirs.backups(), { recursive: true })
    const err = await shell.openPath(dirs.backups())
    if (err) throw new Error(err)
    return { path: dirs.backups() }
  },
})

route('backup.restore', {
  auth: 'session',
  perm: 'backup.manage',
  schema: z.object({ fileName: z.string().min(1).max(300), passphrase: z.string().max(200).optional() }),
  handler: async (input, ctx) => {
    const full = backupFile(input.fileName)
    const vaultKey = getVaultKey()
    const check = await validateBackup(full, input.passphrase, vaultKey)
    if (!check.ok || !check.manifest) throw new ConflictError(`Backup tidak dapat dipulihkan: ${check.detail}`)
    if (!vaultKey && !input.passphrase) {
      throw new ConflictError('Backup ini memerlukan passphrase karena vault tidak tersedia.')
    }
    const schema = check.manifest.schemaMigration
    if (schema && schema !== 'none' && !migrationFiles().includes(schema)) {
      throw new ConflictError(
        `Backup dibuat oleh versi aplikasi yang lebih baru (migrasi ${schema} tidak dikenal). Perbarui aplikasi terlebih dahulu.`,
      )
    }
    const { userId, username } = ctx.session!

    let preRestoreFile: string | null = null
    try {
      const pre = await createBackup({
        passphrase: vaultKey ? undefined : input.passphrase,
        includeDocuments: true,
        vaultKey,
        type: 'MANUAL',
        note: `Backup otomatis sebelum restorasi ${path.basename(full)}`,
      })
      preRestoreFile = pre.filePath
      await db().backupLog.create({
        data: {
          fileName: pre.fileName, type: 'MANUAL', sizeBytes: pre.sizeBytes, checksum: pre.checksum,
          encryption: 'AES-256-GCM', status: 'SUCCESS', notes: 'Backup pengaman sebelum restorasi', createdById: userId,
        },
      })
    } catch (err) {
      throw new ConflictError(`Backup pengaman sebelum restorasi gagal dibuat, restorasi dibatalkan: ${(err as Error).message}`)
    }

    const manifest: BackupManifest | undefined = check.manifest
    // Selama database diganti tidak ada rute sesi lain yang boleh berjalan; proses keluar juga
    // menunggu operasi ini selesai agar database tidak dikunci di tengah restorasi.
    const release = beginMaintenance('memulihkan backup')
    clearSession()
    try {
      try {
        await disconnectDb()
        await restoreBackup({ filePath: full, passphrase: input.passphrase, vaultKey, restoreDocuments: true })
        await prepareDatabase()
      } catch (err) {
        log.error('Restorasi gagal; mencoba rollback', String(err))
        let rolledBack = false
        try {
          await disconnectDb()
          await restoreBackup({ filePath: preRestoreFile, passphrase: vaultKey ? undefined : input.passphrase, vaultKey, restoreDocuments: true })
          await prepareDatabase()
          rolledBack = true
        } catch (rollbackErr) {
          log.error('Rollback pasca-restorasi gagal', String(rollbackErr))
        }
        throw new Error(
          rolledBack
            ? `Restorasi gagal dan database dikembalikan ke kondisi sebelumnya: ${(err as Error).message}`
            : `Restorasi gagal dan rollback otomatis juga gagal. Pulihkan manual dari backup ${path.basename(preRestoreFile)}. Detail: ${(err as Error).message}`,
        )
      }

      // Database sudah berhasil dipulihkan. Kegagalan mencatat log/audit tidak boleh memicu
      // rollback atas restorasi yang sebenarnya sukses.
      try {
        await db().backupLog.create({
          data: {
            fileName: input.fileName, type: 'MANUAL', sizeBytes: fs.statSync(full).size,
            checksum: manifest?.dbSha256 ?? '', encryption: 'AES-256-GCM', status: 'RESTORED',
            notes: `Dipulihkan dari backup ${manifest?.createdAt ?? ''}`,
          },
        })
        await writeAudit(db(), {
          userId: null, username, action: 'RESTORE', entity: 'Backup', entityId: input.fileName,
          after: { preRestoreBackup: path.basename(preRestoreFile), manifest },
        })
      } catch (logErr) {
        log.warn('Restorasi berhasil tetapi log/audit gagal ditulis', String(logErr))
      }
      log.info(`Restorasi berhasil dari ${input.fileName}; sesi pengguna diakhiri`)
      return { ok: true, requiresLogin: true, preRestoreBackup: path.basename(preRestoreFile), manifest }
    } finally {
      release()
    }
  },
})

route('backup.checksum', {
  auth: 'session',
  perm: 'backup.manage',
  schema: z.object({ fileName: z.string().min(1).max(300) }),
  handler: ({ fileName }) => {
    const full = backupFile(fileName)
    return { checksum: sha256File(full) }
  },
})
