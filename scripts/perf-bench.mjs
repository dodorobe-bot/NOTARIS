// Benchmark performa NOTARIS PRO pada dataset sintetis.
// Jalankan: node scripts/perf-bench.mjs --profile=smoke --label=baseline
// Data uji berada di tmp/perf-<profile> dan tidak pernah menyentuh folder data pengguna.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'
import electronPath from 'electron'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const PROFILES = {
  smoke: { clients: 5_000, transactions: 5_000, deeds: 5_000, repertorium: 1_500, history: 20_000, audit: 20_000, documents: 20_000 },
  full: { clients: 100_000, transactions: 100_000, deeds: 100_000, repertorium: 30_000, history: 500_000, audit: 500_000, documents: 1_000_000 },
}

function arg(name, fallback = '') {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

const profileName = arg('profile', 'smoke')
const label = arg('label', 'run')
const skipSeed = process.argv.includes('--skip-seed')
const profile = PROFILES[profileName]
if (!profile) throw new Error(`Profil tidak dikenal: ${profileName}`)

const dataDir = path.join(root, 'tmp', `perf-${profileName}`)
const dbPath = path.join(dataDir, 'database', 'notaris_pro.db')
const resultsDir = path.join(root, 'tmp', 'perf')
const BACKUP_PASSPHRASE = 'benchmark-cadangan-2026'
const resultFile = path.join(resultsDir, `${label}-${profileName}.json`)
const account = { username: 'perf.admin', password: 'RahasiaPerf2026!', master: 'MasterPerf2026!aman' }

fs.mkdirSync(resultsDir, { recursive: true })

function log(msg, extra = '') {
  console.log(`[perf] ${msg}${extra ? ` — ${extra}` : ''}`)
}

// ---------- SQLite ----------

function openDb(readWrite = true) {
  const { DatabaseSync } = require('node:sqlite')
  return new DatabaseSync(dbPath, readWrite ? {} : { readOnly: true })
}

function quoteId(value) {
  return String(value).replace(/[^A-Za-z0-9_]/g, '')
}

function prepared(conn, sql) {
  const stmt = conn.prepare(sql)
  return { run: (...args) => stmt.run(...args.map((a) => (a instanceof Date ? a.getTime() : a))) }
}

function tableCount(conn, table) {
  try {
    return Number(conn.prepare(`SELECT COUNT(*) AS c FROM "${quoteId(table)}"`).get().c)
  } catch {
    return -1
  }
}

// ---------- dataset sintetis (bukan data klien asli) ----------

function makeRandom(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const DEPAN = ['Budi', 'Siti', 'Agus', 'Dewi', 'Eko', 'Rina', 'Anton', 'Maya', 'Hendra', 'Lina', 'Yusuf', 'Ratna', 'Dimas', 'Intan', 'Fajar', 'Nuraini']
const BELAKANG = ['Santoso', 'Wijaya', 'Kusuma', 'Pratama', 'Halim', 'Susilo', 'Utami', 'Hidayat', 'Gunawan', 'Lestari', 'Purnama', 'Setiawan']
const KOTA = ['Jakarta Selatan', 'Bandung', 'Surabaya', 'Medan', 'Semarang', 'Makassar', 'Palembang', 'Denpasar']

function pad(n, w) {
  return String(n).padStart(w, '0')
}

function uuid(rnd) {
  const hex = '0123456789abcdef'
  let out = ''
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += '-'
    else if (i === 14) out += '4'
    else out += hex[Math.floor(rnd() * 16)]
  }
  return out
}

/**
 * Mengisi database dengan data sintetis berjumlah besar.
 * Semua baris ditulis lewat SQL parameterized dalam transaksi, meniru bentuk baris
 * yang dihasilkan aplikasi (nomor, checksum, dan rantai hash audit yang sah).
 */
/** Baris audit terakhir yang sudah ditulis aplikasi (mis. SETUP) menjadi awal rantai sintetis. */
function lastAuditHash(conn) {
  const row = conn.prepare('SELECT hash FROM "AuditLog" ORDER BY id DESC LIMIT 1').get()
  return row ? String(row.hash) : null
}

function seedDatabase(conn) {
  const rnd = makeRandom(20261103)
  const day = 86_400_000
  const now = Date.now()
  const start = now - 5 * 365 * day

  const admin = conn.prepare("SELECT id, username FROM \"User\" WHERE username = ?").get(account.username)
  if (!admin) throw new Error('Akun benchmark tidak ditemukan; jalankan setup lebih dulu.')
  const deedTypes = conn.prepare('SELECT id FROM "DeedType"').all().map((r) => r.id)
  const categories = conn.prepare('SELECT id FROM "DocumentCategory"').all().map((r) => r.id)
  if (!deedTypes.length || !categories.length) throw new Error('Data referensi belum di-seed oleh aplikasi.')

  conn.exec('PRAGMA journal_mode=WAL')
  conn.exec('PRAGMA synchronous=NORMAL')
  conn.exec('PRAGMA temp_store=MEMORY')
  conn.exec('PRAGMA cache_size=-65536')
  conn.exec('PRAGMA busy_timeout=60000')

  const insertClient = prepared(conn, 
    `INSERT INTO "Client" (id, code, type, "fullName", nik, npwp, "birthPlace", "birthDate", gender, occupation,
       address, kelurahan, kecamatan, kabupaten, provinsi, "postalCode", phone, email, status, "internalNotes",
       "createdById", "createdAt", "updatedAt")
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
  const insertTransaction = prepared(conn, 
    `INSERT INTO "Transaction" (id, code, "clientId", type, "serviceType", title, description, status, priority,
       "openedAt", "createdById", "createdAt", "updatedAt")
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
  const insertDeed = prepared(conn, 
    `INSERT INTO "Deed" (id, "deedNumber", "deedTypeId", "deedDate", "transactionId", "clientId", status, title,
       penghadap, komparisi, isi, "notaryId", "signedAt", notes, "createdById", "createdAt", "updatedAt")
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
  const insertRepertorium = prepared(conn, 
    `INSERT INTO "DeedRepertorium" (id, "deedId", number, year, "registeredAt", "notaryId") VALUES (?,?,?,?,?,?)`,
  )
  const insertHistory = prepared(conn, 
    `INSERT INTO "WorkflowHistory" (id, "transactionId", "deedId", "fromStatus", "toStatus", "byUserId", note, "createdAt")
     VALUES (?,?,?,?,?,?,?,?)`,
  )
  const insertDocument = prepared(conn, 
    `INSERT INTO "Document" (id, uid, title, "categoryId", "clientId", "transactionId", "deedId", "fileName",
       "storagePath", "mimeType", "sizeBytes", checksum, version, "isConfidential", notes, "uploadedById",
       "createdAt", "updatedAt")
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
  const insertAudit = prepared(conn, 
    `INSERT INTO "AuditLog" (userId, username, action, entity, "entityId", before, after, meta, "createdAt", prevHash, hash)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  )

  const STATUS = ['DRAFT', 'REVIEW', 'APPROVED', 'SIGNED', 'REGISTERED', 'ARCHIVED']
  const WORKFLOW = ['REGISTRASI_TRANSAKSI', 'UPLOAD_DOKUMEN', 'VERIFIKASI', 'DRAFT', 'REVIEW', 'APPROVAL', 'SIGNING', 'REGISTRASI', 'SELESAI']
  const ACTIONS = [['CREATE', 'Client'], ['UPDATE', 'Client'], ['STATUS_CHANGE', 'Transaction'], ['CREATE', 'Deed'], ['UPLOAD', 'Document']]

  const clients = []
  const transactions = []
  const deeds = []
  let auditPrev = lastAuditHash(conn)
  let auditRows = 0

  const flush = (label_, done, total) => log(`seed ${label_}`, `${done.toLocaleString('id-ID')}/${total.toLocaleString('id-ID')}`)

  conn.exec('BEGIN')
  try {
    for (let i = 1; i <= profile.clients; i++) {
      const createdAt = new Date(start + Math.floor(rnd() * (now - start)))
      const badan = i % 7 === 0
      const name = badan ? `PT ${DEPAN[i % DEPAN.length]} ${BELAKANG[i % BELAKANG.length]}` : `${DEPAN[i % DEPAN.length]} ${BELAKANG[(i * 3) % BELAKANG.length]}`
      const id = uuid(rnd)
      insertClient.run(
        id, `KLN-${pad(i, 6)}`, badan ? 'BADAN_HUKUM' : 'PERORANGAN', name,
        badan ? null : `320${pad(i, 13)}`, badan ? `${pad(i, 15)}00` : null,
        KOTA[i % KOTA.length], new Date(1970 + (i % 40), i % 12, (i % 28) + 1).getTime(),
        i % 2 ? 'LAKI_LAKI' : 'PEREMPUAN', badan ? 'Perseroan Terbatas' : 'Karyawan Swasta',
        `Jl. Contoh No. ${i}, ${KOTA[i % KOTA.length]}`, `Kel. ${i % 50}`, `Kec. ${i % 20}`,
        KOTA[i % KOTA.length], 'Jawa Barat', pad(10000 + (i % 8999), 5),
        `08${pad(100000000 + i, 9)}`, badan ? `info${i}@contoh.test` : null,
        i % 11 === 0 ? 'NONAKTIF' : 'AKTIF', null, admin.id, createdAt, createdAt,
      )
      clients.push({ id, name, createdAt: createdAt.getTime() })
      if (i % 25_000 === 0) flush('klien', i, profile.clients)
    }
    flush('klien', profile.clients, profile.clients)

    for (let i = 1; i <= profile.transactions; i++) {
      const c = clients[(i * 7) % clients.length]
      const createdAt = new Date(Math.max(c.createdAt, start + rnd() * (now - start)))
      const id = uuid(rnd)
      insertTransaction.run(
        id, `TRX-${createdAt.getFullYear()}${pad(createdAt.getMonth() + 1, 2)}-${pad(i, 4)}`, c.id,
        i % 4 === 0 ? 'PPAT' : 'NOTARIS', 'PENGGANTIAN HAK', `Pekerjaan ${i} — ${c.name}`.slice(0, 120),
        'Transaksi sintetis untuk benchmark.', WORKFLOW[i % WORKFLOW.length], 'NORMAL',
        createdAt, admin.id, createdAt, createdAt,
      )
      transactions.push({ id, createdAt: createdAt.getTime() })
      if (i % 25_000 === 0) flush('transaksi', i, profile.transactions)
    }
    flush('transaksi', profile.transactions, profile.transactions)

    const yearSeq = new Map()
    for (let i = 1; i <= profile.deeds; i++) {
      const c = clients[(i * 11) % clients.length]
      const t = transactions[(i * 13) % transactions.length]
      const deedDate = new Date(Math.max(c.createdAt, start + rnd() * (now - start)))
      const year = deedDate.getFullYear()
      const seq = (yearSeq.get(year) ?? 0) + 1
      yearSeq.set(year, seq)
      const id = uuid(rnd)
      const status = STATUS[i % STATUS.length]
      insertDeed.run(
        id, `${pad(seq, 3)}/${pad(deedDate.getMonth() + 1, 2)}/${year}`, deedTypes[i % deedTypes.length],
        deedDate, t.id, c.id, status, `Akta sintetis ${i}`, c.name,
        'Penghadap dikenal oleh Notaris.', 'Isi akta sintetis untuk pengujian performa.',
        admin.id, status === 'DRAFT' ? null : deedDate, null, admin.id, deedDate, deedDate,
      )
      deeds.push({ id, number: `${pad(seq, 3)}/${pad(deedDate.getMonth() + 1, 2)}/${year}`, createdAt: deedDate.getTime(), status })
      if (i % 25_000 === 0) flush('akta', i, profile.deeds)
    }
    flush('akta', profile.deeds, profile.deeds)

    const repSeq = new Map()
    for (let i = 0; i < profile.repertorium; i++) {
      const d = deeds[(i * 3) % deeds.length]
      const when = new Date(d.createdAt + day)
      const year = when.getFullYear()
      const seq = (repSeq.get(year) ?? 0) + 1
      repSeq.set(year, seq)
      insertRepertorium.run(uuid(rnd), d.id, seq, year, when, admin.id)
    }
    flush('repertorium', profile.repertorium, profile.repertorium)

    for (let i = 0; i < profile.history; i++) {
      const t = transactions[i % transactions.length]
      const createdAt = new Date(t.createdAt + (i % 9) * day)
      const from = WORKFLOW[i % WORKFLOW.length]
      insertHistory.run(uuid(rnd), t.id, null, from, WORKFLOW[(i + 1) % WORKFLOW.length], admin.id, `Catatan riwayat ${i}`, createdAt)
      if (i % 50_000 === 0) flush('riwayat', i, profile.history)
    }
    flush('riwayat', profile.history, profile.history)

    for (let i = 0; i < profile.documents; i++) {
      const c = clients[(i * 17) % clients.length]
      const d = i % 3 === 0 ? deeds[(i * 5) % deeds.length] : null
      const createdAt = new Date(c.createdAt + (i % 30) * day)
      const ext = ['.pdf', '.docx', '.jpg'][i % 3]
      const mime = ext === '.pdf' ? 'application/pdf' : ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'image/jpeg'
      const uid = uuid(rnd)
      insertDocument.run(
        uid, uid, `Berkas ${pad(i, 7)}${ext}`, categories[i % categories.length], c.id,
        d ? null : transactions[i % transactions.length].id, d ? d.id : null,
        `${uid}${ext}`, `clients/${c.id}/${uid}${ext}`, mime, 20_000 + (i % 400_000),
        createHash('sha256').update(`dokumen-${i}`).digest('hex'), 1, i % 50 === 0 ? 1 : 0,
        'Metadata sintetis; berkas fisik sengaja tidak dibuat.', admin.id, createdAt, createdAt,
      )
      if (i % 50_000 === 0) flush('dokumen', i, profile.documents)
    }
    flush('dokumen', profile.documents, profile.documents)

    for (let i = 0; i < profile.audit; i++) {
      const [action, entity] = ACTIONS[i % ACTIONS.length]
      const createdAt = new Date(start + ((now - start) / profile.audit) * i)
      const target = entity === 'Deed' ? deeds[i % deeds.length] : entity === 'Transaction' ? transactions[i % transactions.length] : clients[i % clients.length]
      const iso = createdAt.toISOString()
      const before = action === 'CREATE' ? null : JSON.stringify({ status: 'LAMA' })
      const after = action === 'CREATE' ? JSON.stringify({ id: target.id }) : JSON.stringify({ status: 'BARU' })
      const row = {
        prevHash: auditPrev, userId: admin.id, username: admin.username, action, entity,
        entityId: target.id, createdAt: iso, before, after, meta: null,
      }
      const payload = [
        'v1', row.prevHash ?? 'GENESIS', row.userId ?? '', row.username, row.action, row.entity,
        row.entityId ?? '', row.createdAt, row.before ?? '', row.after ?? '', row.meta ?? '',
      ].join('|')
      const hash = createHash('sha256').update(payload).digest('hex')
      insertAudit.run(row.userId, row.username, row.action, row.entity, row.entityId, before, after, null, createdAt, auditPrev, hash)
      auditPrev = hash
      auditRows++
      if (i % 50_000 === 0) flush('audit', i, profile.audit)
    }
    flush('audit', auditRows, profile.audit)
    conn.exec('COMMIT')
  } catch (err) {
    conn.exec('ROLLBACK')
    throw err
  }
}

// ---------- pengukuran ----------

function percentile(sorted, p) {
  if (!sorted.length) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

function stats(samples) {
  const ok = samples.filter((s) => s.ok)
  const times = ok.map((s) => s.ms).sort((a, b) => a - b)
  const noteSample = [...samples].reverse().find((s) => s.detail)
  return {
    note: noteSample?.detail ?? null,
    repeats: samples.length,
    errors: samples.length - ok.length,
    firstError: (samples.find((s) => !s.ok) ?? {}).error ?? null,
    p50: Number(percentile(times, 50).toFixed(1)),
    p95: Number(percentile(times, 95).toFixed(1)),
    max: Number((times.at(-1) ?? 0).toFixed(1)),
    rows: (ok.at(-1) ?? {}).rows ?? null,
  }
}

const results = { profile: profileName, label, startedAt: new Date().toISOString(), node: process.version, platform: `${process.platform}`, scenarios: [] }

function saveResults() {
  fs.writeFileSync(resultFile, JSON.stringify(results, null, 2))
}

async function call(sess, route, payload) {
  return sess.page.evaluate(
    async ({ route, payload }) => {
      const t0 = performance.now()
      const res = await window.notaris.call(route, payload)
      const t1 = performance.now()
      const rows = Array.isArray(res?.data?.items) ? res.data.items.length : Array.isArray(res?.data) ? res.data.length : null
      const detail = typeof res?.data?.detail === 'string' ? res.data.detail.slice(0, 180) : null
      return { ms: t1 - t0, ok: Boolean(res?.ok), code: res?.code ?? null, error: res?.error ?? null, rows, detail }
    },
    { route, payload },
  )
}

async function measure(sess, scenario, ctx) {
  if (scenario.prepare) await scenario.prepare(sess, ctx)
  const payload = typeof scenario.payload === 'function' ? scenario.payload(ctx) : scenario.payload
  const samples = []
  const warmup = await call(sess, scenario.route, payload)
  samples.push(warmup)
  if (!warmup.ok && scenario.failFast !== false) {
    const s = stats(samples)
    log(scenario.id, `GAGAL ${warmup.code}: ${warmup.error}`)
    return { ...s, failed: true }
  }
  for (let i = 1; i < scenario.repeats; i++) samples.push(await call(sess, scenario.route, payload))
  const timed = samples.slice(1)
  const s = stats(timed.length ? timed : samples)
  log(
    scenario.id,
    `p50 ${s.p50} ms · p95 ${s.p95} ms · maks ${s.max} ms${s.rows === null ? '' : ` · ${s.rows} baris`}${s.errors ? ` · ${s.errors} error` : ''} · RAM bebas ${freeRamMb().toLocaleString('id-ID')} MB${s.note ? ` · ${s.note}` : ''}`,
  )
  return s
}

const SCENARIOS = [
  { id: 'cari-nama-klien', route: 'clients.list', payload: (c) => ({ page: 1, pageSize: 25, search: c.namaKlien }), repeats: 12 },
  { id: 'cari-nomor-akta-global', route: 'search.global', payload: (c) => ({ query: c.nomorAkta }), repeats: 12 },
  { id: 'filter-tanggal-akta', route: 'deeds.list', payload: (c) => ({ page: 1, pageSize: 50, year: c.year }), repeats: 12 },
  { id: 'filter-status-transaksi', route: 'transactions.list', payload: () => ({ page: 1, pageSize: 50, status: 'SELESAI' }), repeats: 12 },
  { id: 'halaman-dalam-tabel-klien', route: 'clients.list', payload: (c) => ({ page: c.deepPage, pageSize: 50 }), repeats: 8 },
  { id: 'halaman-1-klien', route: 'clients.list', payload: () => ({ page: 1, pageSize: 50 }), repeats: 12 },
  { id: 'detail-klien', route: 'clients.get', payload: (c) => ({ id: c.clientId }), repeats: 12 },
  { id: 'detail-akta', route: 'deeds.get', payload: (c) => ({ id: c.deedId }), repeats: 12 },
  { id: 'daftar-dokumen', route: 'documents.list', payload: (c) => ({ page: 1, pageSize: 50, clientId: c.clientId }), repeats: 12 },
  { id: 'daftar-repertorium', route: 'deeds.repertorium.list', payload: () => ({ page: 1, pageSize: 50 }), repeats: 8 },
  { id: 'dashboard', route: 'dashboard.get', payload: () => ({ months: 12 }), repeats: 8 },
  { id: 'daftar-audit', route: 'audit.list', payload: () => ({ page: 1, pageSize: 50 }), repeats: 8 },
  { id: 'verifikasi-rantai-audit', route: 'audit.verify', payload: () => ({}), repeats: 2 },
  { id: 'buat-transaksi', route: 'transactions.create', payload: (c) => ({ clientId: c.clientId, type: 'NOTARIS', title: 'Transaksi benchmark', priority: 'NORMAL' }), repeats: 20 },
  { id: 'ubah-klien', route: 'clients.update', payload: (c) => c.clientForUpdate, repeats: 20 },
  { id: 'laporan-akta', route: 'reports.generate', payload: (c) => ({ id: 'deeds', year: c.year }), repeats: 3 },
  { id: 'laporan-klien', route: 'reports.generate', payload: () => ({ id: 'clients' }), repeats: 2 },
  {
    id: 'laporan-akta-sempit',
    route: 'reports.generate',
    payload: () => ({ id: 'deeds', from: '2026-01-01', to: '2026-01-08' }),
    repeats: 6,
  },
  {
    id: 'ekspor-excel-akta-sempit',
    route: 'reports.exportExcel',
    payload: () => ({ id: 'deeds', from: '2026-01-01', to: '2026-01-08' }),
    repeats: 2,
  },
  {
    id: 'ekspor-pdf-akta-sempit',
    route: 'reports.exportPdf',
    payload: () => ({ id: 'deeds', from: '2026-01-01', to: '2026-01-08' }),
    repeats: 1,
  },
  { id: 'ekspor-excel-akta', route: 'reports.exportExcel', payload: (c) => ({ id: 'deeds', year: c.year }), repeats: 2 },
  { id: 'ekspor-pdf-akta-per-tahun', route: 'reports.exportPdf', payload: (c) => ({ id: 'deeds', year: c.year }), repeats: 1 },
  {
    id: 'backup',
    route: 'backup.create',
    // Vault dimatikan di harness (enkripsi vault membaca seluruh berkas ke memori), jadi
    // cadangan dienkripsi dengan passphrase — jalur yang sama dengan "backup tanpa membuka vault".
    payload: () => ({ includeDocuments: false, passphrase: BACKUP_PASSPHRASE, note: 'Benchmark backup' }),
    repeats: 1,
  },
  {
    id: 'validasi-backup',
    route: 'backup.validate',
    prepare: async (sess, c) => {
      const list = await sess.api('backup.list', {})
      c.backupFileName = list.files[0]?.fileName ?? null
    },
    payload: (c) => ({ fileName: c.backupFileName, passphrase: BACKUP_PASSPHRASE }),
    repeats: 1,
  },
  {
    id: 'restore',
    route: 'backup.restore',
    payload: (c) => ({ fileName: c.backupFileName, passphrase: BACKUP_PASSPHRASE }),
    repeats: 1,
  },
]

async function memoryAndCpu(app) {
  return app.evaluate(({ app: electronApp }) => electronApp.getAppMetrics())
}

function freeRamMb() {
  return Math.round(os.freemem() / 1048576)
}

function totalRssKb(metrics) {
  return metrics.reduce((sum, m) => sum + (m.memory?.workingSetSize ?? 0), 0)
}

async function main() {
  if (!fs.existsSync(path.join(root, 'out', 'main', 'index.js'))) {
    throw new Error('Build belum ada. Jalankan npm run build lebih dulu.')
  }
  fs.mkdirSync(path.join(dataDir, 'database'), { recursive: true })

  const env = {
    ...process.env,
    NOTARIS_DATA_DIR: dataDir,
    ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
    // Vault dimatikan pada laju benchmark: mengunci vault membaca seluruh berkas database ke memori,
    // dan pada host 3,8 GB itu membunuh proses sebelum pengukuran sempat berjalan.
    NOTARIS_VAULT: 'off',
    // Batas heap proses utama: kegagalan alokasi harus menjadi error Node, bukan membuat OS kehabisan commit.
    NODE_OPTIONS: '--max-old-space-size=1024',
  }
  delete env.ELECTRON_RUN_AS_NODE

  const consoleErrors = []

  async function launch(tag) {
    const t0 = Date.now()
    const app = await electron.launch({ executablePath: electronPath, args: ['.'], cwd: root, env })
    const page = await app.firstWindow()
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
    page.on('console', (m) => { if (m.type() === 'error' && !/ResizeObserver|DevTools/.test(m.text())) consoleErrors.push(`console: ${m.text()}`) })
    await page.waitForLoadState('domcontentloaded')
    const sess = {
      app,
      page,
      startupMs: Date.now() - t0,
      api: async (route, payload = {}) => {
        const res = await page.evaluate(({ route, payload }) => window.notaris.call(route, payload), { route, payload })
        if (!res?.ok) throw new Error(`${route} gagal: ${res?.error ?? 'tanpa respons'} (${res?.code ?? '-'})`)
        return res.data
      },
    }
    log('aplikasi', `${tag} siap dalam ${sess.startupMs.toLocaleString('id-ID')} ms · RAM bebas ${freeRamMb().toLocaleString('id-ID')} MB`)
    return sess
  }

  async function ensureLogin(sess) {
    const setup = await sess.api('setup.status')
    if (setup.needsSetup) {
      await sess.api('setup.complete', {
        officeName: 'Kantor Notaris Benchmark',
        notaryName: 'Notaris Benchmark, S.H., M.Kn.',
        adminFullName: 'Administrator Benchmark',
        username: account.username,
        email: 'perf@contoh.test',
        password: account.password,
        masterPassword: account.master,
        confirmMasterPassword: account.master,
      })
      log('setup', 'database benchmark dibuat melalui API aplikasi')
      return
    }
    if (setup.vault?.status === 'LOCKED') {
      await sess.api('vault.unlock', { password: account.master })
      log('setup', 'vault dibuka')
    }
    await sess.api('auth.login', { username: account.username, password: account.password })
      .catch((err) => log('setup', `login dilewati: ${err.message.slice(0, 90)}`))
  }

  log('langkah', `profil ${profileName} · label ${label} · data ${dataDir} · RAM bebas ${freeRamMb().toLocaleString('id-ID')} MB`)
  let sess = await launch('bootstrap')
  await ensureLogin(sess)

  // Seed dilakukan setelah aplikasi ditutup. Pada profil penuh database mencapai >1 GB; membiarkan
  // Electron dan Chromium hidup selama seed membuat commit OS habis dan proses dibunuh di tengah jalan.
  if (!skipSeed) {
    let existing = 0
    try {
      const probe = openDb()
      try { existing = tableCount(probe, 'Client') } finally { probe.close() }
    } catch { existing = 0 }
    if (existing >= profile.clients) {
      log('seed', `dilewati (klien sudah ${existing.toLocaleString('id-ID')})`)
    } else {
      await sess.app.close()
      const t0 = Date.now()
      const conn = openDb()
      try {
        seedDatabase(conn)
        conn.exec('PRAGMA wal_checkpoint(TRUNCATE)')
      } finally {
        conn.close()
      }
      log('seed', `selesai dalam ${((Date.now() - t0) / 1000).toFixed(1)} s · RAM bebas ${freeRamMb().toLocaleString('id-ID')} MB`)
      sess = await launch('ukur')
      await ensureLogin(sess)
    }
  }
  results.startupMs = sess.startupMs

  const inventory = {}
  const counts = openDb(false)
  try {
    for (const t of ['Client', 'Transaction', 'Deed', 'Document', 'WorkflowHistory', 'AuditLog', 'DeedRepertorium']) {
      inventory[t] = tableCount(counts, t)
    }
  } finally {
    counts.close()
  }
  results.device = {
    totalRamMb: Math.round(os.totalmem() / 1048576),
    freeRamMbAtStart: Math.round(os.freemem() / 1048576),
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
  }
  results.rows = inventory
  results.databaseBytes = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0
  log('dataset', Object.entries(inventory).map(([k, v]) => `${k}=${v.toLocaleString('id-ID')}`).join(' '))

  // Konteks untuk payload skenario: diambil lewat API, bukan dengan query tambahan di harness.
  const firstClients = await sess.api('clients.list', { page: 1, pageSize: 50 })
  const firstDeeds = await sess.api('deeds.list', { page: 1, pageSize: 20 })
  const ctx = {
    clientId: firstClients.items[0].id,
    namaKlien: firstClients.items[3]?.fullName?.split(' ').slice(-1)[0] ?? 'a',
    nomorAkta: firstDeeds.items[0].deedNumber,
    deedId: firstDeeds.items[0].id,
    year: new Date().getFullYear() - 1,
    deepPage: Math.max(2, Math.ceil(firstClients.total / 50) - 1),
    clientForUpdate: null,
  }
  const detail = await sess.api('clients.get', { id: ctx.clientId })
  ctx.clientForUpdate = {
    id: ctx.clientId,
    type: detail.type,
    fullName: detail.fullName,
    nik: detail.nik ?? null,
    npwp: detail.npwp ?? null,
    phone: detail.phone ?? null,
    email: null,
    address: detail.address ?? null,
    status: detail.status,
    identities: [],
  }

  let metrics = null
  for (const scenario of SCENARIOS) {
    try {
      const s = await measure(sess, scenario, ctx)
      results.scenarios.push({ id: scenario.id, route: scenario.route, ...s })
    } catch (err) {
      const message = String(err).slice(0, 300)
      const dead = /Target page, context or browser has been closed|has been crashed|Electron failed to launch/i.test(message)
      results.scenarios.push({ id: scenario.id, route: scenario.route, failed: true, appDied: dead, error: message })
      log(scenario.id, `EKSEPSI ${message.slice(0, 160)}`)
      if (dead) {
        log(scenario.id, `aplikasi mati (RAM bebas ${freeRamMb().toLocaleString('id-ID')} MB) — memulai ulang untuk skenario berikutnya`)
        try { await sess.app.close() } catch { /* sudah mati */ }
        sess = await launch('lanjut')
        await ensureLogin(sess)
      }
    }
    saveResults()
  }

  try {
    metrics = await memoryAndCpu(sess.app)
    results.memoryKb = totalRssKb(metrics)
    results.processes = metrics.length
  } catch (err) {
    log('memori', `gagal membaca metrik proses: ${String(err).slice(0, 120)}`)
  }
  results.startupMs = sess.startupMs
  results.consoleErrors = consoleErrors
  results.finishedAt = new Date().toISOString()
  saveResults()

  const report = [
    `# Benchmark ${label} — profil ${profileName}`,
    '',
    `- Waktu: ${results.startedAt} → ${results.finishedAt}`,
    `- Perangkat uji: ${process.platform} ${process.arch}, Node ${process.version}, RAM ${results.device.totalRamMb.toLocaleString('id-ID')} MB (${results.device.cpus} CPU: ${results.device.cpuModel})`,
    `- Ukuran database: ${results.databaseBytes.toLocaleString('id-ID')} byte`,
    `- Waktu siap aplikasi (launch sampai jendela pertama): ${results.startupMs?.toLocaleString('id-ID') ?? '-'} ms`,
    `- Baris: ${Object.entries(inventory).map(([k, v]) => `${k} ${v.toLocaleString('id-ID')}`).join(', ')}`,
    `- Memori proses Electron saat selesai: ${results.memoryKb ? `${(results.memoryKb / 1024).toFixed(0)} MB RSS gabungan (${results.processes} proses)` : 'tidak terbaca (aplikasi mati)'}`,
    `- Error konsol renderer: ${consoleErrors.length}`,
    '',
    '| Skenario | Rute | p50 (ms) | p95 (ms) | maks (ms) | baris | error | catatan |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
    ...results.scenarios.map((s) => `| ${s.id} | \`${s.route}\` | ${s.p50 ?? '-'} | ${s.p95 ?? '-'} | ${s.max ?? '-'} | ${s.rows ?? '-'} | ${s.errors ?? (s.failed ? s.appDied ? 'MATI' : 'GAGAL' : 0)} | ${s.note ?? (s.error ?? '-')} |`),
    '',
  ].join('\n')
  fs.writeFileSync(path.join(resultsDir, `${label}-${profileName}.md`), report)
  log('laporan', path.join(resultsDir, `${label}-${profileName}.md`))

  await sess.app.close()
}

main().catch((err) => {
  console.error(`[perf] GAGAL: ${err.message}`)
  saveResults()
  process.exit(1)
})
