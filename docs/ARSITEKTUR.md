# Arsitektur Teknis — NOTARIS PRO

Dokumen ini menjelaskan bagaimana aplikasi dibangun, di mana data disimpan, bagaimana keamanan diterapkan, dan mengapa sejumlah keputusan teknis diambil. Aplikasi berjalan offline-first, tanpa Docker dan tanpa server pusat. Tidak ada satu pun panggilan API keluar dari proses utama — termasuk ke instansi pemerintah; modul integrasi hanya mencatat pekerjaan yang Anda lakukan pada portal resmi.

---

## 1. Prinsip desain

1. **Data milik pengguna, di perangkat pengguna.** Database dan dokumen berada di folder data aplikasi milik sistem operasi, bukan di folder instalasi.
2. **Enkripsi saat istirahat.** Selama aplikasi terkunci atau tertutup, database hanya ada sebagai berkas terenkripsi AES-256-GCM.
3. **Jejak yang tidak dapat dihapus diam-diam.** Audit log, repertorium, protokol, revisi akta, dan riwayat workflow dijaga trigger database append-only.
4. **Satu jalur API.** Renderer tidak memiliki akses Node; seluruh operasi melewati satu kanal IPC dengan validasi runtime dan pemeriksaan izin.
5. **Tidak mengklaim yang tidak dikerjakan.** Tidak ada layanan awan, draft tidak pernah dianggap akta autentik, dan modul **Integrasi Pemerintah** berhenti pada Level 2 (semi-otomatis): tanpa API resmi yang diaktifkan, tanpa scraping, dan tanpa klaim status dari instansi.

---

## 2. Tumpukan teknologi

| Lapisan | Teknologi |
|---|---|
| Runtime desktop | Electron 45.2.1 |
| Build/dev | electron-vite 6.0.0, Vite 7.3.7, TypeScript 5.9.3 |
| UI | React 19.3.1, React Router 7 (HashRouter), Tailwind CSS 3.4.19, Lucide |
| Grafik | Recharts 3 |
| Database | SQLite melalui Prisma ORM 6.19.3 (`engineType=library`) |
| Migrasi | SQL kustom dijalankan dengan `node:sqlite` (`DatabaseSync`) |
| Password/KDF | Argon2id melalui `hash-wasm` |
| Enkripsi | Node `crypto` — AES-256-GCM, HKDF, SHA-256 |
| DOCX | Docxtemplater + PizZip |
| PDF | Chromium `webContents.printToPDF` (tanpa layanan cetak eksternal) |
| Excel | SheetJS (`xlsx`) |
| ZIP/backup | AdmZip (hanya format backup lama); format baru memakai wadah stream sendiri di `lib/backup-stream.ts` |
| Pengujian | Vitest (unit), Playwright `_electron` (E2E) |
| Pengemasan | electron-builder — NSIS (Windows), AppImage/deb (Linux), DMG (macOS) |

---

## 3. Model proses

```
┌──────────────────────────────────────────────────────────────┐
│ Main process (Node)                                          │
│  • lifecycle: vault, koneksi DB, migrasi, seed referensi     │
│  • ipc/router: satu handler "app:call"                       │
│  • domain: clients, transactions, deeds, ppat, documents,    │
│    finance, calendar, reports, users, audit, settings, backup│
│  • lib: crypto, vault, migrate, numbering, workflow, rbac,   │
│    audit, docx, pdf, exporters, backup, logger               │
└───────────────▲──────────────────────────────────────────────┘
                │ ipcRenderer.invoke("app:call", {route, payload})
                │ contextBridge: window.notaris.call(...)
┌───────────────┴──────────────────────────────────────────────┐
│ Renderer (Chromium) — sandbox: true, contextIsolation: true, │
│ nodeIntegration: false                                        │
│  • React + React Router (HashRouter)                         │
│  • Hanya memanggil route API; tidak menyentuh fs/DB langsung │
└──────────────────────────────────────────────────────────────┘
```

