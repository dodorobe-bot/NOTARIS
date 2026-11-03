import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import {
  GOVERNMENT_AGENCIES, GOVERNMENT_FILE_KINDS, GOVERNMENT_FINAL_STATUSES, GOVERNMENT_OFFICIAL_PORTALS,
  GOVERNMENT_OFFICIAL_SOURCES, GOVERNMENT_REFERENCE_TYPES, GOVERNMENT_SERVICE_SEEDS, GOVERNMENT_STATUSES,
  GOVERNMENT_STATUS_TRANSITIONS, GOVERNMENT_VIEW_CODES, GOVERNMENT_VIEW_GROUPS,
  governmentAgencyLabel, governmentFieldsFor, governmentStatusLabel,
} from '../src/shared/government'
import {
  CIPHER_PREFIX, assertGovernmentTransition, isEncryptedCredential, isFinalGovernmentStatus,
  missingRequirements, nextGovernmentStatuses, parseGovernmentData,
} from '../src/main/integrations/government-gateway/rules'
import { assertOfficialPortalUrl, officialPortalUrl, portalAgencyForUrl } from '../src/main/integrations/government-gateway/portal'
import { adapterFor, integrationCapabilities, portalUrlFor } from '../src/main/integrations/government-gateway/integration-manager'
import { AppError, ConflictError } from '../src/main/lib/errors'
import {
  governmentConfigUpdateSchema, governmentCredentialSchema, governmentDataSchema,
  governmentPortalOpenSchema, governmentSubmissionListSchema,
} from '../src/shared/schemas'

const state = (over: Partial<Parameters<typeof missingRequirements>[1]> = {}) => ({
  dataFields: 0,
  supportingFiles: 0,
  evidenceFiles: 0,
  resultFiles: 0,
  externalRef: null,
  officialStatus: null,
  ...over,
})

/** Tabel yang disyaratkan spesifikasi Government Integration Gateway. */
const GATEWAY_TABLES = [
  'government_services',
  'government_submissions',
  'government_submission_files',
  'government_status_history',
  'government_references',
  'government_sync_logs',
  'government_api_config',
  'government_api_credentials',
]

interface SqliteDb {
  exec(sql: string): void
  prepare(sql: string): { all(): Record<string, unknown>[]; get(): Record<string, unknown> | undefined }
  close(): void
}

describe('transisi status pengajuan pemerintah', () => {
  it('menerima jalur happy path draft sampai selesai', () => {
    const happyPath: string[] = ['DRAFT', 'SIAP_DIAJUKAN', 'MENUNGGU_PORTAL', 'DIAJUKAN', 'DIPROSES', 'SELESAI']
    for (let i = 0; i < happyPath.length - 1; i++) {
      expect(() => assertGovernmentTransition(happyPath[i], happyPath[i + 1]), `${happyPath[i]} -> ${happyPath[i + 1]}`).not.toThrow()
    }
  })

  it('menolak lompatan yang belum sah', () => {
    expect(() => assertGovernmentTransition('DRAFT', 'SELESAI')).toThrow(ConflictError)
    expect(() => assertGovernmentTransition('DIPROSES', 'DIAJUKAN')).toThrow(ConflictError)
    expect(() => assertGovernmentTransition('SELESAI', 'DIPROSES')).toThrow(ConflictError)
    expect(() => assertGovernmentTransition('DIBATALKAN', 'DRAFT')).toThrow(ConflictError)
  })

  it('pesan penolakan memakai label Indonesia, bukan kode mentah', () => {
    const err = (() => {
      try {
        assertGovernmentTransition('DRAFT', 'SELESAI')
        return null
      } catch (e) {
        return e as Error
      }
    })()
    expect(err?.message).toContain('Draft')
    expect(err?.message).toContain('Selesai')
    expect(err?.message).not.toContain('SIAP_DIAJUKAN')
  })

  it('status final tidak punya jalan keluar', () => {
    for (const status of GOVERNMENT_FINAL_STATUSES) {
      expect(nextGovernmentStatuses(status)).toEqual([])
      expect(isFinalGovernmentStatus(status)).toBe(true)
    }
    expect(isFinalGovernmentStatus('DIPROSES')).toBe(false)
  })

  it('setiap target transisi adalah status yang dikenal', () => {
    const known = new Set<string>(GOVERNMENT_STATUSES)
    for (const [from, targets] of Object.entries(GOVERNMENT_STATUS_TRANSITIONS)) {
      expect(known.has(from)).toBe(true)
      for (const target of targets) expect(known.has(target), `${from} -> ${target}`).toBe(true)
    }
  })
})

