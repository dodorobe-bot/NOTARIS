import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'
import electronPath from 'electron'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packagedApp = process.env.E2E_APP ? path.resolve(root, process.env.E2E_APP) : null
const dataDir = path.join(root, 'tmp', packagedApp ? 'e2e-packaged' : 'e2e-data')
const admin = { username: 'admin.e2e', password: 'RahasiaE2E2026!', master: 'MasterE2E2026!aman' }
/** Jendela utama; dipakai helper gateway supaya tidak perlu meneruskan `page` di setiap panggilan. */
let pageRef = null

function log(step, detail = '') {
  console.log(`[e2e] ${step}${detail ? ` — ${detail}` : ''}`)
}

function fail(message) {
  throw new Error(message)
}

function build() {
  log('build', 'menjalankan electron-vite build dari sumber terkini')
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const res = spawnSync(npm, ['run', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
  if (res.status !== 0) fail('Build gagal; e2e dihentikan.')
}

function resetDataDir() {
  fs.rmSync(dataDir, { recursive: true, force: true })
  fs.mkdirSync(dataDir, { recursive: true })
}

async function callRaw(page, route, payload = {}) {
  return page.evaluate(
    ({ route, payload }) => window.notaris.call(route, payload),
    { route, payload },
  )
}

async function api(page, route, payload = {}) {
  const res = await callRaw(page, route, payload)
  if (!res || !res.ok) {
    fail(`Route ${route} gagal: ${res?.error ?? 'tidak ada respons'} (${res?.code ?? '-'})`)
  }
  return res.data
}

async function waitForText(page, text, timeout = 30_000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout })
}

const AHU_PORTAL = 'https://layanan.ahu.go.id/'
const BPN_PORTAL = 'https://mitra.atrbpn.go.id/'
const GOV_SECRET = 'RahasiaPortalE2E-2026!'
const GOV_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

function writeGovFile(name) {
  const target = path.join(root, 'tmp', name)
  fs.writeFileSync(target, GOV_PNG)
  return target
}

function assertExportedFile(exported, label, magic) {
  if (!exported?.filePath || !fs.existsSync(exported.filePath)) fail(`${label}: berkas ekspor tidak ditemukan`)
  const size = fs.statSync(exported.filePath).size
  const head = fs.readFileSync(exported.filePath).subarray(0, magic.length).toString('latin1')
  if (size < 1000 || head !== magic) fail(`${label}: berkas ekspor tidak sah (${size} byte, awalan "${head}")`)
}

/** Memanggil rute yang HARUS ditolak; mengembalikan pesan errornya. */
async function expectRejection(routeName, payload, code, label) {
  const res = await callRaw(pageRef, routeName, payload)
  if (res?.ok) fail(`${label} seharusnya ditolak, tetapi diterima`)
  if (res?.code !== code) fail(`${label} ditolak dengan kode ${res?.code ?? '-'}, seharusnya ${code}: ${res?.error}`)
  return String(res.error)
}

async function changeStatus(id, toStatus, extra = {}) {
  return api(pageRef, 'government.submissions.changeStatus', { id, toStatus, ...extra })
}

/** Membaca column cipherText langsung dari basis data untuk membuktikan tidak ada plaintext. */
async function gatewayCipherRows() {
  const dbPath = path.join(dataDir, 'database', 'notaris_pro.db')
  if (!fs.existsSync(dbPath)) fail(`Basis data tidak ditemukan di ${dbPath}`)
  const { DatabaseSync } = await import('node:sqlite')
  const query = 'SELECT "cipherText" AS c FROM "government_api_credentials"'
  let db
  try {
    db = new DatabaseSync(dbPath, { readOnly: true })
  } catch {
    db = new DatabaseSync(dbPath)
  }
  try {
    return db.prepare(query).all().map((row) => String(row.c))
  } finally {
    db.close()
  }
}

