import fs from 'node:fs'
import path from 'node:path'
import type { PrismaClient } from '@prisma/client'
import {
  DOCUMENT_CATEGORIES,
  PERMISSION_CATALOG,
  ROLES,
} from '../shared/constants'
import { GOVERNMENT_OFFICIAL_PORTALS, GOVERNMENT_SERVICE_SEEDS } from '../shared/government'
import { dirs, templatesBundledDir } from './lib/paths'
import { log } from './lib/logger'

const DEED_TYPES = [
  { code: 'AKTA_PENDIRIAN_PT', name: 'Akta Pendirian Perseroan Terbatas', category: 'NOTARIS', templatePath: 'notary/akta-umum.docx' },
  { code: 'PERUBAHAN_AD', name: 'Perubahan Anggaran Dasar', category: 'NOTARIS', templatePath: 'notary/akta-umum.docx' },
  { code: 'AKTA_JUAL_BELI_SAHAM', name: 'Akta Jual Beli Saham', category: 'NOTARIS', templatePath: 'notary/akta-umum.docx' },
  { code: 'AKTA_KUASA', name: 'Akta Kuasa', category: 'NOTARIS', templatePath: 'notary/akta-umum.docx' },
  { code: 'AKTA_WASIAT', name: 'Akta Wasiat', category: 'NOTARIS', templatePath: 'notary/akta-umum.docx' },
  { code: 'AKTA_HIBAH', name: 'Akta Hibah', category: 'NOTARIS', templatePath: 'notary/akta-umum.docx' },
  { code: 'PERJANJIAN_KAWIN', name: 'Perjanjian Kawin', category: 'NOTARIS', templatePath: 'notary/akta-umum.docx' },
  { code: 'AKTA_JAMINAN', name: 'Akta Jaminan', category: 'NOTARIS', templatePath: 'notary/akta-umum.docx' },
  { code: 'BERITA_ACARA_RUPS', name: 'Berita Acara RUPS', category: 'NOTARIS', templatePath: 'notary/akta-umum.docx' },
  { code: 'AKTA_PENGIKATAN_JUAL_BELI', name: 'Akta Pengikatan Jual Beli', category: 'NOTARIS', templatePath: 'notary/akta-umum.docx' },
  { code: 'AKTA_PERDAMAIAN', name: 'Akta Perdamaian', category: 'NOTARIS', templatePath: 'notary/akta-umum.docx' },
  { code: 'AKTA_LAINNYA', name: 'Akta Notaris Lainnya', category: 'NOTARIS', templatePath: 'notary/akta-umum.docx' },
  { code: 'AJB', name: 'Akta Jual Beli', category: 'PPAT', templatePath: 'ppat/akta-ppat.docx' },
  { code: 'APHT', name: 'Akta Pemberian Hak Tanggungan', category: 'PPAT', templatePath: 'ppat/akta-ppat.docx' },
  { code: 'SKMHT', name: 'Surat Kuasa Membebankan Hak Tanggungan', category: 'PPAT', templatePath: 'ppat/akta-ppat.docx' },
  { code: 'HIBAH_TANAH', name: 'Akta Hibah Tanah', category: 'PPAT', templatePath: 'ppat/akta-ppat.docx' },
  { code: 'APHB', name: 'Akta Pembagian Hak Bersama', category: 'PPAT', templatePath: 'ppat/akta-ppat.docx' },
  { code: 'TUKAR_MENUKAR', name: 'Akta Tukar Menukar', category: 'PPAT', templatePath: 'ppat/akta-ppat.docx' },
  { code: 'PEMASUKAN_PERUSAHAAN', name: 'Akta Pemasukan ke dalam Perusahaan', category: 'PPAT', templatePath: 'ppat/akta-ppat.docx' },
  { code: 'PPAT_LAINNYA', name: 'Akta PPAT Lainnya', category: 'PPAT', templatePath: 'ppat/akta-ppat.docx' },
]