describe('syarat bukti sebelum status berubah', () => {
  it('Siap Diajukan menuntut data dan dokumen pendukung', () => {
    expect(missingRequirements('SIAP_DIAJUKAN', state())).toHaveLength(2)
    expect(missingRequirements('SIAP_DIAJUKAN', state({ dataFields: 2, supportingFiles: 1 }))).toEqual([])
  })

  it('Diajukan menuntut nomor resmi dan bukti pengajuan', () => {
    expect(missingRequirements('DIAJUKAN', state({ supportingFiles: 5, dataFields: 9 }))).toHaveLength(2)
    expect(missingRequirements('DIAJUKAN', state({ externalRef: 'AHU-123', evidenceFiles: 1 }))).toEqual([])
  })

  it('Selesai tidak dapat tercatat tanpa nomor resmi, status resmi, dan hasil layanan', () => {
    expect(missingRequirements('SELESAI', state({ externalRef: 'AHU-123' }))).toHaveLength(2)
    expect(missingRequirements('SELESAI', state({ externalRef: 'AHU-123', officialStatus: 'SK terbit' }))).toHaveLength(1)
    expect(
      missingRequirements('SELESAI', state({ externalRef: 'AHU-123', officialStatus: 'SK terbit', resultFiles: 1 })),
    ).toEqual([])
  })

  it('Ditolak menuntut nomor dan status resmi, tetapi tidak menuntut hasil layanan', () => {
    expect(missingRequirements('DITOLAK', state())).toHaveLength(2)
    expect(missingRequirements('DITOLAK', state({ externalRef: 'BPN-9', officialStatus: 'Ditolak' }))).toEqual([])
  })

  it('pembatalan dan menunggu portal tidak menuntut bukti', () => {
    expect(missingRequirements('DIBATALKAN', state())).toEqual([])
    expect(missingRequirements('MENUNGGU_PORTAL', state())).toEqual([])
    expect(missingRequirements('DRAFT', state())).toEqual([])
  })
})

describe('data isian pengajuan', () => {
  it('mengabaikan nilai kosong dan bukan string', () => {
    expect(parseGovernmentData(JSON.stringify({ a: 'x', b: '   ', c: 2, d: null }))).toEqual({ a: 'x' })
  })

  it('mengembalikan objek kosong untuk JSON rusak, array, atau null', () => {
    expect(parseGovernmentData('{bukan json')).toEqual({})
    expect(parseGovernmentData('[1,2]')).toEqual({})
    expect(parseGovernmentData(null)).toEqual({})
  })

  it('template isian tersedia untuk kedua instansi', () => {
    expect(governmentFieldsFor('AHU').length).toBeGreaterThan(5)
    expect(governmentFieldsFor('BPN').length).toBeGreaterThan(5)
    expect(governmentFieldsFor('DHELAJ')).toEqual([])
    for (const fields of [governmentFieldsFor('AHU'), governmentFieldsFor('BPN')]) {
      const keys = fields.map((f) => f.key)
      expect(new Set(keys).size).toBe(keys.length)
      for (const f of fields) expect(f.label.length).toBeGreaterThan(0)
    }
  })
})