async function runGovernment(client, trx) {
  const pendukung = writeGovFile('gov-pendukung.png')
  const bukti = writeGovFile('gov-bukti.png')
  const hasil = writeGovFile('gov-hasil.png')

  const services = await api(pageRef, 'government.services', { agency: 'AHU' })
  if (services.length < 6) fail(`Layanan AHU ${services.length}, seharusnya minimal 6`)
  if (services.some((s) => s.portalUrl !== AHU_PORTAL)) fail('Ada layanan AHU yang tidak menunjuk portal resmi')
  const service = services.find((s) => s.code === 'AHU_PENDIRIAN_PT')
  if (!service) fail('Layanan AHU_PENDIRIAN_PT tidak tersedia')
  if (!service.checklist.length || !service.fields.length) fail('Checklist/field template layanan AHU kosong')

  const before = await api(pageRef, 'government.dashboard')
  if (before.totals.submissions !== 0 || before.totals.files !== 0 || before.totals.references !== 0) {
    fail(`Modul gateway sudah berisi data contoh: ${JSON.stringify(before.totals)}`)
  }
  if (before.agencies.some((a) => a.officialApiAvailable || a.automatedSubmission || a.apiEnabled)) {
    fail('Dashboard gateway mengklaim API resmi aktif padahal belum diuji')
  }
  log('gateway', `${services.length} layanan AHU termuat, nol data contoh, klaim API resmi = tidak aktif`)

  const mismatch = await expectRejection(
    'government.submissions.create',
    { agency: 'BPN', serviceId: service.id, title: 'Salah instansi uji', data: {} },
    'VALIDATION',
    'pengajuan BPN memakai layanan AHU',
  )
  if (!/sesuai dengan agen/i.test(mismatch)) fail(mismatch)

  const sub = await api(pageRef, 'government.submissions.create', {
    agency: 'AHU',
    serviceId: service.id,
    clientId: client.id,
    transactionId: trx.id,
    title: 'Pendirian PT Uji Gateway',
    description: 'Pengajuan pengujian end-to-end jalur AHU.',
    data: {},
  })
  if (!/^GOV\/\d{4}\/\d{4}$/.test(sub.number)) fail(`Nomor pengajuan tidak sesuai pola: ${sub.number}`)
  if (sub.internalStatus !== 'DRAFT') fail(`Status awal pengajuan ${sub.internalStatus}, seharusnya DRAFT`)

  const wrongJump = await expectRejection(
    'government.submissions.changeStatus',
    { id: sub.id, toStatus: 'SELESAI' },
    'CONFLICT',
    'lompatan Draft langsung ke Selesai',
  )
  if (!/tidak dapat berpindah/.test(wrongJump)) fail(wrongJump)
  const tooEarly = await expectRejection(
    'government.submissions.changeStatus',
    { id: sub.id, toStatus: 'SIAP_DIAJUKAN' },
    'VALIDATION',
    'penandaan siap tanpa kelengkapan',
  )
  if (!/data pengajuan/.test(tooEarly) || !/dokumen pendukung/.test(tooEarly)) {
    fail(`Syarat "Siap Diajukan" tidak dirinci: ${tooEarly}`)
  }

  await api(pageRef, 'government.submissions.update', {
    id: sub.id,
    title: 'Pendirian PT Uji Gateway',
    description: 'Data persiapan diisi petugas.',
    clientId: client.id,
    transactionId: trx.id,
    data: { namaBadanHukum: 'PT Uji Gateway Nusantara', nomorAkta: '12', modalDasar: 'Rp 50.000.000' },
  })
  const prepared = await api(pageRef, 'government.submissions.get', { id: sub.id })
  if (Object.keys(prepared.data).length !== 3) fail(`Data isian ${Object.keys(prepared.data).length}, seharusnya 3`)

  const fileSupport = await api(pageRef, 'government.files.add', {
    submissionId: sub.id,
    kind: 'DOKUMEN_PENDUKUNG',
    tempPath: pendukung,
    originalName: 'dokumen-pendukung.png',
    notes: 'Berkas persiapan untuk pengisian portal',
  })
  if (!/^[0-9a-f]{64}$/.test(fileSupport.checksum)) fail(`Checksum bukan SHA-256: ${fileSupport.checksum}`)

  await changeStatus(sub.id, 'SIAP_DIAJUKAN', { note: 'Kelengkapan diperiksa petugas.' })
  await changeStatus(sub.id, 'MENUNGGU_PORTAL', { note: 'Operator akan mengisi formulir di portal AHU.' })

  const opened = await api(pageRef, 'government.submissions.portalOpened', { id: sub.id, online: true })
  if (opened.portalUrl !== AHU_PORTAL) fail(`Portal yang dibuka bukan URL resmi: ${opened.portalUrl}`)
  await api(pageRef, 'government.submissions.portalOpened', { id: sub.id, online: false })
  const offlineLogs = await api(pageRef, 'government.syncLogs.list', {
    page: 1, pageSize: 20, submissionId: sub.id, status: 'PENDING', search: 'luring',
  })
  if (offlineLogs.total !== 1) fail(`Catatan pembuka portal saat luring ${offlineLogs.total}, seharusnya 1`)

  const noRef = await expectRejection(
    'government.submissions.changeStatus',
    { id: sub.id, toStatus: 'DIAJUKAN' },
    'VALIDATION',
    'penandaan diajukan tanpa nomor resmi',
  )
  if (!/nomor permohonan/.test(noRef) || !/bukti pengajuan/.test(noRef)) fail(`Syarat "Diajukan" tidak dirinci: ${noRef}`)

  await api(pageRef, 'government.submissions.addReference', {
    submissionId: sub.id,
    type: 'NOMOR_PERMOHONAN',
    value: 'AHU-2026-000777',
    source: 'PORTAL',
    issuedAt: jakartaDay(0),
    notes: 'Nomor permohonan dari portal AHU Online',
  })
  const withRef = await api(pageRef, 'government.submissions.get', { id: sub.id })
  if (withRef.externalRef !== 'AHU-2026-000777') fail(`Nomor resmi tidak tercatat: ${withRef.externalRef}`)
  if (withRef.references.length !== 1) fail(`Referensi ${withRef.references.length}, seharusnya 1`)
  const noEvidence = await expectRejection(
    'government.submissions.changeStatus',
    { id: sub.id, toStatus: 'DIAJUKAN' },
    'VALIDATION',
    'penandaan diajukan tanpa bukti',
  )
  if (/nomor permohonan/.test(noEvidence)) fail(`Nomor resmi sudah ada tetapi masih diminta: ${noEvidence}`)

  await api(pageRef, 'government.files.add', {
    submissionId: sub.id,
    kind: 'BUKTI_PENGAJUAN',
    tempPath: bukti,
    originalName: 'bukti-pengajuan.png',
    notes: 'Tanda terima portal',
  })
  const submitted = await changeStatus(sub.id, 'DIAJUKAN', {
    source: 'PORTAL',
    note: 'Operator mengirim pengajuan pada portal AHU Online.',
  })
  if (!submitted.submittedAt) fail('Waktu pengajuan (submittedAt) tidak tercatat')

  await api(pageRef, 'government.submissions.recordOfficialStatus', {
    id: sub.id,
    officialStatus: 'Dalam verifikasi AHU',
    source: 'PORTAL',
    note: 'Status dilihat petugas pada portal.',
  })
  const processed = await changeStatus(sub.id, 'DIPROSES', { source: 'PORTAL', note: 'Berkas diproses petugas AHU.' })
  if (processed.internalStatus !== 'DIPROSES') fail(`Status internal ${processed.internalStatus}, seharusnya DIPROSES`)
  if (processed.officialStatus !== 'Dalam verifikasi AHU') fail('Status resmi tidak tersimpan terpisah dari status internal')

  const noResult = await expectRejection(
    'government.submissions.changeStatus',
    { id: sub.id, toStatus: 'SELESAI' },
    'VALIDATION',
    'penandaan selesai tanpa hasil resmi',
  )
  if (!/hasil layanan/.test(noResult)) fail(`Syarat "Selesai" tidak dirinci: ${noResult}`)

  await api(pageRef, 'government.files.add', {
    submissionId: sub.id,
    kind: 'HASIL_LAYANAN',
    tempPath: hasil,
    originalName: 'sk-hukum.png',
    notes: 'SK Hukum sebagai hasil layanan',
  })
  const done = await changeStatus(sub.id, 'SELESAI', {
    source: 'SURAT_RESMI',
    officialStatus: 'SK Hukum diterbitkan',
    note: 'Bukti hasil layanan diunggah.',
  })
  if (done.internalStatus !== 'SELESAI') fail(`Status akhir ${done.internalStatus}, seharusnya SELESAI`)

  await expectRejection(
    'government.submissions.update',
    { id: sub.id, title: 'Diubah Diam-diam', data: {} },
    'CONFLICT',
    'perubahan judul pada pengajuan final',
  )
  await expectRejection(
    'government.submissions.changeStatus',
    { id: sub.id, toStatus: 'DIPROSES' },
    'CONFLICT',
    'perubahan status pada pengajuan final',
  )
  await expectRejection(
    'government.files.add',
    { submissionId: sub.id, kind: 'DOKUMEN_PENDUKUNG', tempPath: pendukung, originalName: 'selip.png' },
    'CONFLICT',
    'penambahan berkas pada pengajuan final',
  )
  await expectRejection('government.files.remove', { id: fileSupport.id }, 'CONFLICT', 'pengeluaran berkas pada pengajuan final')
  const finalDetail = await api(pageRef, 'government.submissions.get', { id: sub.id })
  if (!finalDetail.isFinal) fail('Pengajuan final tidak ditandai terkunci')
  if (finalDetail.transitions.length !== 0) fail('Pengajuan final masih menawarkan transisi status')
  if (finalDetail.statusHistory.length < 7) fail(`Riwayat status ${finalDetail.statusHistory.length} baris, seharusnya minimal 7`)

  const files = await api(pageRef, 'government.files.list', { page: 1, pageSize: 20, submissionId: sub.id })
  if (files.total !== 3) fail(`Berkas pengajuan ${files.total}, seharusnya 3`)
  if (files.items.some((f) => !/^[0-9a-f]{64}$/.test(f.checksum))) fail('Ada berkas pengajuan tanpa checksum SHA-256')
  const preview = await api(pageRef, 'government.files.preview', { id: fileSupport.id })
  if (preview.tooLarge || !String(preview.dataUrl).startsWith('data:image/png')) fail('Pratinjau berkas pengajuan tidak valid')

  const summaryPath = path.join(root, 'tmp', 'lembar-persiapan-e2e.pdf')
  const summary = await api(pageRef, 'government.submissions.exportSummary', { id: sub.id, filePath: summaryPath })
  if (summary.canceled !== false || !fs.existsSync(summary.filePath) || fs.statSync(summary.filePath).size < 1000) {
    fail('Lembar persiapan PDF gateway tidak terbentuk')
  }

  const drafts = await pageRef.evaluate(async ({ serviceId, clientId }) => {
    const jobs = Array.from({ length: 5 }, (_, i) =>
      window.notaris.call('government.submissions.create', {
        agency: 'AHU', serviceId, clientId, title: `Pengajuan paralel ${i + 1}`, data: {},
      }),
    )
    return Promise.all(jobs)
  }, { serviceId: service.id, clientId: client.id })
  const badDraft = drafts.find((r) => !r.ok)
  if (badDraft) fail(`Pembuatan pengajuan paralel gagal: ${badDraft.error}`)
  const numbers = drafts.map((r) => r.data.number)
  if (new Set(numbers).size !== numbers.length) fail(`Nomor pengajuan duplikat: ${numbers.join(', ')}`)
  for (const draft of drafts) {
    await changeStatus(draft.data.id, 'DIBATALKAN', { note: 'Dibatalkan; hanya dipakai uji penomoran.' })
  }
  const cancelled = await api(pageRef, 'government.submissions.list', {
    page: 1, pageSize: 20, agency: 'AHU', view: 'FINAL', search: 'Pengajuan paralel',
  })
  if (cancelled.total !== numbers.length) fail(`Pengajuan dibatalkan ${cancelled.total}, seharusnya ${numbers.length}`)
  log('penomoran', `${numbers.length} pengajuan gateway paralel memperoleh nomor GOV unik`)

  const bpnServices = await api(pageRef, 'government.services', { agency: 'BPN' })
  if (bpnServices.length < 6) fail(`Layanan BPN ${bpnServices.length}, seharusnya minimal 6`)
  if (bpnServices.some((s) => s.portalUrl !== BPN_PORTAL)) fail('Ada layanan BPN yang tidak menunjuk Aplikasi Mitra resmi')
  const bpnSub = await api(pageRef, 'government.submissions.create', {
    agency: 'BPN',
    serviceId: bpnServices[0].id,
    clientId: client.id,
    transactionId: trx.id,
    title: 'Balik Nama Tanah Uji Gateway',
    description: 'Pengajuan pertanahan untuk pengujian end-to-end.',
    data: { nomorSertifikat: '13.04.04.1.0.1234', jenisHak: 'SHM' },
  })
  await api(pageRef, 'government.files.add', {
    submissionId: bpnSub.id,
    kind: 'DOKUMEN_PENDUKUNG',
    tempPath: pendukung,
    originalName: 'sertifikat.png',
    notes: 'Sertifikat tanah',
  })
  await changeStatus(bpnSub.id, 'SIAP_DIAJUKAN', { note: 'Berkas pertanahan siap diisi pada Aplikasi Mitra.' })
  const bpnDetail = await api(pageRef, 'government.submissions.get', { id: bpnSub.id })
  if (bpnDetail.portalUrl !== BPN_PORTAL) fail(`Portal BPN salah: ${bpnDetail.portalUrl}`)

  const after = await api(pageRef, 'government.dashboard')
  if (after.totals.finished !== 1 || after.totals.cancelled !== numbers.length || after.totals.ready !== 1) {
    fail(`Ringkasan dashboard gateway tidak cocok: ${JSON.stringify(after.totals)}`)
  }
  const ahuOpen = after.agencies.find((a) => a.agency === 'AHU')?.openCount
  const bpnOpen = after.agencies.find((a) => a.agency === 'BPN')?.openCount
  if (ahuOpen !== 0 || bpnOpen !== 1) fail(`Pengajuan berjalan AHU=${ahuOpen}, BPN=${bpnOpen}; seharusnya 0 dan 1`)
  log('gateway', `${sub.number} Draft→Selesai dengan nomor+bukti+hasil, ${numbers.length} draft dibatalkan, 1 pengajuan BPN siap`)

  const config = await api(pageRef, 'government.config.get')
  const ahuConfig = config.agencies.find((a) => a.agency === 'AHU')
  if (!ahuConfig || ahuConfig.officialApiAvailable || ahuConfig.automatedSubmission) fail('Kapabilitas AHU tidak jujur')
  if (config.portals.AHU !== AHU_PORTAL || config.portals.BPN !== BPN_PORTAL) fail('Portal resmi pada konfigurasi tidak sesuai')
  const tryEnable = await expectRejection('government.config.update', { agency: 'AHU', apiEnabled: true }, 'CONFLICT', 'pengaktifan API resmi')
  if (!/belum tersedia/.test(tryEnable)) fail(tryEnable)
  await api(pageRef, 'government.config.update', {
    agency: 'AHU',
    notes: 'Catatan uji gateway: pengisian dan pengajuan tetap manual di portal resmi.',
    apiEnabled: false,
  })
  const configAfter = await api(pageRef, 'government.config.get')
  if (!/tetap manual di portal resmi/.test(configAfter.agencies.find((a) => a.agency === 'AHU')?.notes ?? '')) {
    fail('Catatan konfigurasi gateway tidak tersimpan')
  }
  if (configAfter.agencies.some((a) => a.apiEnabled)) fail('Konfigurasi mengembalikan API aktif')

  if (config.encryption.available) {
    const cred = await api(pageRef, 'government.credentials.save', {
      agency: 'AHU', label: 'Akun Portal Uji', accountHint: 'petugas.ahu@contoh.test', secret: GOV_SECRET,
    })
    if ('cipherText' in cred || 'secret' in cred) fail('Respons kredensial memuat field rahasia')
    if (JSON.stringify(await api(pageRef, 'government.config.get')).includes(GOV_SECRET)) {
      fail('Rahasia portal dikirim ke antarmuka lewat government.config.get')
    }
    const tested = await api(pageRef, 'government.credentials.test', { id: cred.id })
    if (tested.decryptedLength !== GOV_SECRET.length || JSON.stringify(tested).includes(GOV_SECRET)) {
      fail(`Uji kredensial mengembalikan ${JSON.stringify(tested)}`)
    }
    const rows = await gatewayCipherRows()
    if (rows.length !== 1) fail(`Baris kredensial di basis data ${rows.length}, seharusnya 1`)
    if (!rows[0].startsWith('dpapi:')) fail(`Kredensial disimpan tanpa awalan dpapi: ${rows[0].slice(0, 20)}`)
    if (rows[0].includes(GOV_SECRET)) fail('Password portal tersimpan sebagai teks terbuka di basis data')
    await api(pageRef, 'government.credentials.delete', { id: cred.id })
    if ((await gatewayCipherRows()).length !== 0) fail('Kredensial masih ada setelah penghapusan')
    log('kredensial', 'rahasia portal hanya tersimpan sebagai ciphertext dpapi:, terbaca kembali, dan tidak dikirim ke antarmuka')
  } else {
    const refused = await expectRejection(
      'government.credentials.save',
      { agency: 'AHU', label: 'Akun Portal Uji', secret: GOV_SECRET },
      'CONFLICT',
      'penyimpanan kredensial saat safeStorage tidak tersedia',
    )
    if (!/teks terbuka/.test(refused)) fail(refused)
    if ((await gatewayCipherRows()).length !== 0) fail('Kredensial tetap tertulis padahal enkripsi OS tidak tersedia')
    log('kredensial', 'penyimpanan ditolak karena penyimpanan terenkripsi OS tidak aktif (tidak ada plaintext)')
  }

  const syncLogs = await api(pageRef, 'government.syncLogs.list', { page: 1, pageSize: 100, agency: 'AHU' })
  if (syncLogs.total < 12) fail(`Log gateway AHU ${syncLogs.total}, seharusnya minimal 12`)
  if (syncLogs.items.some((l) => l.status === 'SUCCESS' && /API resmi/.test(l.message) && !/tidak ada API resmi/.test(l.message))) {
    fail('Log gateway mengklaim pengiriman API resmi')
  }
  const pendingLogs = syncLogs.items.filter((l) => l.status === 'PENDING').length
  log('sinkronisasi', `${syncLogs.total} catatan log gateway, ${pendingLogs} menunggu tindakan manual`)

  const docDir = path.join(dataDir, 'documents', 'government', sub.id)
  const stored = fs.existsSync(docDir) ? fs.readdirSync(docDir) : []
  if (stored.length !== 3) fail(`Berkas fisik gateway di ${docDir}: ${stored.length}, seharusnya 3`)
  log('berkas', `3 berkas tersimpan di luar direktori instalasi (${path.relative(root, docDir)}) dengan SHA-256`)

  for (const f of [pendukung, bukti, hasil, summaryPath]) fs.rmSync(f, { force: true })

  return { subId: sub.id, subNumber: sub.number, bpnId: bpnSub.id, totals: after.totals }
}