Preload ([src/preload/index.ts](file:///D:/NOTARIS/src/preload/index.ts)) hanya mengekspos `call`, `platform`, dan `versions`. Tidak ada `require`, `fs`, atau `ipcRenderer` mentah yang bocor ke halaman.

Window utama dibuat dengan `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, dan `webSecurity: true`. Navigasi keluar diblokir; tautan `https://` dibuka di browser sistem melalui `shell.openExternal`. Aplikasi memakai single-instance lock agar dua proses tidak menulis database yang sama.

---

## 4. Siklus hidup aplikasi

### 4.1 Mulai

1. `ensureDirs()` membuat struktur folder data dan membatasi izin (best-effort `0700`).
2. `initVault()` membaca `config/vault.json`:
   - tidak ada vault → status `SETUP`;
   - ada vault → `LOCKED`; bila database plaintext ditemukan bersama berkas terenkripsi, `crashRecovered = true`;
   - `NOTARIS_VAULT=off` → `DISABLED` (hanya pengembangan/uji).
3. `registerIpc()` mendaftarkan seluruh route domain.
4. Saat vault dibuka, `prepareDatabase()` dijalankan: cek migrasi, backup pra-migrasi, terapkan migrasi, buka koneksi Prisma, seed data referensi (role, permission, kategori dokumen, jenis akta, penomoran).

### 4.2 Buka (unlock)

`unlockVault()` menurunkan kunci pembungkus (KEK) dari master password atau recovery code dengan Argon2id, membuka `wrapped key` AES-256-GCM, lalu:

- bila `database/notaris_pro.db` belum ada tetapi `.db.enc` ada, dekripsi ke berkas sementara, jalankan `PRAGMA integrity_check`, lalu rename menjadi database aktif;
- bila keduanya ada, mode pemulihan pasca-crash dipakai dan salinan divalidasi.

Database plaintext hanya ada selama sesi terbuka.

### 4.3 Kunci (lock) dan keluar

`lockVault()`:

1. `$disconnect()` Prisma;
2. `PRAGMA wal_checkpoint(TRUNCATE)`;
3. baca database, enkripsi dengan AES-256-GCM, tulis atomik ke `notaris_pro.db.enc` (tulis `.tmp`, `fsync`, rename, `chmod 0600`);
4. hapus `notaris_pro.db`, `-wal`, `-shm`, `-journal`;
5. kosongkan kunci di memori dan set status `LOCKED`.

`before-quit` menunda keluar sampai `lockVault()` selesai agar tidak ada database plaintext yang tertinggal.

---

## 5. Tata letak penyimpanan

Akar data: `app.getPath('appData')/Notaris Pro` (dapat ditimpa `NOTARIS_DATA_DIR` untuk pengujian).

```
Notaris Pro/
├─ database/
│  ├─ notaris_pro.db        (hanya saat terbuka)
│  ├─ notaris_pro.db.enc    (vault terkunci)
│  └─ .migrating
├─ documents/
│  ├─ clients/<clientId>/
│  ├─ transactions/<transactionId>/
│  ├─ deeds/<deedNumber>/
│  ├─ identities/  certificates/  invoices/  expenses/  other/
├─ templates/{notary,ppat,invoices}/
├─ backups/*.npbackup
├─ exports/{pdf,excel}/
├─ logs/{app.log,performance.log,performance.log.1}
├─ cache/thumbnails/       (pratinjau gambar, dibatasi 64 MB / 30 hari)
├─ config/{vault.json,local.json}
└─ tmp/
```

Path dokumen diselesaikan melalui `resolveStoragePath()` yang menolak path keluar dari folder `documents/` (proteksi path traversal). Nama segmen disanitasi dengan `safeSegment()`.

---

## 6. Keamanan kriptografis

### 6.1 Vault

- **Master key**: 32 byte acak, dibuat saat penyiapan.
- **Pembungkusan**: master key dienkripsi dua kali — dengan kunci turunan master password dan kunci turunan recovery code.
- **KDF**: Argon2id, `memorySize=32768` (32 MiB), `iterations=3`, `parallelism=1`, `hashLength=32`, salt 16 byte acak.
- **Cipher**: AES-256-GCM dengan IV 12 byte acak; tag autentikasi disimpan.
- **Penyimpanan**: `config/vault.json` berisi metadata KDF + wrapped key (bukan kunci mentah), ditulis atomik dengan izin `0600`.
- **Ganti master password**: memverifikasi password lama dengan `timingSafeEqual`, lalu membungkus ulang master key. Recovery code dapat dibuat ulang; kode lama langsung tidak berlaku.

### 6.2 Password pengguna

Disimpan sebagai `$argon2id$v=19$m=32768,t=3,p=1$<salt>$<hash>` dan diverifikasi dengan perbandingan waktu-konstan. Tidak ada password plaintext di database, log, atau berkas konfigurasi.

### 6.3 Backup

- Kunci backup dari vault diturunkan dengan **HKDF-SHA256** (`info = "notaris-pro-backup-v1"`).
- Alternatif passphrase memakai Argon2id dengan salt acak per backup; parameter KDF disimpan di header.
- Wadah NPBACKUP2 mengenkripsi **per entri** dengan AES-256-GCM (IV 12 byte dan tag 16 byte milik sendiri); header menyimpan format, versi aplikasi, sumber kunci, parameter KDF, `cipher`, dan `codec`. Footer berisi daftar isi (nama, ukuran asli, ukuran tersimpan, SHA-256 isi asli) dan sekaligus menjadi penanda selesai.
- Entri diautentikasi oleh GCM; perubahan satu bit pada ciphertext menyebabkan dekripsi gagal. SHA-256 pada footer dihitung atas isi asli sehingga pemeriksaan checksum hasil pemulihan tidak memerlukan kunci.
- Backup format lama (NPBACKUP1, ZIP tunggal dalam satu payload AES-GCM dengan IV/tag/SHA-256 di header) hanya dibaca untuk validasi dan restorasi.

### 6.4 Kontrol proses

| Kontrol | Penerapan |
|---|---|
| Isolasi konteks | `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` |
| Validasi input | Skema Zod per route sebelum handler |
| Otorisasi | `perm` pada route + pemeriksaan izin di UI |
| Sesi | Token sesi di memori main process, timeout idle dari pengaturan, disentuh tiap panggilan |
| Path traversal | `resolveStoragePath`, `safeSegment`; nama entri backup divalidasi `safeName()` (NPBACKUP2) dan `safeZipName()` (format lama) — menolak path absolut, `..`, dan huruf drive |
| SQL injection | Prisma parameterized + escape identifier pada query diagnostik |
| Log | Pesan error pengguna tidak membocorkan stack; stack hanya ke log |
| Izin berkas | `0600` untuk vault/backup, `0700` folder data (best-effort) |

---

## 7. Basis data

### 7.1 Prisma + SQLite

Skema Prisma memiliki **41 model**:

`Role`, `Permission`, `RolePermission`, `User`, `Client`, `ClientIdentity`, `ClientCompany`, `Transaction`, `TransactionParty`, `DeedType`, `Deed`, `DeedParty`, `DeedRevision`, `DeedRepertorium`, `ProtocolRegister`, `Property`, `Certificate`, `DocumentCategory`, `Document`, `DocumentVersion`, `Invoice`, `InvoiceItem`, `Payment`, `Expense`, `Appointment`, `WorkTask`, `Notification`, `AuditLog`, `BackupLog`, `NumberingSequence`, `Setting`, `LegalDeadline`, `WorkflowHistory`, plus the eight gateway models `GovernmentService`, `GovernmentSubmission`, `GovernmentSubmissionFile`, `GovernmentStatusHistory`, `GovernmentReference`, `GovernmentSyncLog`, `GovernmentApiConfig`, `GovernmentApiCredential`.

Koneksi dibuat oleh `PrismaClient` dengan `datasources.db.url = file:<path>` (path absolut dinormalisasi ke garis miring), `log: ['error']`. Saat koneksi dibuka, PRAGMA berikut diterapkan:

- `journal_mode=WAL`
- `synchronous=FULL`
- `busy_timeout=5000`
- `foreign_keys=ON`

Transaksi multi-langkah memakai `$transaction` dengan `maxWait 10s` dan `timeout 30s`.

### 7.2 Migrasi

Migrasi adalah berkas SQL bernomor di folder `migrations/`:

- `001_init.sql` — seluruh tabel, foreign key, unique index, dan index pencarian.
- `002_immutability.sql` — trigger append-only dan penguncian akta.
- `003_government_integration.sql` — delapan tabel gateway (`government_services`, `government_submissions`, `government_submission_files`, `government_status_history`, `government_references`, `government_sync_logs`, `government_api_config`, `government_api_credentials`), indeks unik, serta 13 trigger: identitas dan pengajuan final terkunci, riwayat/referensi/log append-only, berkas hanya hapus lunak, dan `cipherText` wajib berawalan `dpapi:`.
- `004_performance.sql` — enam indeks komposit untuk daftar, dashboard, dan audit (§9.8).
- `005_search_fts.sql` — tabel FTS5 external-content beserta trigger sinkronisasi untuk pencarian global (§9.9).
- `006_workflow_index.sql` — indeks komposit `WorkflowHistory(deedId, createdAt)` untuk riwayat akta (§9.8).

Status migrasi dicatat di tabel `_app_migrations (id, applied_at)`. `applyMigrations()`:

1. membuat tabel status bila belum ada;
2. mengaktifkan `PRAGMA foreign_keys=ON`;
3. untuk setiap berkas: `BEGIN IMMEDIATE` → eksekusi SQL → catat id → `COMMIT`; bila gagal → `ROLLBACK` dan hentikan.

Migrasi dijalankan dengan `node:sqlite`, bukan Prisma Migrate, sehingga tidak membutuhkan binary tambahan saat runtime. Sebelum migrasi pada database yang sudah berisi data, aplikasi membuat backup bertipe **Pra-migrasi**; bila backup gagal, migrasi dibatalkan.

Folder migrasi dikemas sebagai `extraResources` sehingga di aplikasi terpasang dibaca dari `process.resourcesPath/migrations`.

### 7.3 Integritas dan imutabilitas

`002_immutability.sql` memasang trigger yang menolak `UPDATE` dan `DELETE` pada:

- `AuditLog`
- `DeedRepertorium`
- `ProtocolRegister`
- `DeedRevision`
- `WorkflowHistory`

Selain itu:

- `Deed` tidak dapat dihapus (`trg_deeds_no_delete`).
- Kolom isi akta dikunci setelah status `SIGNED`, `REGISTERED`, atau `ARCHIVED` (`trg_deeds_locked_content`).
- Repertorium wajib merujuk akta yang valid (`trg_repertorium_requires_deed`).

Pemeriksaan tambahan dilakukan di lapisan handler agar pengguna mendapat pesan yang jelas sebelum trigger menolak.

### 7.4 Soft delete

Kolom `deletedAt` dipakai hanya pada entitas operasional yang diizinkan (mis. klien, transaksi, dokumen). Akta, repertorium, protokol, audit, dan riwayat tidak menggunakan penghapusan lunak sebagai jalan pintas: semuanya tidak dapat dihapus.

---

## 8. Lapisan IPC

### 8.1 Amplop

```ts
window.notaris.call<T>(route, payload) // → ipcRenderer.invoke('app:call', { route, payload })
```

Respons selalu:

```ts
{ ok: true, data: T }
{ ok: false, error: string, code?: 'NO_ROUTE' | 'SESSION_EXPIRED' | 'FORBIDDEN' | 'VALIDATION' | 'NOT_FOUND' | 'CONFLICT' | 'ERROR' }
```

### 8.2 Alur satu panggilan

```
route lookup → (auth) sesi & timeout → (perm) RBAC → schema.parse(payload)
→ handler(payload, ctx) → {ok,data}
```

- Route tanpa `auth` dianggap `session`; route publik harus eksplisit `auth: 'public'`.
- Timeout sesi dibaca dari pengaturan dengan cache 10 detik.
- `ZodError` diubah menjadi pesan `path: message` dengan kode `VALIDATION`.
- `PermissionError` → `FORBIDDEN`; `AppError` mempertahankan kodenya.
- Error tak terduga dicatat ke log dan dikembalikan sebagai pesan umum.

### 8.3 Katalog route

145 route tersebar di 15 modul IPC (`system`, `clients`, `transactions`, `documents`, `deeds`, `ppat`, `finance`, `calendar`, `dashboard`, `users`, `reports`, `audit`, `settings`, `backup`, `government`). Katalog lengkap ada di `docs/API-INTERNAL.md`.

---

## 9. Logika domain

### 9.1 Penomoran atomik

`nextNumber(tx, key, at)` membaca `NumberingSequence` di dalam transaksi yang sama dengan pembuatan entitas, sehingga dua permintaan bersamaan tidak mendapat nomor yang sama. Pola mendukung token:

`{PREFIX}`, `{YYYY}`, `{YY}`, `{MM}`, `{DD}`, `{SEQ:n}`, `{ROMAN}`.

Periode reset: `NONE`, `YEAR`, `MONTH`. Pola bawaan:

| Entitas | Pola | Reset |
|---|---|---|
| Klien | `KLN-{SEQ:5}` | Tidak |
| Transaksi | `TRX-{YYYY}{MM}-{SEQ:4}` | Bulan |
| Akta | `{SEQ:3}/{MM}/{YYYY}` | Bulan |
| Repertorium | `{SEQ:3}/{YYYY}` | Tahun |
| Protokol | `{SEQ:3}/{YYYY}` | Tahun |
| Invoice | `INV/{YYYY}/{SEQ:4}` | Tahun |
| Pembayaran | `KW/{YYYY}/{SEQ:4}` | Tahun |
| Pengeluaran | `EXP/{YYYY}{MM}/{SEQ:4}` | Bulan |
| Pengajuan pemerintah | `GOV/{YYYY}/{SEQ:4}` | Tahun |

Nomor yang sudah terpakai tidak pernah digunakan ulang, termasuk untuk invoice yang dibatalkan.

### 9.2 Workflow transaksi

Status dan transisi didefinisikan di `src/shared/constants.ts`. Handler menolak transisi di luar daftar dan menulis `WorkflowHistory` (pengguna, waktu, status lama, status baru, catatan). Riwayat tidak dapat diubah.

### 9.3 Audit hash chain

Setiap entri audit menyimpan `hash = SHA-256("v1" | prevHash | userId | username | action | entity | entityId | createdAt | before | after | meta)`, dengan `prevHash` entri sebelumnya (atau `GENESIS`). Verifikasi menelusuri rantai dari entri pertama dan melaporkan entri pertama yang tidak cocok. Karena tabel append-only, penghapusan atau penyuntingan entri akan memutus rantai dan terdeteksi.

### 9.4 Dokumen

Berkas disimpan di luar database dengan path relatif; database menyimpan metadata, checksum SHA-256, kategori, keterkaitan, dan versi. Unggahan ulang menambah `DocumentVersion` dengan nomor versi unik per dokumen. Nama berkas disanitasi dan path divalidasi terhadap folder `documents/`.

**Pratinjau.** `documents.preview` dan `government.files.preview` memakai `preparePreview()` di `src/main/lib/preview.ts`, dengan kebijakan murni di `src/shared/preview-policy.ts`. PDF hanya dikirim sebagai data URL bila ≤ 12 MB. Gambar selalu diperkecil lebih dulu menjadi thumbnail selebar maksimum 1.024 px memakai `nativeImage`; sumber di atas 40 MB ditolak tanpa dibuka agar memori proses utama tidak melonjak. DOCX/XLSX tidak dipratinjau inline karena renderer tidak memiliki penampilnya. Berkas yang hilang mengembalikan `kind:'missing'` beserta pesan pemulihan, bukan error mentah. Thumbnail di-cache di `<data>/cache/thumbnails` dengan batas total 64 MB dan umur 30 hari; pembersihan berjalan paling sering setiap lima menit saat cache ditulis. Berkas yang terlalu besar atau formatnya tidak didukung tetap dapat dibuka melalui **Buka Aplikasi** atau **Unduh**, sehingga tidak ada tombol yang hanya menampilkan pesan buntu.

### 9.5 Laporan

Definisi laporan menghasilkan struktur kolom/baris dari query Prisma. Ekspor:

- **PDF**: HTML di-escape, dirender oleh Chromium tersembunyi (`javascript: false`), lalu `printToPDF` A4 (orientasi sesuai definisi, footer nomor halaman).
- **Excel**: SheetJS membuat workbook satu sheet dari array-of-arrays.

Berkas ditulis ke `exports/pdf` atau `exports/excel` dengan nama aman dan stempel waktu.

**Batas baris.** `buildReport()` hanya mengambil `MAX_REPORT_ROWS + 1` (20.001) baris; bila baris ke-20.001 ada, `assertWithinLimit()` menaikkan `ConflictError` yang menyarankan memperkecil periode/filter. Karena itu laporan yang melebihi batas **ditolak seluruhnya**, bukan dipotong diam-diam, baik di `reports.generate` maupun di ekspor PDF/Excel.

Laporan jejak audit memakai plafon tersendiri (5.000 baris) yang memang dipotong, bukan ditolak. Saat pemotongan terjadi, hasil menyertakan `rowTotal` (jumlah baris sebenarnya) dan `truncationNotice()` (dari `src/shared/report-notice.ts`) menampilkan:

- badge **Dipotong** (`tone="amber"`) di kepala hasil dan `Alert tone="warn"` berisi pesan yang sama di halaman **Laporan**;
- baris peringatan yang sama di bagian atas PDF dan sheet Excel, sehingga berkas tidak terlihat seperti laporan lengkap.

Agregat (`totals`) dihitung di database, bukan dijumlahkan dari baris yang tampil.

### 9.6 DOCX

`resolveTemplate()` memprioritaskan template unggahan pengguna di `templates/<kategori>/`, lalu template bawaan dari `resources/templates`. Docxtemplater dijalankan dengan delimiter `{...}`, `paragraphLoop`, dan `linebreaks`. Placeholder dijelaskan di `docs/TEMPLATE-DOCX.md`.

---

### 9.7 Gateway integrasi pemerintah

Kode modul berada di `src/main/integrations/government-gateway/` dan hanya boleh dipanggil lewat route `government.*` di `src/main/ipc/government.ts`.

- **Tiga tingkat kapabilitas.** Level 1 (bantuan manual) dan Level 2 (semi-otomatis) diimplementasikan; Level 3 (API resmi) dinonaktifkan. `integrationCapabilities()` mengembalikan `officialApiAvailable:false` dan `automatedSubmission:false`, dan `government.config.update` menolak `apiEnabled:true` dengan `ConflictError`.
- **Portal.** `portal.ts` memuat `ALLOWED_PORTAL_HOSTS` = `layanan.ahu.go.id` dan `mitra.atrbpn.go.id`. `assertOfficialPortalUrl()` menolak skema bukan `https`, hostname yang tidak persis ada di daftar (termasuk variasi seperti `layanan.ahu.go.id.evil.test`), dan skrip `javascript:`. Pembukaan portal terjadi lewat tautan di renderer; proses utama tidak pernah membuat koneksi jaringan.
- **Status.** `rules.ts` menyimpan tabel transisi dan `missingRequirements()`. `applyTransition()` adalah satu-satunya jalur ubah status: menolak transisi ilegal (`CONFLICT`), menolak perpindahan tanpa bukti (`VALIDATION` dengan daftar syarat), lalu menulis `GovernmentStatusHistory`, `GovernmentSyncLog`, dan audit dalam satu transaksi.
- **Bukti, bukan klaim.** `SELESAI` menuntut `externalRef`, status resmi, dan satu berkas `HASIL_LAYANAN`; `DITOLAK` menuntut nomor resmi dan status resmi. Status resmi instansi disimpan pada kolom terpisah (`officialStatus`, `officialSource`) sehingga status internal tidak pernah menjadi klaim keputusan instansi.
- **Berkas.** Memakai helper `storeFile()` yang sama dengan modul dokumen, sehingga berkas jatuh ke `documents/government/<id>` dengan checksum SHA-256; pengeluaran bersifat lunak dan kolom `deletedAt`.
- **Kredensial.** `credentials.ts` memakai `safeStorage` (DPAPI di Windows). Semua ciphertext diberi awalan `dpapi:` dan dijaga CHECK plus trigger INSERT/UPDATE. Query `credentialSelect` tidak pernah memuat `cipherText`; `government.credentials.test` hanya mengembalikan panjang hasil dekripsi.
- **Luring.** `portalOpened` membawa flag `online` dari renderer; saat luring catatan tetap tersimpan dan log `PENDING` menandai bahwa tindakan manusia di portal belum terjadi.

### 9.8 Paginasi, indeks, dan statistik

Daftar tetap memakai `page`/`pageSize` (maksimum 200 per halaman). `paging()` di `src/main/lib/util.ts` menghitung offset lewat `src/shared/pagination.ts` dan menolak halaman yang offset-nya melewati 200.000 baris dengan `ConflictError` yang menyarankan mempersempit pencarian atau memakai filter. Pagar ini membatasi biaya pemindaian offset pada dataset yang jauh lebih besar daripada yang diuji, tanpa mengubah navigasi normal (200.000 baris berarti 4.000 halaman pada ukuran 50).

Migrasi `004_performance.sql` menambahkan enam indeks komposit yang mengikuti pola query nyata, bukan menambah indeks pada setiap kolom:

| Indeks | Melayani |
|---|---|
| `Client(deletedAt, createdAt)` | daftar klien, hitungan klien per bulan |
| `Deed(status, signedAt)` | hitungan akta selesai per bulan di dashboard |
| `Deed(createdAt)` | hitungan akta dibuat per bulan |
| `Transaction(deletedAt, status, createdAt)` | daftar transaksi terfilter + urutan terbaru |
| `AuditLog(action)` | daftar filter aksi dan facet `distinct action` |
| `Document(deletedAt, createdAt)` | daftar dokumen lintas klien |
| `WorkflowHistory(deedId, createdAt)` (migrasi `006_workflow_index.sql`) | riwayat akta berurutan waktu di `deeds.get` |

SQLite memindai indeks secara terbalik untuk `ORDER BY ... DESC`, sehingga kolom urutan tidak perlu dideklarasikan menurun. Diuji pada dataset sintetis penuh: halaman terdalam klien turun dari sekitar 1,6 detik (sort tabel penuh) menjadi sekitar 10 ms, dan facet aksi audit dari sekitar 308 ms menjadi di bawah 1 ms pada pengukuran SQLite langsung.

Migrasi 006 lahir dari benchmark "sesudah": `WorkflowHistory` diambil dengan `WHERE deedId = ? ORDER BY createdAt`, dan tanpa indeks komposit pemilih SQLite memindai indeks `createdAt` (500.000 baris) untuk menghindari pengurutan, sehingga `deeds.get` menjadi 1,9 detik. Indeks `(deedId, createdAt)` memenuhi filter dan urutan sekaligus serta menggantikan indeks satu kolom `deedId` yang menjadi prefiksnya.

`ANALYZE` dijalankan oleh `scheduleIdleMaintenance()` (`src/main/lifecycle.ts`) hanya ketika tidak ada panggilan API selama lima menit, paling sering sekali per 24 jam, dengan `PRAGMA analysis_limit=400` agar pembacaan per indeks terbatas. Vault yang terkunci melewati pemeliharaan ini, dan `VACUUM` tidak pernah dijalankan otomatis.

### 9.9 Pencarian global (FTS5)

`search.global` memakai tabel FTS5 external-content dari migrasi `005_search_fts.sql`: `client_search` (nama, kode), `transaction_search` (kode, judul), `deed_search` (nomor akta, judul), `invoice_search` (nomor), `document_search` (judul, nama berkas), dan `government_search` (nomor, judul, referensi eksternal). **Kolom sensitif — NIK, NPWP, isi akta, catatan pribadi — tidak dimasukkan ke indeks teks.** Pencarian NIK/NPWP memakai kecocokan persis lewat indeks B-tree `Client(nik)` dan `Client(npwp)`.

Masukan pengguna diubah menjadi kueri awalan oleh `src/shared/search-query.ts`: hanya huruf dan angka yang dipertahankan, setiap token menjadi `"token"*`, dan semua token digabung dengan `AND`. Dengan begitu `001/11/2026` mencari ketiga bagian nomor akta, dan tanda kutip atau operator FTS dari masukan tidak pernah diteruskan ke SQLite. Trigger `AFTER INSERT/UPDATE/DELETE` menjaga indeks tetap sinkron dengan tabel sumber; tabel FTS tidak menyimpan salinan teks lengkap berkat `content=`.

Hasil tiap grup tetap dibatasi lima baris, dan pencarian nama klien juga menampilkan transaksi/akta/invoice milik klien tersebut lewat `clientId` yang sudah diindeks. Diukur pada dataset penuh (1.000.000 dokumen): pembangunan indeks sekali saat migrasi sekitar 8 detik dan menambah sekitar 92 MB, sedangkan kueri FTS 2–26 ms — dibandingkan pencarian `LIKE '%…%'` berurutan yang sebelumnya memakan 3,4 detik pada dataset yang sama.

### 9.10 Pemuatan antarmuka dan virtual scrolling

Layar masuk (`Auth.tsx`) tetap dimuat langsung agar vault dapat dibuka tanpa menunggu unduhan tambahan. seluruh halaman kerja memakai `React.lazy(() => import(...))` di `src/renderer/src/App.tsx`, dan `Guard` membungkus setiap rute dengan `Suspense` yang menampilkan rangka halaman (`PageSkeleton`) alih-alih layar kosong. Navigasi pertama ke sebuah modul mengunduh satu chunk kecil; kunjungan berikutnya memakai cache modul.

`electron.vite.config.ts` memisahkan vendor stabil (`react`, `router`, `icons`, `date`, `charts`, `vendor`) lewat `manualChunks`, dan menyalakan `minify` untuk renderer (electron-vite mematikannya secara bawaan). Hasil build yang terukur:

| Kondisi | Berkas renderer |
|---|---|
| Sebelum | satu chunk `index-*.js` 2.382,62 kB (tanpa minifikasi) + CSS 75,55 kB |
| Sesudah | dimuat awal ≈ 383 kB (`index` 69,33 + `react` 222,29 + `icons` 27,88 + `date` 25,17 + `router` 38,74) + CSS 59,75 kB |
| Sesudah | `Dashboard` 19,62 kB + `charts` 332,90 kB hanya saat dashboard dibuka; 21 halaman lain 5–38 kB dimuat sesuai rute |
| Total | sekitar 1,19 MB untuk seluruh aplikasi (turun sekitar 50% dari 2,38 MB) |

`DataTable` di `src/renderer/src/components/ui.tsx` menerima prop `virtualize` untuk daftar yang tidak dipaginasi (mis. rincian item invoice, dokumen akta, berkas pengajuan). Bila baris melebihi 60, tabel hanya merender jendela baris yang terlihat plus enam baris overscan di dalam wadah bergulir setinggi 520 px; sisa ruang diisi baris pengganjal agar tinggi gulir tetap benar. Perhitungan jendela murni berada di `src/shared/virtual.ts` dan diuji tanpa DOM. Tinggi baris diukur dari baris pertama yang dirender sehingga baris dua baris (mis. nama berkas + checksum) tidak bertumpuk. Diuji pada aplikasi berjalan: invoice dengan 90 item merender 20 baris DOM (tinggi gulir 3.730 px), dan menggulir ke bawah menampilkan item ke-90 tanpa error renderer. Tabel berpaginasi (20–25 baris per halaman) tidak memakai jendela karena tidak memberi manfaat.

### 9.11 Halaman Performa Sistem dan log performa

`system.performance` (izin `settings.manage`) membuka koneksi baca-saja kedua ke basis data untuk membaca PRAGMA aktif, ukuran berkas/WAL/SHM, jumlah halaman dan halaman bebas, jumlah tabel/indeks/trigger, jumlah migrasi, keberadaan `sqlite_stat1`, serta daftar tabel FTS5. Halaman **Performa** menampilkan metrik tersebut, ringkasan latensi API sesi, delapan permintaan terlambat, ukuran berkas log, dan tombol **Hitung Ukuran** yang memanggil `system.performance.objects` (agregasi `dbstat`, hanya saat diminta karena memindai seluruh halaman).

Router mencatat setiap panggilan API ke ring memori 500 entri: nama rute, durasi, status, kode hasil, dan waktu. Permintaan ≥250 ms juga ditulis sebagai JSONL ke `logs/performance.log` (rotasi 2 MB → `performance.log.1`). **Tidak ada payload, NIK/NPWP, isi akta, nama pengguna, atau kata sandi yang dicatat**; nama rute yang tidak cocok dengan pola rute terdaftar ditulis `unknown`, dan kode galat harus berhuruf besar — selain itu dihilangkan. Aturan ini diuji di `tests/perf.test.ts`, dan E2E memeriksa setiap baris log hanya memuat kunci `at/route/ms/ok[code]` serta tidak memuat NIK atau kata sandi uji.

---

## 10. Format backup

### 10.1 NPBACKUP2 (format aktif, stream)

```
┌─────────────┬────────────────┬───────────────────────┬──────────────────┬─────────────────┐
│ "NPBACKUP2" │ uint32 BE (N)  │ header JSON (N byte)  │ entri 1..k       │ "NPB2FOOT"      │
│ 9 byte      │ panjang header │ format, versi, KDF,   │ (lihat bawah)    │ uint32 + footer │
│             │                │ cipher, codec         │                  │ JSON            │
└─────────────┴────────────────┴───────────────────────┴──────────────────┴─────────────────┘

entri = uint32 panjang nama | nama | IV 12 byte | uint64 ukuran asli | ciphertext (gzip+AES-GCM) | tag 16 byte
```

Satu entri = satu berkas (manifest, database, dokumen, template). Setiap entri punya IV dan tag AES-256-GCM sendiri, ditekan gzip, dan dipindahkan lewat stream: satu blok baca → satu blok kompresi → satu blok enkripsi → satu blok tulis. Tidak ada tahap yang memuat seluruh basis data atau arsip ke memori, sehingga basis data berukuran gigabyte dapat dicadangkan pada mesin 3,8 GB.

Footer JSON — daftar `name`, `plainSize`, `storedSize`, `sha256` (atas isi **asli**, jadi verifikasi checksum tidak butuh kunci) — ditulis paling akhir dan berperan sebagai **penanda selesai**. Backup yang penulisannya terputus (listrik padam, aplikasi dihentikan) tidak punya footer; `validateBackup` mengenalinya dengan pesan "Cadangan tidak lengkap: penanda akhir tidak ditemukan" dan gagal, bukan dianggap berhasil sebagian.

Isi arsip:

```
manifest.json
database/notaris_pro.db
documents/<kategori>/...   (opsional)
templates/<kategori>/...
```

Manifest memuat versi aplikasi, waktu, migrasi terakhir, SHA-256 database, jumlah baris tabel utama, daftar tabel, penanda dokumen, dan `format: 2`.

**Pembuatan** (`createBackup`):
1. Salinan konsisten melalui **SQLite Online Backup API** (`snapshotDatabase`; cadangan `VACUUM INTO`, lalu checkpoint+salin sebagai pilihan terakhir). Berkas utama tidak pernah dibaca mentah saat WAL aktif.
2. `PRAGMA integrity_check` atas salinan — sebelum satu byte pun ditulis ke folder backup.
3. Susun manifest dari salinan, kumpulkan entri (maksimal 200.000 berkas), periksa ruang kosong disk tujuan.
4. Tulis wadah ke berkas `.part` di direktori sementara, lalu **baca-ulang** dan dekripsi (manifest + database) → `integrity_check` + cocokkan SHA-256 database.
5. Baru setelah sah, salin ke nama final unik `notarispro-backup-<stempel>-<tipe>.npbackup` dan `chmod 600`. Bila tahap mana pun gagal, berkas final dihapus dan **backup lama tidak pernah disentuh**.
6. Retensi (`enforceRetention`) hanya menghapus berkas `-auto`, selalu menyisakan minimal satu, dan hanya dipanggil setelah backup baru terbukti sah.

**Lokasi**: `assessBackupLocation()` memeriksa volume folder backup terhadap volume data aplikasi dan ruang kosong tersisa. `backup.list` mengembalikannya sebagai `location` berisi `{ folder, sameVolumeAsData, freeBytes, note, warnings }`. Halaman **Backup & Restore** menampilkan setiap butir `warnings` di kotak **Lokasi backup perlu perhatian** (volume backup berbeda dari data, atau ruang kosong di bawah 2 GB), angka ruang kosong di baris `Folder: … — ruang kosong …`, serta `note` berisi pengingat menyalin backup ke media lain selama folder backup masih berada di volume yang sama dengan data.

**Restore**: validasi → ekstrak ke direktori sementara (nama entri melewati pemeriksaan path absolut/`..`/drive letter; entri yang baru ditulis dihapus bila ekstraksi gagal di tengah jalan) → `integrity_check` → salin ke `.restoring` → ganti database → hapus `-wal/-shm/-journal` → gabungkan dokumen/template. Pemanggil wajib membuat backup pra-restore terenkripsi; bila gagal, restore dibatalkan dan rollback mencoba mengembalikan kondisi. Setelah restore, seluruh sesi diakhiri.

### 10.2 NPBACKUP1 (format lama, hanya dibaca)

```
┌────────────┬──────────────────┬───────────────────────┬─────────────────────┐
│ "NPBACKUP1"│ uint32 BE (N)    │ header JSON (N byte)  │ ciphertext AES-GCM  │
│ 9 byte     │ panjang header   │ format, versi, KDF,   │ ZIP terenkripsi     │
│            │                  │ IV, tag, sha256       │                     │
└────────────┴──────────────────┴───────────────────────┴─────────────────────┘
```

Seluruh isi format lama masih dimuat ke memori, jadi berkas ini dibatasi 4 GB (`MAX_LEGACY_BACKUP_BYTES`) saat validasi dan impor. Backup lama tetap dapat divalidasi dan dipulihkan (`unpackLegacyBackup`), tetapi aplikasi tidak lagi memproduksinya.

---

## 11. Build dan pengemasan

- `electron-vite build` menghasilkan `out/main`, `out/preload`, `out/renderer`.
- `electron-builder` mengemas dengan `asar: false`. Alasannya: klien Prisma (`.prisma/client`) berisi engine native yang harus tetap berupa berkas nyata; percobaan memaksa pola `files` untuk memasukkannya ke asar memicu kehabisan memori V8 pada mesin 3,8 GB.
- `afterPack` menyalin `node_modules/.prisma` ke `resources/app/node_modules/.prisma` setelah paket disusun.
- `migrations/` dan `templates/` disalin sebagai `extraResources`, dibaca dari `process.resourcesPath` saat `app.isPackaged`.
- Target Windows: NSIS x64, `oneClick: false`, `perMachine: false`, izin elevasi opsional, lokasi instalasi dapat dipilih, pintasan desktop/start menu, dan **data tidak dihapus saat uninstall** (`deleteAppDataOnUninstall: false`).
- Target Linux (AppImage/deb) dan macOS (DMG) dikonfigurasi, tetapi belum diuji pada mesin ini.

Tidak ada Docker, kontainer, server basis data eksternal, atau layanan awan dalam arsitektur ini.

---

## 12. Batasan yang disengaja

| Batasan | Alasan |
|---|---|
| Tidak ada pengiriman API ke AHU/ATR/BPN | Belum ada dokumentasi dan otorisasi tertulis dari penyelenggara; `apiEnabled` dipaksa false dan penolakan diuji. Gateway berjalan pada Level 1–2: persiapan, portal resmi, pencatatan balik bukti |
| Draft bukan akta autentik | Penandatanganan dan pencatatan adalah tindakan hukum pengguna, bukan otomatisasi |
| Tidak ada cloud/sinkronisasi | Data harus tetap lokal; backup manual/otomatis menjadi jalur pemulihan |
| Database plaintext selama sesi | SQLite tidak dienkripsi per-halaman; perlindungan saat istirahat melalui vault, bukan enkripsi halaman |
| Laporan PDF memakai Chromium | Menghindari dependensi biner PDF tambahan; hasil konsisten di dalam Electron |
| Template invoice DOCX belum dipakai PDF | PDF invoice memakai tata letak bawaan; kategori template disediakan sebagai cadangan |
| Linux/macOS belum diuji | Hanya Windows yang diverifikasi end-to-end pada lingkungan ini |

---

## 13. Peta kode

```
src/
├─ main/
│  ├─ index.ts              bootstrap Electron, window, quit/lock
│  ├─ lifecycle.ts          migrasi, backup pra-migrasi, seed, backup harian
│  ├─ seed.ts               role, permission, kategori, jenis akta, penomoran
│  ├─ db.ts                 Prisma client + transaksi
│  ├─ ipc/                  router + 15 modul route (termasuk government.ts, 24 route)
│  ├─ integrations/government-gateway/
│  │    types, rules (transisi & syarat bukti), portal (allowlist URL resmi),
│  │    credentials (DPAPI), integration-manager + adapter ahu / atr-bpn
│  └─ lib/                  crypto, vault, migrate, backup, numbering, workflow,
│                           rbac, session, audit, docx, pdf, exporters, reports,
│                           documents, settings, paths, logger, errors, util
├─ preload/index.ts         contextBridge window.notaris
├─ renderer/src/
│  ├─ App.tsx               fase aplikasi + routing + guard izin
│  ├─ components/           Shell, UI kit, tabel, modal, dsb.
│  ├─ pages/government/     tab dashboard, pengajuan, dokumen, log, konfigurasi
│  └─ pages/                satu halaman per modul
└─ shared/                  constants, schemas, types, format
```