describe('gerbang portal resmi', () => {
  it('hanya domain resmi dengan HTTPS yang diterima', () => {
    expect(portalAgencyForUrl(GOVERNMENT_OFFICIAL_PORTALS.AHU)).toBe('AHU')
    expect(portalAgencyForUrl(GOVERNMENT_OFFICIAL_PORTALS.BPN)).toBe('BPN')
    expect(portalUrlFor('AHU')).toBe('https://layanan.ahu.go.id/')
  })

  it('menolak http, domain mirip, dan nilai bukan URL', () => {
    expect(() => assertOfficialPortalUrl('http://layanan.ahu.go.id/')).toThrow(AppError)
    expect(() => assertOfficialPortalUrl('https://layanan.ahu.go.id.evil.test/')).toThrow(AppError)
    expect(() => assertOfficialPortalUrl('https://evil.test/?next=https://mitra.atrbpn.go.id/')).toThrow(AppError)
    expect(() => assertOfficialPortalUrl('layanan.ahu.go.id')).toThrow(AppError)
    expect(() => assertOfficialPortalUrl('javascript:alert(1)')).toThrow(AppError)
    expect(() => assertOfficialPortalUrl('')).toThrow(AppError)
  })

  it('instansi tak dikenal ditolak', () => {
    expect(() => officialPortalUrl('DHELAJ')).toThrow(AppError)
    expect(() => adapterFor('DHELAJ')).toThrow(AppError)
  })
})

describe('kapabilitas integrasi dinyatakan apa adanya', () => {
  it('tidak ada adapter yang mengklaim API resmi atau pengajuan otomatis', () => {
    const caps = integrationCapabilities()
    expect(caps.map((c) => c.agency).sort()).toEqual(['AHU', 'BPN'])
    for (const cap of caps) {
      expect(cap.mode).toBe('SEMI_OTOMATIS')
      expect(cap.officialApiAvailable).toBe(false)
      expect(cap.automatedSubmission).toBe(false)
      expect(cap.note.length).toBeGreaterThan(20)
      expect(() => assertOfficialPortalUrl(cap.portalUrl)).not.toThrow()
    }
  })

  it('adapter mengembalikan checklist terisi untuk layanan yang tidak dikenal', () => {
    for (const agency of ['AHU', 'BPN']) {
      expect(adapterFor(agency).checklist('LAYANAN_ASAI').length).toBeGreaterThan(0)
    }
  })
})

describe('kredensial portal tidak pernah plaintext', () => {
  it('hanya menerima ciphertext dengan awalan dpapi:', () => {
    expect(isEncryptedCredential(`${CIPHER_PREFIX}${'A'.repeat(64)}`)).toBe(true)
    expect(isEncryptedCredential('rahasia-pakai-user')).toBe(false)
    expect(isEncryptedCredential(`${CIPHER_PREFIX}pendek`)).toBe(false)
    expect(isEncryptedCredential('')).toBe(false)
  })

  it('tanpa penyimpanan aman OS, kredensial ditolak alih-alih disimpan terbuka', async () => {
    const { credentialEncryptionAvailable, encryptCredential } = await import(
      '../src/main/integrations/government-gateway/credentials'
    )
    if (credentialEncryptionAvailable()) {
      const cipher = encryptCredential('kata-sandi-uji')
      expect(cipher.startsWith(CIPHER_PREFIX)).toBe(true)
      expect(cipher).not.toContain('kata-sandi-uji')
    } else {
      expect(() => encryptCredential('kata-sandi-uji')).toThrow(AppError)
    }
  })
})