async function govUiWalk(gov) {
  await pageRef.getByRole('link', { name: 'Integrasi Pemerintah', exact: true }).click()
  await pageRef.getByRole('heading', { name: 'Integrasi Pemerintah', exact: true }).first().waitFor({ state: 'visible', timeout: 20_000 })
  const tabs = [
    ['Dashboard Integrasi', 'Kondisi keseluruhan pengajuan'],
    ['Pengajuan AHU', 'Siapkan data, lampirkan berkas'],
    ['Monitoring AHU', 'Pantau pengajuan AHU'],
    ['Pengajuan BPN', 'Siapkan data layanan pertanahan'],
    ['Monitoring BPN', 'Pantau pengajuan ATR/BPN'],
    ['Dokumen Pemerintah', 'Seluruh berkas pengajuan pemerintah'],
    ['Riwayat Sinkronisasi', 'Log append-only'],
    ['Konfigurasi Integrasi', 'Mode integrasi, kredensial terenkripsi'],
  ]
  for (const [label, subtitle] of tabs) {
    await pageRef.getByRole('button', { name: label, exact: true }).click()
    await waitForText(pageRef, subtitle)
  }
  await pageRef.getByRole('button', { name: 'Dashboard Integrasi', exact: true }).click()
  await waitForText(pageRef, gov.subNumber)
  await pageRef.getByRole('button', { name: 'Konfigurasi Integrasi', exact: true }).click()
  await waitForText(pageRef, 'Terkunci sampai dokumentasi API resmi tersedia')
  await pageRef.getByRole('button', { name: 'Riwayat Sinkronisasi', exact: true }).click()
  await waitForText(pageRef, gov.subNumber)

  await pageRef.evaluate((id) => { window.location.hash = `#/integrasi/${id}` }, gov.subId)
  await waitForText(pageRef, gov.subNumber)
  await waitForText(pageRef, 'SK Hukum diterbitkan')
  await waitForText(pageRef, 'Terkunci')
  const statusSteps = await pageRef.locator('text=Selesai').count()
  if (statusSteps === 0) fail('Status akhir pengajuan tidak tampil pada halaman detail')

  await pageRef.getByRole('link', { name: 'Dashboard', exact: true }).click()
  await pageRef.keyboard.press('Control+K')
  await pageRef.getByPlaceholder('Ketik minimal 2 karakter…').fill(gov.subNumber)
  await waitForText(pageRef, `${gov.subNumber} — Pendirian PT Uji Gateway`)
  await pageRef.keyboard.press('Escape')
  log('ui', '8 tab gateway terbuka, detail pengajuan final tampil, dan pencarian global menemukan nomor pengajuan')
}