const SETTINGS: { key: string; value: string; group: string; description: string }[] = [
  { key: 'office.name', value: '', group: 'KANTOR', description: 'Nama kantor notaris/PPAT' },
  { key: 'office.notaryName', value: '', group: 'KANTOR', description: 'Nama notaris penanggung jawab' },
  { key: 'office.address', value: '', group: 'KANTOR', description: 'Alamat kantor' },
  { key: 'office.city', value: '', group: 'KANTOR', description: 'Kota kedudukan' },
  { key: 'office.phone', value: '', group: 'KANTOR', description: 'Telepon kantor' },
  { key: 'office.email', value: '', group: 'KANTOR', description: 'Email kantor' },
  { key: 'system.timezone', value: 'Asia/Jakarta', group: 'SISTEM', description: 'Zona waktu' },
  { key: 'system.dateFormat', value: 'DD-MM-YYYY', group: 'SISTEM', description: 'Format tanggal' },
  { key: 'system.sessionTimeoutMinutes', value: '30', group: 'SISTEM', description: 'Batas idle sesi (menit)' },
  { key: 'system.autoBackupDaily', value: 'true', group: 'SISTEM', description: 'Backup otomatis harian' },
  { key: 'system.preMigrationBackup', value: 'true', group: 'SISTEM', description: 'Backup sebelum migrasi' },
  { key: 'system.backupRetention', value: '30', group: 'SISTEM', description: 'Jumlah backup otomatis yang disimpan' },
  { key: 'finance.defaultTaxPercent', value: '0', group: 'KEUANGAN', description: 'Persentase pajak bawaan invoice' },
  { key: 'finance.invoiceDueDays', value: '14', group: 'KEUANGAN', description: 'Jatuh tempo invoice (hari)' },
  { key: 'security.maxLoginAttempts', value: '5', group: 'KEAMANAN', description: 'Percobaan login sebelum jeda' },
  { key: 'security.passwordMinLength', value: '10', group: 'KEAMANAN', description: 'Panjang minimal password' },
]

const SEQUENCES = [
  { key: 'client', prefix: 'KLN-', pattern: '{PREFIX}{SEQ:5}', resetPeriod: 'NONE' },
  { key: 'transaction', prefix: 'TRX-', pattern: '{PREFIX}{YYYY}{MM}-{SEQ:4}', resetPeriod: 'MONTH' },
  { key: 'deed', prefix: '', pattern: '{SEQ:3}/{MM}/{YYYY}', resetPeriod: 'MONTH' },
  { key: 'repertorium', prefix: '', pattern: '{SEQ:3}/{YYYY}', resetPeriod: 'YEAR' },
  { key: 'protocol', prefix: '', pattern: '{SEQ:3}/{YYYY}', resetPeriod: 'YEAR' },
  { key: 'invoice', prefix: 'INV/', pattern: '{PREFIX}{YYYY}/{SEQ:4}', resetPeriod: 'YEAR' },
  { key: 'payment', prefix: 'KW/', pattern: '{PREFIX}{YYYY}/{SEQ:4}', resetPeriod: 'YEAR' },
  { key: 'expense', prefix: 'EXP/', pattern: '{PREFIX}{YYYY}{MM}/{SEQ:4}', resetPeriod: 'MONTH' },
  { key: 'government', prefix: 'GOV/', pattern: '{PREFIX}{YYYY}/{SEQ:4}', resetPeriod: 'YEAR' },
]