describe('skema validasi gateway', () => {
  it('daftar pengajuan memakai view default SEMUA', () => {
    const parsed = governmentSubmissionListSchema.parse({})
    expect(parsed.view).toBe('SEMUA')
    expect(parsed.page).toBe(1)
    expect(() => governmentSubmissionListSchema.parse({ agency: 'DHELAJ' })).toThrow()
  })

  it('data isian membatasi jumlah dan panjang kunci', () => {
    expect(() => governmentDataSchema.parse({ ['x'.repeat(61)]: 'nilai' })).toThrow()
    const many = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`k${i}`, 'v']))
    expect(() => governmentDataSchema.parse(many)).toThrow()
    expect(governmentDataSchema.parse({ namaBadanHukum: 'PT Contoh' }).namaBadanHukum).toBe('PT Contoh')
  })

  it('kredensial menolak rahasia terlalu pendek', () => {
    expect(() => governmentCredentialSchema.parse({ agency: 'AHU', label: 'akun', secret: 'abc' })).toThrow()
    const ok = governmentCredentialSchema.parse({ agency: 'BPN', label: 'akun-harian', secret: 'rahasia-uji' })
    expect(ok.accountHint ?? null).toBeNull()
  })

  it('pengaktifan API tidak dapat diminta lewat payload', () => {
    expect(governmentConfigUpdateSchema.parse({ agency: 'AHU' }).apiEnabled).toBe(false)
    expect(governmentConfigUpdateSchema.parse({ agency: 'AHU', apiEnabled: true }).apiEnabled).toBe(true)
  })

  it('pembukaan portal mengirim kondisi jaringan perangkat', () => {
    const id = '7b6f0f2f-6f1e-4f0a-9f0a-1f2e3d4c5b6a'
    expect(governmentPortalOpenSchema.parse({ id }).online).toBe(true)
    expect(governmentPortalOpenSchema.parse({ id, online: false }).online).toBe(false)
    expect(() => governmentPortalOpenSchema.parse({ id: 'bukan-uuid' })).toThrow()
  })
})

describe('kelompok tampilan daftar', () => {
  it('tiga kelompok menutupi seluruh status tanpa tumpang tindih', () => {
    const groups = GOVERNMENT_VIEW_CODES.filter((v) => v !== 'SEMUA')
    const all = groups.flatMap((v) => GOVERNMENT_VIEW_GROUPS[v].statuses)
    expect(all.length).toBe(GOVERNMENT_STATUSES.length)
    expect(new Set(all).size).toBe(GOVERNMENT_STATUSES.length)
    expect(GOVERNMENT_VIEW_GROUPS.SEMUA.statuses).toEqual([...GOVERNMENT_STATUSES])
  })

  it('label tampilan memakai bahasa Indonesia', () => {
    for (const view of GOVERNMENT_VIEW_CODES) expect(GOVERNMENT_VIEW_GROUPS[view].label).toBeTruthy()
    for (const status of GOVERNMENT_STATUSES) expect(governmentStatusLabel(status)).not.toBe(status)
    expect(governmentStatusLabel(null)).toBe('—')
    expect(governmentAgencyLabel('AHU')).toBe('AHU Online')
    expect(governmentAgencyLabel('XX')).toBe('XX')
  })
})

describe('master data layanan pemerintah', () => {
  it('kode layanan unik, instansi sah, dan setiap instansi punya layanan', () => {
    const codes = GOVERNMENT_SERVICE_SEEDS.map((s) => s.code)
    expect(new Set(codes).size).toBe(codes.length)
    const agencies = GOVERNMENT_AGENCIES.map((a) => a.value)
    for (const seed of GOVERNMENT_SERVICE_SEEDS) {
      expect(agencies).toContain(seed.agency)
      expect(seed.name.length).toBeGreaterThan(3)
      expect(seed.description.length).toBeGreaterThan(10)
      expect(seed.code.startsWith(`${seed.agency}_`), seed.code).toBe(true)
    }
    for (const agency of agencies) {
      expect(GOVERNMENT_SERVICE_SEEDS.filter((s) => s.agency === agency).length).toBeGreaterThan(5)
    }
  })

  it('opsi pilihan memakai kode yang dikenal schema', () => {
    for (const kind of GOVERNMENT_FILE_KINDS) expect(kind.label).toBeTruthy()
    for (const ref of GOVERNMENT_REFERENCE_TYPES) expect(ref.value).toMatch(/^[A-Z_]+$/)
    expect(GOVERNMENT_OFFICIAL_SOURCES.map((s) => s.value)).toContain('PORTAL')
  })

  it('portal resmi memakai HTTPS pada domain pemerintah', () => {
    for (const url of Object.values(GOVERNMENT_OFFICIAL_PORTALS)) {
      expect(url.startsWith('https://')).toBe(true)
      expect(url).toMatch(/\.go\.id\/$/)
    }
  })
})