function jakartaDay(offsetDays = 0) {
  const format = (date) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
  const base = format(new Date())
  const shifted = new Date(`${base}T12:00:00+07:00`)
  shifted.setUTCDate(shifted.getUTCDate() + offsetDays)
  return format(shifted)
}

async function runSetup(page) {
  await waitForText(page, 'Selamat datang di NOTARIS PRO')
  await page.getByPlaceholder('Contoh: Kantor Notaris & PPAT Budi Santoso, S.H.').fill('Kantor Notaris & PPAT Uji E2E')
  await page.getByPlaceholder('Nama lengkap beserta gelar').fill('Notaris Uji E2E, S.H., M.Kn.')
  await page.getByRole('button', { name: /Lanjut/ }).click()

  const card = page.locator('.card')
  await card.locator('input').nth(0).fill('Administrator Uji E2E')
  await card.locator('input').nth(1).fill(admin.username)
  await card.locator('input').nth(2).fill('admin.e2e@contoh.test')
  await card.locator('input[type="password"]').nth(0).fill(admin.password)
  await card.locator('input[type="password"]').nth(1).fill(admin.password)
  await page.getByRole('button', { name: /Lanjut/ }).click()

  await card.locator('input[type="password"]').nth(0).fill(admin.master)
  await card.locator('input[type="password"]').nth(1).fill(admin.master)
  await card.locator('input[type="checkbox"]').check()
  await page.getByRole('button', { name: /Selesaikan penyiapan/ }).click()

  await waitForText(page, 'Simpan Recovery Code Anda', 60_000)
  const recoveryCode = (await page.locator('code').first().textContent())?.trim() ?? ''
  if (!/^[A-Z2-9]{4}(-[A-Z2-9]{4}){5}$/.test(recoveryCode)) fail(`Format recovery code tidak valid: ${recoveryCode}`)
  log('setup', `vault dibuat, recovery code ${recoveryCode.length} karakter`)

  await page.locator('.card input[type="checkbox"]').check()
  await page.getByRole('button', { name: /Masuk ke NOTARIS PRO/ }).click()
  await waitForText(page, 'Selamat datang, Administrator')
  log('setup', 'masuk ke aplikasi setelah penyiapan')
  return recoveryCode
}

async function uiWalk(page) {
  const pages = [
    ['Klien', 'Klien'],
    ['Transaksi', 'Transaksi'],
    ['Akta Notaris', 'Akta Notaris'],
    ['Akta PPAT', 'Akta & Layanan PPAT'],
    ['Dokumen', 'Dokumen'],
    ['Kalender', 'Kalender & Agenda'],
    ['Repertorium', 'Repertorium Akta'],
    ['Protokol Notaris', 'Protokol Notaris'],
    ['Keuangan', 'Keuangan'],
    ['Laporan', 'Laporan'],
    ['Karyawan & Role', 'Karyawan & Role'],
    ['Audit Log', 'Audit Log'],
    ['Backup & Restore', 'Backup & Restore'],
    ['Performa', 'Performa Sistem'],
    ['Integrasi Pemerintah', 'Integrasi Pemerintah'],
    ['Pengaturan', 'Pengaturan'],
  ]
  for (const [nav, heading] of pages) {
    await page.getByRole('link', { name: nav, exact: true }).click()
    await page.getByRole('heading', { name: heading, exact: true }).first().waitFor({ state: 'visible', timeout: 20_000 })
    await checkPageQuality(page, nav)
  }
  log('ui', `${pages.length} modul terbuka tanpa error render, tanpa overflow, aksesibilitas dasar lolos`)
}