/** Data layanan pemerintah dan konfigurasi gateway. Idempoten. */
async function seedGovernment(prisma: PrismaClient): Promise<void> {
  for (const svc of GOVERNMENT_SERVICE_SEEDS) {
    const portalUrl = GOVERNMENT_OFFICIAL_PORTALS[svc.agency]
    await prisma.governmentService.upsert({
      where: { code: svc.code },
      create: {
        code: svc.code,
        agency: svc.agency,
        name: svc.name,
        description: svc.description,
        category: svc.category,
        portalUrl,
        mode: 'SEMI_OTOMATIS',
        sortOrder: svc.sortOrder,
      },
      update: { name: svc.name, description: svc.description, category: svc.category, portalUrl, sortOrder: svc.sortOrder },
    })
  }

  for (const agency of ['AHU', 'BPN'] as const) {
    await prisma.governmentApiConfig.upsert({
      where: { agency },
      create: {
        agency,
        mode: 'SEMI_OTOMATIS',
        apiEnabled: false,
        notes:
          'Mode semi-otomatis: aplikasi menyiapkan data, membuka portal resmi, dan mencatat nomor/status beserta bukti. ' +
          'Tidak ada API resmi yang diaktifkan karena belum ada dokumentasi dan otorisasi tertulis dari penyelenggara.',
      },
      update: {},
    })
  }
}

export function ensureBundledTemplates(): void {
  const bundled = templatesBundledDir()
  if (!fs.existsSync(bundled)) return
  for (const sub of ['notary', 'ppat', 'invoices']) {
    const srcDir = path.join(bundled, sub)
    if (!fs.existsSync(srcDir)) continue
    const destDir = path.join(dirs.templates(), sub)
    fs.mkdirSync(destDir, { recursive: true })
    for (const file of fs.readdirSync(srcDir)) {
      const dest = path.join(destDir, file)
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(srcDir, file), dest)
        log.info(`Template bawaan disalin: ${sub}/${file}`)
      }
    }
  }
}

/** Seed data referensi (bukan data bisnis). Idempoten. */
export async function seedReference(prisma: PrismaClient): Promise<void> {
  for (const perm of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      create: perm,
      update: { name: perm.name, group: perm.group },
    })
  }

  for (const role of ROLES) {
    const existing = await prisma.role.findUnique({ where: { code: role.code }, select: { id: true } })
    const dbRole = await prisma.role.upsert({
      where: { code: role.code },
      create: { code: role.code, name: role.name, description: role.description, isSystem: true },
      update: { name: role.name, description: role.description },
    })
    const perms = await prisma.permission.findMany({
      where: { code: { in: role.permissions } },
      select: { id: true },
    })
    if (!existing) {
      await prisma.rolePermission.createMany({
        data: perms.map((p) => ({ roleId: dbRole.id, permissionId: p.id })),
      })
    } else if (role.code === 'ADMINISTRATOR') {
      // Hak akses Administrator tidak dapat diubah dari UI; pastikan selalu lengkap
      // tanpa menghapus izin lain yang mungkin sudah ada.
      const current = await prisma.rolePermission.findMany({
        where: { roleId: dbRole.id },
        select: { permissionId: true },
      })
      const assigned = new Set(current.map((p) => p.permissionId))
      const missing = perms.filter((p) => !assigned.has(p.id))
      if (missing.length > 0) {
        await prisma.rolePermission.createMany({
          data: missing.map((p) => ({ roleId: dbRole.id, permissionId: p.id })),
        })
      }
    }
    // Role lain yang sudah ada tidak diubah: perubahan RBAC lewat UI harus bertahan.
  }

  for (const dt of DEED_TYPES) {
    await prisma.deedType.upsert({
      where: { code: dt.code },
      create: dt,
      update: { name: dt.name, category: dt.category, templatePath: dt.templatePath },
    })
  }

  for (const cat of DOCUMENT_CATEGORIES) {
    await prisma.documentCategory.upsert({
      where: { code: cat.code },
      create: cat,
      update: { name: cat.name, description: cat.description },
    })
  }

  for (const s of SETTINGS) {
    await prisma.setting.upsert({
      where: { key: s.key },
      create: s,
      update: { group: s.group, description: s.description },
    })
  }

  for (const seq of SEQUENCES) {
    await prisma.numberingSequence.upsert({
      where: { key: seq.key },
      create: seq,
      update: {},
    })
  }

  await seedGovernment(prisma)

  ensureBundledTemplates()
}