describe('pemicu integritas di basis data gateway', () => {
  const migrationsRoot = path.resolve(__dirname, '../migrations')
  const sqlFiles = ['001_init.sql', '002_immutability.sql', '003_government_integration.sql']

  function openDb(): SqliteDb {
    const nodeRequire = createRequire(__filename)
    const { DatabaseSync } = nodeRequire('node:sqlite') as { DatabaseSync: new (p: string) => SqliteDb }
    const db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys=ON')
    for (const file of sqlFiles) db.exec(fs.readFileSync(path.join(migrationsRoot, file), 'utf8'))
    return db
  }

  const now = new Date().toISOString()

  /** Kolom id diisi eksplisit karena nilai default uuid() dihasilkan Prisma di aplikasi. */
  function seed(db: SqliteDb) {
    db.exec(
      `INSERT INTO "government_services" ("id","code","agency","name","category","portalUrl","mode","isActive","sortOrder","createdAt","updatedAt")
       VALUES ('svc-1','AHU_PENDIRIAN_PT','AHU','Pendirian PT','BADAN_USAHA','https://layanan.ahu.go.id/','SEMI_OTOMATIS',1,10,'${now}','${now}')`,
    )
    db.exec(
      `INSERT INTO "government_submissions" ("id","number","agency","serviceId","title","internalStatus","officialSource","createdAt","updatedAt")
       VALUES ('sub-1','GOV/2026/0001','AHU','svc-1','Pendirian PT Uji','DRAFT','MANUAL','${now}','${now}')`,
    )
  }

  function submissionId(db: SqliteDb): string {
    return String(db.prepare(`SELECT "id" AS id FROM "government_submissions" WHERE "number"='GOV/2026/0001'`).get()?.id)
  }

  it('delapan tabel gateway terbentuk dari migrasi', () => {
    const db = openDb()
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'government_%' ORDER BY name")
      .all()
      .map((r) => String(r.name))
    expect(names.slice().sort()).toEqual([...GATEWAY_TABLES].sort())
    db.close()
  })

  it('nomor, instansi, layanan, dan pembuat terkunci setelah pengajuan dibuat', () => {
    const db = openDb()
    seed(db)
    const id = submissionId(db)
    expect(() => db.exec(`UPDATE "government_submissions" SET "number"='GOV/2026/0009' WHERE "id"='${id}'`)).toThrow()
    expect(() => db.exec(`UPDATE "government_submissions" SET "agency"='BPN' WHERE "id"='${id}'`)).toThrow()
    expect(() => db.exec(`UPDATE "government_submissions" SET "serviceId"='svc-x' WHERE "id"='${id}'`)).toThrow()
    expect(() => db.exec(`UPDATE "government_submissions" SET "createdAt"='2020-01-01' WHERE "id"='${id}'`)).toThrow()
    expect(() => db.exec(`DELETE FROM "government_submissions" WHERE "id"='${id}'`)).toThrow()
    db.close()
  })

  it('pengajuan final tidak dapat diubah sama sekali', () => {
    const db = openDb()
    seed(db)
    const id = submissionId(db)
    db.exec(`UPDATE "government_submissions" SET "internalStatus"='SELESAI' WHERE "id"='${id}'`)
    expect(() => db.exec(`UPDATE "government_submissions" SET "title"='Diubah diam-diam' WHERE "id"='${id}'`)).toThrow()
    expect(() => db.exec(`UPDATE "government_submissions" SET "internalStatus"='DIPROSES' WHERE "id"='${id}'`)).toThrow()
    db.close()
  })

  it('riwayat status, referensi, dan log sinkronisasi bersifat append-only', () => {
    const db = openDb()
    seed(db)
    const id = submissionId(db)
    db.exec(
      `INSERT INTO "government_status_history" ("id","submissionId","scope","fromStatus","toStatus","source","createdAt")
       VALUES ('hist-1','${id}','INTERNAL',NULL,'DRAFT','MANUAL','${now}')`,
    )
    db.exec(
      `INSERT INTO "government_references" ("id","submissionId","type","value","source","createdAt")
       VALUES ('ref-1','${id}','NOMOR_PERMOHONAN','AHU-0001','PORTAL','${now}')`,
    )
    db.exec(
      `INSERT INTO "government_sync_logs" ("id","submissionId","agency","direction","mode","status","message","createdAt")
       VALUES ('log-1','${id}','AHU','PENGAJUAN','SEMI_OTOMATIS','SUCCESS','Nomor dicatat','${now}')`,
    )
    expect(() => db.exec(`UPDATE "government_references" SET "value"='AHU-9999'`)).toThrow()
    expect(() => db.exec(`DELETE FROM "government_references"`)).toThrow()
    expect(() => db.exec(`UPDATE "government_status_history" SET "toStatus"='SELESAI'`)).toThrow()
    expect(() => db.exec(`DELETE FROM "government_status_history"`)).toThrow()
    expect(() => db.exec(`UPDATE "government_sync_logs" SET "status"='FAILED'`)).toThrow()
    expect(() => db.exec(`DELETE FROM "government_sync_logs"`)).toThrow()
    db.close()
  })

  it('basis data menolak kredensial tanpa awalan dpapi:', () => {
    const db = openDb()
    expect(() =>
      db.exec(
        `INSERT INTO "government_api_credentials" ("id","agency","label","cipherText","algorithm","createdAt","updatedAt")
         VALUES ('cred-1','AHU','akun-uji','rahasia-plaintext','DPAPI_SAFE_STORAGE','${now}','${now}')`,
      ),
    ).toThrow()
    expect(() =>
      db.exec(
        `INSERT INTO "government_api_credentials" ("id","agency","label","cipherText","algorithm","createdAt","updatedAt")
         VALUES ('cred-2','AHU','akun-uji','dpapi:${'A'.repeat(48)}','DPAPI_SAFE_STORAGE','${now}','${now}')`,
      ),
    ).not.toThrow()
    expect(() =>
      db.exec(`UPDATE "government_api_credentials" SET "cipherText"='rahasia-plaintext' WHERE "id"='cred-2'`),
    ).toThrow()
    db.close()
  })

  it('metadata berkas pengajuan tidak dapat diganti dan berkas tidak dapat dihapus permanen', () => {
    const db = openDb()
    seed(db)
    const id = submissionId(db)
    db.exec(
      `INSERT INTO "government_submission_files" ("id","submissionId","kind","fileName","storagePath","mimeType","sizeBytes","checksum","createdAt")
       VALUES ('file-1','${id}','DOKUMEN_PENDUKUNG','akta.pdf','government/x/akta.pdf','application/pdf',1000,'abc','${now}')`,
    )
    expect(() => db.exec(`UPDATE "government_submission_files" SET "checksum"='palsu'`)).toThrow()
    expect(() => db.exec(`DELETE FROM "government_submission_files"`)).toThrow()
    db.exec(`UPDATE "government_submission_files" SET "deletedAt"='${now}'`)
    expect(String(db.prepare(`SELECT "deletedAt" AS d FROM "government_submission_files"`).get()?.d)).toBe(now)
    db.close()
  })
})