async function checkPageQuality(page, label) {
  const issues = await page.evaluate(() => {
    const found = []
    const visible = (el) => {
      const rect = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
    }
    const describe = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${String(el.className || '').split(' ')[0]}`
    const nameOf = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim()

    for (const el of document.querySelectorAll('button, a[href], [role="button"], [role="link"], [role="tab"]')) {
      if (!visible(el)) continue
      if (!nameOf(el)) found.push(`kontrol tanpa nama aksesibel: ${describe(el)}`)
    }

    for (const el of document.querySelectorAll('input:not([type="hidden"]), select, textarea')) {
      if (!visible(el)) continue
      if (el.tagName === 'INPUT' && ['button', 'submit', 'reset'].includes(el.type)) {
        if (!(el.value || el.getAttribute('aria-label') || el.getAttribute('title'))) {
          found.push(`tombol input tanpa nama: ${describe(el)}`)
        }
        continue
      }
      const labelledBy = el.getAttribute('aria-labelledby')
      const hasLabel = (el.labels && el.labels.length > 0) ||
        el.getAttribute('aria-label') ||
        (labelledBy && labelledBy.split(/\s+/).every((id) => document.getElementById(id)))
      if (!hasLabel) found.push(`isian tanpa label: ${describe(el)} (${el.type || el.tagName.toLowerCase()})`)
    }

    for (const img of document.querySelectorAll('img')) {
      if (!img.hasAttribute('alt')) found.push(`gambar tanpa alt: ${describe(img)}`)
    }

    const root = document.documentElement
    if (root.scrollWidth > root.clientWidth + 1) {
      found.push(`overflow horizontal ${root.scrollWidth}px > ${root.clientWidth}px`)
    }
    return found.slice(0, 15)
  })
  if (issues.length > 0) fail(`Aksesibilitas/tata letak [${label}]: ${issues.join(' | ')}`)
}

async function layoutWalk(app, page) {
  const routes = [
    ['#/', /Selamat Datang/],
    ['#/klien', /^Klien$/],
    ['#/keuangan', /^Keuangan$/],
    ['#/laporan', /^Laporan$/],
    ['#/integrasi', /^Integrasi Pemerintah$/],
  ]
  const sizes = [
    [1180, 720],
    [1366, 768],
    [1920, 1080],
    [2560, 1440],
  ]

  const assertNoOverflow = async (context) => {
    const width = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }))
    if (width.scroll > width.client + 1) {
      fail(`Overflow horizontal ${context}: ${width.scroll}px > ${width.client}px`)
    }
  }

  for (const [width, height] of sizes) {
    await app.evaluate(({ BrowserWindow }, bounds) => {
      BrowserWindow.getAllWindows()[0].setBounds({ x: 30, y: 30, ...bounds })
    }, { width, height })
    await page.waitForTimeout(250)
    for (const [hash, heading] of routes) {
      await page.evaluate((h) => { window.location.hash = h }, hash)
      await page.getByRole('heading', { name: heading }).first().waitFor({ state: 'visible', timeout: 20_000 })
      await assertNoOverflow(`${hash} pada ${width}x${height}`)
    }
  }

  for (const zoom of [1.25, 1.5]) {
    await app.evaluate(({ BrowserWindow }, factor) => {
      BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(factor)
    }, zoom)
    await page.waitForTimeout(300)
    for (const [hash, heading] of routes) {
      await page.evaluate((h) => { window.location.hash = h }, hash)
      await page.getByRole('heading', { name: heading }).first().waitFor({ state: 'visible', timeout: 20_000 })
      await assertNoOverflow(`${hash} pada zoom ${zoom * 100}%`)
    }
  }

  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.webContents.setZoomFactor(1)
    win.setBounds({ x: 30, y: 30, width: 1440, height: 900 })
  })
  await page.waitForTimeout(250)
  log('layout', `tanpa overflow horizontal pada ${sizes.length} ukuran jendela dan zoom 125/150%`)
}

async function main() {
  if (packagedApp) log('mode', `aplikasi terpaket ${packagedApp}`)
  else build()
  resetDataDir()

  const env = {
    ...process.env,
    NOTARIS_DATA_DIR: dataDir,
    ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
  }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.NOTARIS_VAULT

  const app = await electron.launch({
    executablePath: packagedApp ?? electronPath,
    args: packagedApp ? [] : ['.'],
    cwd: root,
    env,
  })

  const errors = []
  try {
    const page = await app.firstWindow()
    pageRef = page
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`) })
    await page.waitForLoadState('domcontentloaded')

    await runSetup(page)

    const client = await api(page, 'clients.create', {
      type: 'PERORANGAN',
      fullName: 'Klien Uji E2E',
      nik: '3201010101010001',
      phone: '081200000001',
      email: 'klien.e2e@contoh.test',
      address: 'Jl. Pengujian No. 1, Jakarta',
      status: 'AKTIF',
      identities: [],
    })
    if (!/^KLN-/.test(client.code)) fail(`Nomor klien tidak sesuai pola: ${client.code}`)
    const clientList = await api(page, 'clients.list', { page: 1, pageSize: 20, search: 'Klien Uji E2E' })
    if (clientList.total !== 1) fail(`Pencarian klien mengembalikan ${clientList.total} baris, seharusnya 1`)
    const emptyList = await api(page, 'clients.list', { page: 1, pageSize: 20, search: 'tidak-ada-xyz' })
    if (emptyList.total !== 0) fail('Pencarian klien tak dikenal mengembalikan data')
    log('klien', `${client.code} dibuat dan dapat dicari`)

    const parallel = await page.evaluate(async ({ clientId }) => {
      const jobs = Array.from({ length: 6 }, (_, i) => window.notaris.call('transactions.create', {
        clientId, type: 'NOTARIS', title: `Transaksi paralel ${i + 1}`, priority: 'NORMAL',
      }))
      return Promise.all(jobs)
    }, { clientId: client.id })
    const failedParallel = parallel.find((r) => !r.ok)
    if (failedParallel) fail(`Pembuatan transaksi paralel gagal: ${failedParallel.error}`)
    const parallelCodes = parallel.map((r) => r.data.code)
    if (new Set(parallelCodes).size !== parallelCodes.length) {
      fail(`Nomor transaksi duplikat pada pembuatan paralel: ${parallelCodes.join(', ')}`)
    }
    log('penomoran', `${parallelCodes.length} transaksi paralel memperoleh nomor unik`)

    const trx = await api(page, 'transactions.create', {
      clientId: client.id,
      type: 'NOTARIS',
      title: 'Pendirian PT Uji E2E',
      description: 'Transaksi pengujian end-to-end',
      priority: 'NORMAL',
      parties: [{ role: 'PENGHADAP', name: 'Klien Uji E2E', nik: '3201010101010001' }],
    })
    if (trx.status !== 'REGISTRASI_TRANSAKSI') fail(`Status awal transaksi salah: ${trx.status}`)
    const flow = ['UPLOAD_DOKUMEN', 'VERIFIKASI', 'DRAFT', 'REVIEW', 'APPROVAL']
    for (const status of flow) {
      await api(page, 'transactions.changeStatus', { id: trx.id, status, note: `E2E ke ${status}` })
    }
    const detail = await api(page, 'transactions.get', { id: trx.id })
    if (detail.workflow.length !== flow.length + 1) fail(`Riwayat workflow ${detail.workflow.length} baris, seharusnya ${flow.length + 1}`)
    log('transaksi', `${trx.code} melewati ${flow.length} tahap workflow`)

    const types = await api(page, 'deeds.types')
    const deedType = types.find((t) => t.code === 'AKTA_PENDIRIAN') ?? types.find((t) => t.category === 'NOTARIS') ?? types[0]
    const deed = await api(page, 'deeds.create', {
      deedTypeId: deedType.id,
      deedDate: '2026-11-02',
      clientId: client.id,
      transactionId: trx.id,
      title: 'Akta Pendirian PT Uji E2E',
      penghadap: 'Klien Uji E2E',
      komparisi: 'Para penghadap dikenal oleh Notaris.',
      isi: 'Pendirian perseroan terbatas untuk pengujian end-to-end.',
      notaryId: detail.createdById,
      parties: [{ role: 'PENGHADAP', name: 'Klien Uji E2E' }],
    })
    if (!deed.deedNumber) fail('Nomor akta tidak terbentuk')
    const draft = await api(page, 'deeds.generateDocument', { id: deed.id, variant: 'draft' })
    if (!draft.fileName.endsWith('.docx') || !fs.existsSync(draft.filePath)) fail(`Dokumen draft tidak dihasilkan: ${draft.filePath}`)
    log('akta', `${deed.deedNumber} dibuat, draft DOCX ${draft.fileName}`)

    for (const status of ['REVIEW', 'APPROVED', 'SIGNED']) {
      await api(page, 'deeds.changeStatus', { id: deed.id, status, note: `E2E ke ${status}` })
    }
    const registered = await api(page, 'deeds.changeStatus', { id: deed.id, status: 'REGISTERED', note: 'E2E tercatat' })
    if (!registered.repertoriumCreated) fail('Repertorium tidak tercatat otomatis saat status REGISTERED')
    const minuta = await api(page, 'deeds.generateDocument', { id: deed.id, variant: 'minuta' })
    if (!minuta.documentId) fail('Minuta tidak tersimpan sebagai dokumen')
    const revisions = await api(page, 'deeds.revisions', { id: deed.id })
    const repertorium = await api(page, 'deeds.repertorium.list', { page: 1, pageSize: 20 })
    if (!repertorium.items.some((r) => r.deedId === deed.id)) fail('Entri repertorium tidak ditemukan')
    log('akta', `tercatat otomatis, minuta tersimpan, ${revisions.length} revisi tercatat`)

    const today = jakartaDay(0)
    const tomorrow = jakartaDay(1)
    const appointment = await api(page, 'appointments.create', {
      title: 'Konsultasi Pendirian PT Uji E2E',
      clientId: client.id,
      transactionId: trx.id,
      type: 'KONSULTASI',
      startAt: `${today}T09:00:00+07:00`,
      endAt: `${today}T10:00:00+07:00`,
      location: 'Ruang Konsultasi',
      status: 'TERJADWAL',
    })
    await api(page, 'appointments.create', {
      title: 'Penandatanganan Akta Uji E2E',
      clientId: client.id,
      deedId: deed.id,
      type: 'PENANDATANGANAN',
      startAt: `${tomorrow}T13:00:00+07:00`,
      endAt: `${tomorrow}T14:00:00+07:00`,
      status: 'TERJADWAL',
    })
    const agenda = await api(page, 'calendar.appointments', { from: today, to: tomorrow })
    if (agenda.length !== 2) fail(`Agenda ${agenda.length} baris, seharusnya 2`)
    const dashboardToday = await api(page, 'dashboard.get', { months: 6 })
    if (dashboardToday.todayAppointments.length !== 1 || dashboardToday.todayAppointments[0].id !== appointment.id) {
      fail('Jadwal hari ini tidak muncul di dashboard')
    }
    const task = await api(page, 'tasks.create', {
      title: 'Siapkan berkas pendirian PT Uji E2E',
      transactionId: trx.id,
      dueDate: today,
      priority: 'TINGGI',
      status: 'TODO',
    })
    await api(page, 'tasks.update', { id: task.id, status: 'DONE' })
    const doneTasks = await api(page, 'tasks.list', { page: 1, pageSize: 20, status: 'DONE' })
    if (!doneTasks.items.some((t) => t.id === task.id)) fail('Tugas selesai tidak tercatat')
    await api(page, 'tasks.delete', { id: task.id })
    const tasksAfterDelete = await api(page, 'tasks.list', { page: 1, pageSize: 20 })
    if (tasksAfterDelete.items.some((t) => t.id === task.id)) fail('Tugas yang dihapus masih muncul')
    log('agenda', '2 jadwal tersimpan (1 hari ini tampil di dashboard), tugas dibuat, diselesaikan, dan dihapus')

    const categories = await api(page, 'documents.categories')
    const category = categories.find((c) => c.code === 'LEGALITAS') ?? categories[0]
    const uploadPath = path.join(root, 'tmp', 'e2e-upload.png')
    fs.writeFileSync(
      uploadPath,
      Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
    )
    const uploaded = await api(page, 'documents.upload', {
      tempPath: uploadPath,
      originalName: 'dokumen-uji.png',
      title: 'Dokumen Uji E2E',
      categoryId: category.id,
      clientId: client.id,
      notes: 'Dokumen pengujian menu dokumen',
      isConfidential: false,
    })
    const documentList = await api(page, 'documents.list', { page: 1, pageSize: 20, search: 'Dokumen Uji E2E' })
    if (documentList.total !== 1) fail(`Pencarian dokumen mengembalikan ${documentList.total} baris, seharusnya 1`)
    const preview = await api(page, 'documents.preview', { id: uploaded.id })
    if (preview.tooLarge || !String(preview.dataUrl).startsWith('data:image/png')) fail('Pratinjau dokumen PNG tidak valid')
    const versions = await api(page, 'documents.versions', { id: uploaded.id })
    if (versions.length !== 1) fail(`Versi dokumen ${versions.length}, seharusnya 1`)
    await api(page, 'documents.update', {
      id: uploaded.id,
      title: 'Dokumen Uji E2E Diperbarui',
      categoryId: category.id,
      notes: 'Judul diperbarui oleh E2E',
      isConfidential: true,
      clientId: client.id,
    })
    await api(page, 'documents.delete', { id: uploaded.id })
    const afterDelete = await api(page, 'documents.list', { page: 1, pageSize: 20, search: 'Dokumen Uji E2E Diperbarui' })
    if (afterDelete.total !== 0) fail('Dokumen terhapus masih muncul di daftar')
    await api(page, 'documents.restore', { id: uploaded.id })
    const afterRestore = await api(page, 'documents.list', { page: 1, pageSize: 20, search: 'Dokumen Uji E2E Diperbarui' })
    if (afterRestore.total !== 1) fail('Dokumen hasil restore tidak kembali ke daftar')
    fs.rmSync(uploadPath, { force: true })
    log('dokumen', 'unggah PNG, pratinjau, ubah metadata, hapus lunak, dan restore berhasil')

    const invoice = await api(page, 'invoices.create', {
      clientId: client.id,
      transactionId: trx.id,
      deedId: deed.id,
      issueDate: '2026-11-02',
      dueDate: '2026-11-16',
      discount: 0,
      taxPercent: 11,
      status: 'UNPAID',
      notes: 'Invoice pengujian e2e',
      items: [{ kind: 'JASA', description: 'Biaya pembuatan akta', quantity: 1, unitPrice: 1_000_000 }],
    })
    if (invoice.total !== 1_110_000) fail(`Total invoice ${invoice.total}, seharusnya 1110000`)
    const payment = await api(page, 'payments.create', {
      invoiceId: invoice.id,
      amount: 610_000,
      method: 'TRANSFER',
      paidAt: '2026-11-02',
      reference: 'E2E-TRF-001',
    })
    const paidInvoice = await api(page, 'invoices.get', { id: invoice.id })
    if (paidInvoice.status !== 'PARTIAL') fail(`Status invoice setelah pembayaran parsial: ${paidInvoice.status}`)
    if (paidInvoice.paidAmount !== 610_000) fail(`Jumlah terbayar ${paidInvoice.paidAmount}, seharusnya 610000`)

    const attempts = await page.evaluate(async ({ invoiceId }) => {
      const jobs = Array.from({ length: 10 }, () => window.notaris.call('payments.create', {
        invoiceId, amount: 100_000, method: 'TUNAI', paidAt: '2026-11-02',
      }))
      return Promise.all(jobs)
    }, { invoiceId: invoice.id })
    const accepted = attempts.filter((r) => r.ok)
    const rejected = attempts.filter((r) => !r.ok)
    if (accepted.length !== 5 || rejected.length !== 5) {
      fail(`Pembayaran paralel: ${accepted.length} diterima, ${rejected.length} ditolak; seharusnya 5 dan 5`)
    }
    if (rejected.some((r) => r.code !== 'CONFLICT')) {
      fail(`Penolakan pembayaran berlebih memakai kode tak terduga: ${rejected.map((r) => r.code).join(', ')}`)
    }
    const paymentNumbers = accepted.map((r) => r.data.number)
    if (new Set(paymentNumbers).size !== paymentNumbers.length) {
      fail(`Nomor kuitansi duplikat: ${paymentNumbers.join(', ')}`)
    }
    const settled = await api(page, 'invoices.get', { id: invoice.id })
    if (settled.paidAmount !== invoice.total) fail(`Total terbayar ${settled.paidAmount}, seharusnya ${invoice.total}`)
    if (settled.status !== 'PAID') fail(`Status invoice setelah pelunasan: ${settled.status}, seharusnya PAID`)
    log('pembayaran', `${accepted.length} pembayaran paralel diterima, ${rejected.length} ditolak, invoice lunas tanpa kelebihan`)

    const expense = await api(page, 'expenses.create', {
      category: 'OPERASIONAL',
      description: 'Biaya pengujian e2e',
      amount: 50_000,
      expenseDate: '2026-11-02',
      method: 'TUNAI',
    })
    const summary = await api(page, 'finance.summary')
    if (!summary || typeof summary.incomeMonth !== 'number') fail('Ringkasan keuangan tidak valid')
    log('keuangan', `${invoice.number} total Rp${invoice.total}, pembayaran ${payment.method}, pengeluaran tercatat`)

    const invoicePdf = await api(page, 'invoices.exportPdf', { id: invoice.id })
    if (!invoicePdf.fileName.endsWith('.pdf')) fail('Ekspor PDF invoice gagal')
    assertExportedFile(invoicePdf, 'PDF invoice', '%PDF-')
    const definitions = await api(page, 'reports.definitions')
    if (definitions.length !== 11) fail(`Jumlah definisi laporan ${definitions.length}, seharusnya 11`)
    const report = await api(page, 'reports.generate', { id: 'finance' })
    if (!Array.isArray(report.rows)) fail('Laporan keuangan tidak mengembalikan baris')
    const reportPdf = await api(page, 'reports.exportPdf', { id: 'clients' })
    const reportXls = await api(page, 'reports.exportExcel', { id: 'clients' })
    if (!reportPdf.fileName.endsWith('.pdf') || !reportXls.fileName.endsWith('.xlsx')) fail('Ekspor laporan gagal')
    assertExportedFile(reportPdf, 'PDF laporan', '%PDF-')
    assertExportedFile(reportXls, 'Excel laporan', 'PK')
    log('laporan', `${definitions.length} laporan, PDF + Excel sah (magic bytes + ukuran)`)

    const gov = await runGovernment(client, trx)

    const roles = await api(page, 'roles.list')
    const receptionist = roles.find((r) => r.code === 'RECEPTIONIST')
    if (!receptionist) fail('Role RECEPTIONIST tidak ditemukan')
    const receptionistCodes = receptionist.permissions
      .map((p) => p.permission.code)
      .filter((code) => code !== 'reports.view')
    await api(page, 'roles.permissions', { roleId: receptionist.id, permissionCodes: receptionistCodes })
    log('rbac', `izin reports.view dicabut dari RECEPTIONIST (${receptionistCodes.length} izin tersisa)`)

    const backup = await api(page, 'backup.create', { includeDocuments: true, note: 'Backup e2e' })
    const validated = await api(page, 'backup.validate', { fileName: backup.fileName })
    if (!validated.ok) fail(`Validasi backup gagal: ${validated.detail}`)
    const backupList = await api(page, 'backup.list')
    if (!backupList.files.some((f) => f.fileName === backup.fileName)) fail('Backup tidak muncul di daftar')
    log('backup', `${backup.fileName} dibuat dan lolos validasi`)

    const chain = await api(page, 'audit.verify')
    if (!chain.ok) fail(`Rantai audit terputus: ${chain.detail}`)
    if (chain.total < 10) fail(`Audit log hanya ${chain.total} entri`)
    log('audit', `${chain.checked} entri terverifikasi`)

    const clientsPage = await api(page, 'clients.list', { page: 1, pageSize: 20 })
    if (clientsPage.total !== 1) fail(`Jumlah klien ${clientsPage.total}, seharusnya 1 (tidak ada data dummy)`)

    await page.getByRole('link', { name: 'Klien', exact: true }).click()
    await page.getByText('Klien Uji E2E').first().waitFor({ state: 'visible', timeout: 20_000 })

    await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
    await page.getByText('Konsultasi Pendirian PT Uji E2E').first().waitFor({ state: 'visible', timeout: 20_000 })
    await page.getByLabel('Rentang grafik pendapatan').selectOption('12')
    await waitForText(page, 'Total penerimaan 12 bulan terakhir')
    await page.getByLabel('Rentang grafik pendapatan').selectOption('6')
    await waitForText(page, 'Total penerimaan 6 bulan terakhir')
    const monthName = (offset) => new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' })
      .format(new Date(new Date().getFullYear(), new Date().getMonth() + offset, 1))
    await page.getByRole('button', { name: 'Bulan berikutnya' }).click()
    await waitForText(page, monthName(1))
    await page.getByRole('button', { name: 'Bulan sebelumnya' }).click()
    await waitForText(page, monthName(0))
    await page.keyboard.press('Control+K')
    await page.getByPlaceholder('Ketik minimal 2 karakter…').fill('Klien Uji E2E')
    await page.getByText(`${client.code} · Perorangan`).waitFor({ state: 'visible', timeout: 20_000 })
    await page.keyboard.press('Escape')
    log('dashboard', 'jadwal hari ini tampil, rentang grafik 6/12 bulan berubah, kalender berpindah bulan, pencarian global menemukan klien')

    await page.evaluate((id) => { window.location.hash = `#/keuangan/invoice/${id}` }, invoice.id)
    await page.getByText(invoice.number).first().waitFor({ state: 'visible', timeout: 20_000 })
    await page.getByRole('link', { name: 'Laporan', exact: true }).click()
    await page.getByRole('heading', { name: 'Laporan', exact: true }).first().waitFor({ state: 'visible' })
    log('ui', 'data hasil API tampil di tabel klien dan detail invoice')

    await uiWalk(page)
    await govUiWalk(gov)

    const perf = await api(page, 'system.performance')
    if (!perf.database || perf.database.pageSize <= 0 || perf.database.fileBytes <= 0) {
      fail('Metrik basis data pada halaman performa tidak terbaca')
    }
    if (!Array.isArray(perf.api.byRoute) || !perf.api.summary) fail('Ringkasan latensi API tidak lengkap')
    const perfLog = path.join(dataDir, 'logs', 'performance.log')
    let perfLines = 0
    if (fs.existsSync(perfLog)) {
      for (const line of fs.readFileSync(perfLog, 'utf8').split('\n').filter(Boolean)) {
        perfLines++
        const entry = JSON.parse(line)
        const keys = Object.keys(entry).sort().join(',')
        if (keys !== 'at,ms,ok,route' && keys !== 'at,code,ms,ok,route') {
          fail(`Log performa memuat kunci tak diizinkan: ${keys}`)
        }
        if (/3201010101010001|RahasiaE2E|MasterE2E|Klien Uji E2E/.test(line)) {
          fail('Log performa memuat data sensitif')
        }
      }
    }
    const objects = await api(page, 'system.performance.objects')
    if (!objects || !Array.isArray(objects.items)) fail('system.performance.objects tidak mengembalikan daftar objek')
    log('performa', `metrik DB terbaca (${perf.database.pageCount} halaman), ${perf.api.byRoute.length} rute diringkas, ${perfLines} baris log lambat tanpa data pribadi`)

    await api(page, 'auth.logout')
    await page.reload()
    await waitForText(page, 'Masuk ke Sistem', 30_000)
    const loginCard = page.locator('.card')
    await loginCard.locator('input').nth(0).fill(admin.username)
    await loginCard.locator('input[type="password"]').fill(admin.password)
    await page.getByRole('button', { name: /^Masuk$/ }).click()
    await waitForText(page, 'Selamat datang, Administrator', 30_000)
    log('login', 'logout dan login ulang berhasil (verifikasi Argon2id)')

    await api(page, 'clients.create', {
      type: 'PERORANGAN',
      fullName: 'Klien Setelah Backup',
      status: 'AKTIF',
      identities: [],
    })
    const restore = await api(page, 'backup.restore', { fileName: backup.fileName })
    if (!restore.requiresLogin) fail('Restore seharusnya mengakhiri sesi dan meminta login ulang')
    await page.reload()
    await waitForText(page, 'Masuk ke Sistem', 30_000)
    const relogin = page.locator('.card')
    await relogin.locator('input').nth(0).fill(admin.username)
    await relogin.locator('input[type="password"]').fill(admin.password)
    await page.getByRole('button', { name: /^Masuk$/ }).click()
    await waitForText(page, 'Selamat datang, Administrator', 30_000)
    const extra = await api(page, 'clients.list', { page: 1, pageSize: 20, search: 'Klien Setelah Backup' })
    if (extra.total !== 0) fail('Data setelah backup masih ada; restore tidak mengembalikan kondisi')
    const restoredClients = await api(page, 'clients.list', { page: 1, pageSize: 20 })
    if (restoredClients.total !== 1) fail(`Jumlah klien setelah restore ${restoredClients.total}, seharusnya 1`)
    const govAfterRestore = await api(page, 'government.submissions.list', { page: 1, pageSize: 50, view: 'SEMUA' })
    if (govAfterRestore.total !== gov.totals.submissions) {
      fail(`Pengajuan gateway setelah restore ${govAfterRestore.total}, seharusnya ${gov.totals.submissions}`)
    }
    const restoredSubmission = await api(page, 'government.submissions.get', { id: gov.subId })
    if (restoredSubmission.internalStatus !== 'SELESAI' || restoredSubmission.externalRef !== 'AHU-2026-000777') {
      fail(`Pengajuan gateway ${gov.subNumber} tidak utuh setelah restore`)
    }
    const govFilesAfterRestore = await api(page, 'government.files.list', { page: 1, pageSize: 20, submissionId: gov.subId })
    if (govFilesAfterRestore.total !== 3) fail(`Berkas gateway setelah restore ${govFilesAfterRestore.total}, seharusnya 3`)
    const chainAfterRestore = await api(page, 'audit.verify')
    if (!chainAfterRestore.ok) fail(`Rantai audit rusak setelah restore: ${chainAfterRestore.detail}`)
    const backupsAfter = await api(page, 'backup.list')
    if (backupsAfter.files.length < 2) fail('Backup pengaman sebelum restore tidak ditemukan')
    log('restore', `${backup.fileName} dipulihkan, data kembali ke kondisi backup, audit tetap utuh`)

    const rolesAfterRestore = await api(page, 'roles.list')
    const receptionistAfter = rolesAfterRestore.find((r) => r.code === 'RECEPTIONIST')
    if (!receptionistAfter) fail('Role RECEPTIONIST hilang setelah restore')
    if (receptionistAfter.permissions.some((p) => p.permission.code === 'reports.view')) {
      fail('Perubahan RBAC hilang setelah seed/restore (izin reports.view kembali aktif)')
    }
    log('rbac', 'perubahan izin bertahan setelah migrasi ulang/restore')

    const badSetting = await callRaw(page, 'settings.update', { values: { 'system.backupRetention': '0' } })
    if (badSetting.ok || badSetting.code !== 'CONFLICT') {
      fail(`Pengaturan tidak valid seharusnya ditolak: ${badSetting.ok ? 'diterima' : badSetting.code}`)
    }
    log('pengaturan', 'nilai retensi backup 0 ditolak dengan kode CONFLICT')

    const deadline = await api(page, 'deadlines.create', {
      title: 'Tenggat terlambat E2E',
      type: 'PERPANJANGAN',
      dueDate: '2020-01-02',
      status: 'AKTIF',
    })
    const overdueList = await api(page, 'deadlines.list', {
      page: 1, pageSize: 20, status: 'TERLAMBAT', search: 'Tenggat terlambat E2E',
    })
    const overdue = overdueList.items.find((d) => d.id === deadline.id)
    if (!overdue) fail('Tenggat yang melewati hari ini tidak otomatis berstatus TERLAMBAT')
    const notifications = await api(page, 'notifications.list')
    if (!notifications.some((n) => n.title === 'Tenggat terlambat' && String(n.message).includes('Tenggat terlambat E2E'))) {
      fail('Notifikasi otomatis untuk tenggat terlambat tidak dibuat')
    }
    log('otomatisasi', 'tenggat lampau ditandai TERLAMBAT dan notifikasi dibuat')

    const chainFinal = await api(page, 'audit.verify')
    if (!chainFinal.ok) fail(`Rantai audit rusak setelah otomatisasi: ${chainFinal.detail}`)
    log('audit', `${chainFinal.checked} entri tetap terverifikasi setelah otomatisasi`)

    const realErrors = errors.filter((e) => !/ResizeObserver|Download the React DevTools/i.test(e))
    if (realErrors.length > 0) fail(`Error renderer:\n${realErrors.slice(0, 10).join('\n')}`)

    await layoutWalk(app, page)

    log('selesai', `data tersimpan di ${dataDir}`)
  } finally {
    await app.close().catch(() => undefined)
  }
}

main().catch((err) => {
  console.error(`[e2e] GAGAL: ${err.message}`)
  process.exitCode = 1
})
