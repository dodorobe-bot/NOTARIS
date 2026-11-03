# API Internal — NOTARIS PRO

Seluruh komunikasi renderer → main process melewati satu kanal IPC: `app:call`. Dokumen ini adalah katalog kontrak internal untuk pengembangan dan audit kode; bukan API jaringan — tidak ada port HTTP yang dibuka.

---

## 1. Amplop dan pemanggilan

```ts
// preload (contextBridge)
window.notaris.call<T>(route, payload): Promise<ApiResponse<T>>
```

Payload dan hasil selalu dibungkus:

```ts
type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string }
```

Contoh:

```ts
const res = await window.notaris.call('clients.list', { page: 1, pageSize: 25, search: 'budi' })
if (!res.ok) throw new Error(res.error)
console.log(res.data.items)
```

Catatan umum:

- Semua route kecuali yang bertanda **publik** memerlukan sesi aktif.
- Payload divalidasi Zod; tipe angka uang adalah **integer rupiah** (tanpa desimal), tanggal dikirim sebagai string ISO dan dikonversi ke `Date` di main process.
- ID entitas adalah UUID.
- Route bertanda **izin** memerlukan permission tersebut pada role sesi; selain itu hasilnya `FORBIDDEN`.
- Respons daftar memakai bentuk paginasi: `{ items, total, page, pageSize, totalPages }` (default `page=1`, `pageSize=25`, maksimum 200).
- Offset halaman dibatasi 200.000 baris. Permintaan di atasnya ditolak dengan `code: 'CONFLICT'` dan pesan yang menyarankan mempersempit pencarian atau memakai filter.

---

## 2. Kode kesalahan

| Kode | Arti |
|---|---|
| `NO_ROUTE` | Nama route tidak terdaftar |
| `SESSION_EXPIRED` | Tidak ada sesi atau sesi melewati batas idle |
| `FORBIDDEN` | Role tidak memiliki izin route |
| `VALIDATION` | Payload gagal skema Zod; pesan berisi `path: alasan` |
| `NOT_FOUND` | Entitas tidak ditemukan |
| `CONFLICT` | Melanggar aturan bisnis (transisi status, checksum, duplikasi, dsb.) |
| `VAULT_LOCKED` | Login dicoba saat database masih terenkripsi |
| `INVALID_CREDENTIALS` | Username/password salah |
| `LOCKED_OUT` | Terlalu banyak percobaan login; jeda sementara |
| `BUSY` | Operasi eksklusif (buka/kunci vault atau restore) sedang berjalan; rute sesi ditolak sementara agar tidak membaca database di tengah penggantian berkas |
| `INACTIVE` | Akun dinonaktifkan |
| `ERROR` | Kesalahan tak terduga; detail hanya di log |

Kegagalan login juga dicatat ke audit sebagai `LOGIN_FAILED`, tanpa menyimpan password.

---

## 3. Katalog route (147)

### 3.1 Sistem, setup, vault, autentikasi — 17 route

| Route | Akses | Payload | Hasil |
|---|---|---|---|
| `app.info` | publik | — | Nama, versi, platform, `dataRoot` |
| `system.performance` | `settings.manage` | — | Metrik basis data (ukuran, PRAGMA, halaman bebas, skema, migrasi, FTS5), ringkasan latensi API sesi, ukuran log performa |
| `system.performance.objects` | `settings.manage` | — | `{ ok, items: [{ name, bytes }] }` dari `dbstat`; `ok: false` + `reason` bila tabel virtual tidak tersedia |
| `setup.status` | publik | — | `{ needsSetup, vault }` |
| `setup.complete` | publik | `officeName`, `notaryName`, `adminFullName`, `username`, `email?`, `password`, `masterPassword`, `confirmMasterPassword` | `{ session, recoveryCode }` — recovery code hanya sekali |
| `vault.status` | publik | — | `{ status, vaultExists, dbExists, encryptedExists, crashRecovered, error, createdAt }` |
| `vault.unlock` | publik | `{ password, useRecovery? }` | `{ ok: true }`; setelahnya `prepareDatabase()` dijalankan. Lima percobaan salah per mode (master/recovery) memicu kunci 60 detik (`code: LOCKED_OUT`); percobaan berhasil mereset hitungan |
| `vault.lock` | sesi | — | `{ ok: true }`; database dienkripsi dan sesi dihapus |
| `vault.changeMasterPassword` | sesi + `settings.manage` | `{ currentMaster, newMaster }` | `{ ok: true }` |
| `vault.regenerateRecovery` | sesi + `settings.manage` | — | `{ recoveryCode }` (sekali tampil) |
| `auth.login` | publik | `{ username, password }` | `{ session, mustChangePassword }` |
| `auth.logout` | sesi | — | `{ ok: true }` |
| `auth.session` | publik | — | `{ session \| null, vault, expired? }` |
| `auth.touch` | publik | `{ activity?: boolean }` | `{ valid: boolean }`; sesi hanya diperpanjang bila `activity` bernilai true |
| `auth.changePassword` | sesi | `{ currentPassword, newPassword }` | `{ ok: true }` |
| `auth.roles` | sesi | — | Daftar role untuk form pengguna |
| `app.accounts` | sesi | — | Daftar akun ringkas (id, nama, username, role) |

`session` berisi: `userId`, `username`, `fullName`, `roleCode`, `roleName`, `permissions[]`.

### 3.2 Dashboard dan notifikasi — 3 route

| Route | Akses | Payload | Hasil |
|---|---|---|---|
| `dashboard.get` | sesi + `dashboard.view` | `{ months? }` (3–12, bawaan 6) | Statistik dan tren, grafik pendapatan, distribusi jenis akta, jadwal hari ini, transaksi terbaru, notifikasi |
| `notifications.list` | sesi | — | Daftar notifikasi pengguna |
| `notifications.markRead` | sesi | `{ id? }` | `{ ok: true }` |

### 3.3 Klien — 7 route

| Route | Akses | Payload | Hasil |
|---|---|---|---|
| `clients.list` | `clients.view` | `page`, `pageSize`, `search`, `type?`, `status?`, `sortBy?`, `sortDir?` | Halaman klien |
| `clients.options` | sesi | — | Daftar ringkas untuk dropdown |
| `clients.get` | `clients.view` | `{ id }` | Klien + identitas, perusahaan, transaksi, akta, invoice, dokumen |
| `clients.create` | `clients.manage` | Skema klien (lihat 4.1) | Klien baru dengan kode otomatis |
| `clients.update` | `clients.manage` | Skema klien + `id` | Klien terbarui |
| `clients.delete` | `clients.manage` | `{ id }` | Soft delete (`deletedAt`) |
| `clients.restore` | `clients.manage` | `{ id }` | Klien dipulihkan |

### 3.4 Transaksi — 7 route

| Route | Akses | Payload | Hasil |
|---|---|---|---|
| `transactions.list` | `transactions.view` | `page`, `pageSize`, `search`, `type?`, `status?`, `clientId?` | Halaman transaksi |
| `transactions.get` | `transactions.view` | `{ id }` | Transaksi + pihak, dokumen, akta, invoice, riwayat workflow |
| `transactions.create` | `transactions.manage` | Skema transaksi | Transaksi baru, status `REGISTRASI_TRANSAKSI`, kode `TRX-YYYYMM-0001` |
| `transactions.update` | `transactions.manage` | Skema transaksi + `id` | Transaksi terbarui |
| `transactions.changeStatus` | `transactions.manage` | `{ id, status, note? }` | Status baru + entri `WorkflowHistory` |
| `transactions.delete` | `transactions.manage` | `{ id }` | Soft delete (status `BATAL` untuk pembatalan alur) |
| `transactions.options` | sesi | — | Transaksi aktif (`SELESAI`/`BATAL` dikecualikan) |

### 3.5 Akta notaris, repertorium, protokol — 12 route

| Route | Akses | Payload | Hasil |
|---|---|---|---|
| `deeds.types` | sesi | — | Jenis akta aktif |
| `deeds.list` | `deeds.view` | `page`, `pageSize`, `search`, `status?`, `deedTypeId?`, `clientId?`, `year?` | Halaman akta |
| `deeds.get` | `deeds.view` | `{ id }` | Akta + pihak, revisi, repertorium, protokol, dokumen |
| `deeds.create` | `deeds.manage` | Skema akta | Akta `DRAFT`, nomor `001/11/2026` |
| `deeds.update` | `deeds.manage` | Skema akta + `id` | Akta terbarui; revisi baru bila isi berubah; ditolak bila terkunci |
| `deeds.changeStatus` | `deeds.manage` | `{ id, status, note? }` | Status baru; `APPROVED`+ memerlukan `deeds.approve`; `SIGNED` memerlukan notaris; `REGISTERED` memicu repertorium |
| `deeds.revisions` | `deeds.view` | `{ id }` | Daftar revisi beserta snapshot |
| `deeds.generateDocument` | `deeds.manage` | `{ id, kind: 'draft' \| 'minuta' }` | Dokumen DOCX tersimpan + metadata |
| `deeds.repertorium.list` | `repertorium.view` | `page`, `pageSize`, `search`, `year?` | Halaman repertorium |
| `deeds.repertorium.register` | `deeds.manage` | `{ deedId, notes? }` | Entri repertorium manual (sekali per akta) |
| `protocol.list` | `protocol.view` | `page`, `pageSize`, `search`, `year?` | Halaman protokol |
| `protocol.create` | `protocol.manage` | `{ deedId?, year, protocolType, registerNumber?, sequenceNo?, location?, notes? }` | Entri protokol append-only |

### 3.6 PPAT — 7 route

| Route | Akses | Payload | Hasil |
|---|---|---|---|
| `ppat.properties.list` | `ppat.view` | `page`, `pageSize`, `search`, `transactionId?` | Halaman objek tanah |
| `ppat.properties.get` | `ppat.view` | `{ id }` | Objek + sertifikat |
| `ppat.properties.create` | `ppat.manage` | Skema properti | Objek tanah baru |
| `ppat.properties.update` | `ppat.manage` | Skema properti + `id` | Objek terbarui |
| `ppat.properties.delete` | `ppat.manage` | `{ id }` | Menghapus objek (dengan audit) |
| `ppat.summary` | `ppat.view` | — | Ringkasan layanan PPAT |
| `ppat.dashboard` | `ppat.view` | — | Metrik PPAT |

### 3.7 Dokumen — 13 route

| Route | Akses | Payload | Hasil |
|---|---|---|---|
| `documents.categories` | sesi | — | Kategori dokumen |
| `documents.list` | `documents.view` | `page`, `pageSize`, `search`, `categoryId?`, `clientId?`, `transactionId?`, `deedId?` | Halaman dokumen |
| `documents.pick` | `documents.manage` | — | Dialog pilih berkas; mengembalikan path sementara |
| `documents.upload` | `documents.manage` | `title`, `categoryId`, `tempPath`, `originalName`, `clientId?`, `transactionId?`, `deedId?`, `notes?` | Dokumen + checksum, versi 1 |
| `documents.replace` | `documents.manage` | `documentId`, `tempPath`, `originalName`, `notes?` | Versi baru |
| `documents.update` | `documents.manage` | `{ id, title?, notes?, ... }` | Metadata terbarui |
| `documents.versions` | `documents.view` | `{ id }` | Riwayat versi |
| `documents.preview` | `documents.view` | `{ id }` | `{ kind, mimeType, sourceBytes, fileName, dataUrl?, thumbnail?, width?, height?, cacheHit?, reason?, tooLarge }`; PDF ≤ 12 MB, thumbnail gambar ≤ 1.024 px, sumber > 40 MB dan DOCX/XLSX tidak dikirim (`tooLarge`/`reason`) |
| `documents.openExternal` | `documents.view` | `{ id }` | Buka dengan aplikasi sistem |
| `documents.download` | `documents.view` | `{ id }` | Dialog simpan berkas |
| `documents.delete` | `documents.manage` | `{ id }` | Soft delete |
| `documents.restore` | `documents.manage` | `{ id }` | Pulihkan dokumen |
| `documents.purgeFile` | `settings.manage` | `{ id }` | Hapus berkas fisik permanen (khusus admin) |

### 3.8 Keuangan — 13 route

| Route | Akses | Payload | Hasil |
|---|---|---|---|
| `invoices.list` | `finance.view` | `page`, `pageSize`, `search`, `status?`, `clientId?` | Halaman invoice |
| `invoices.get` | `finance.view` | `{ id }` | Invoice + item + pembayaran |
| `invoices.create` | `finance.manage` | Skema invoice | Invoice baru; nomor `INV/YYYY/0001`; total dihitung server |
| `invoices.update` | `finance.manage` | Skema invoice + `id` | Invoice terbarui; ditolak bila `VOID` atau sudah memiliki pembayaran |
| `invoices.void` | `finance.manage` | `{ id, reason }` | Status `VOID` + alasan |
| `payments.create` | `finance.manage` | Skema pembayaran | Pembayaran baru; status invoice dihitung ulang |
| `payments.list` | `finance.view` | `page`, `pageSize`, `search`, `from?`, `to?` | Halaman pembayaran |
| `expenses.list` | `finance.view` | `page`, `pageSize`, `search`, `category?`, `from?`, `to?` | Halaman pengeluaran |
| `expenses.create` | `finance.manage` | Skema pengeluaran | Pengeluaran baru `EXP/YYYYMM/0001` |
| `expenses.update` | `finance.manage` | Skema pengeluaran + `id` | Pengeluaran terbarui |
| `expenses.delete` | `finance.manage` | `{ id }` | Hapus dengan audit |
| `finance.summary` | `finance.view` | `{ from?, to? }` | Pemasukan, pengeluaran, laba, jumlah invoice |
| `finance.outstanding` | `finance.view` | — | Daftar piutang + umur |

### 3.9 Kalender, tugas, tenggat — 12 route

| Route | Akses | Payload | Hasil |
|---|---|---|---|
| `calendar.appointments` | `calendar.view` | `{ from, to }` | Jadwal pada rentang tanggal |
| `appointments.create` | `calendar.manage` | Skema jadwal | Jadwal baru |
| `appointments.update` | `calendar.manage` | Skema jadwal + `id` | Jadwal terbarui |
| `appointments.delete` | `calendar.manage` | `{ id }` | Hapus dengan audit |
| `tasks.list` | `calendar.view` | `page`, `pageSize`, `status?`, `mine?`, `search?` | Tugas |
| `tasks.create` | `calendar.manage` | Skema tugas | Tugas baru |
| `tasks.update` | `calendar.manage` | Skema tugas + `id` | Tugas terbarui |
| `tasks.delete` | `calendar.manage` | `{ id }` | Hapus dengan audit |
| `deadlines.list` | `calendar.view` | `page`, `pageSize`, `status?`, `type?` | Tenggat hukum |
| `deadlines.create` | `calendar.manage` | Skema tenggat | Tenggat baru |
| `deadlines.update` | `calendar.manage` | Skema tenggat + `id` | Tenggat terbarui |
| `deadlines.delete` | `calendar.manage` | `{ id }` | Hapus dengan audit |

### 3.10 Pengguna dan role — 7 route

| Route | Akses | Payload | Hasil |
|---|---|---|---|
| `users.list` | `users.view` | `page`, `pageSize`, `search`, `roleId?` | Halaman pengguna |
| `users.create` | `users.manage` | `username`, `fullName`, `email?`, `roleId`, `password`, `isActive` | Pengguna baru; password di-hash Argon2id |
| `users.update` | `users.manage` | `id`, `fullName`, `email?`, `roleId`, `isActive`, `password?` | Pengguna terbarui |
| `users.deactivate` | `users.manage` | `{ id }` | Akun nonaktif (bukan hapus) |
| `roles.list` | `users.view` | — | Role + jumlah permission |
| `roles.permissions` | `users.manage` | `{ roleId, permissionCodes[] }` | Matriks izin tersimpan |
| `permissions.catalog` | sesi | — | Katalog izin per grup |

### 3.11 Laporan — 5 route

| Route | Akses | Payload | Hasil |
|---|---|---|---|
| `reports.definitions` | `reports.view` | — | 11 definisi laporan |
| `reports.generate` | `reports.view` | `{ id, from?, to?, year?, status? }` | `{ title, subtitle, columns, rows, ... }` |
| `reports.exportPdf` | `reports.view` | sama | `{ fileName, filePath, sizeBytes }` |
| `reports.exportExcel` | `reports.view` | sama | `{ fileName, filePath, sizeBytes }` |
| `invoices.exportPdf` | `finance.view` | `{ id }` | PDF invoice |

ID laporan: `clients`, `deeds`, `repertorium`, `protocol`, `ppat-transactions`, `certificates`, `finance`, `payments`, `receivables`, `staff-activity`, `audit-log`.

Batas baris: `reports.generate`/`exportPdf`/`exportExcel` mengambil maksimal 20.001 baris dan mengembalikan `CONFLICT` (`Laporan "..." memuat lebih dari 20.000 baris. Persempit periode ...`) bila masih lebih banyak, sehingga tidak ada laporan parsial yang tampak lengkap. Laporan `audit-log` dibatasi 5.000 baris dan dalam hal itu hasilnya memang dipotong: `rowTotal` membawa jumlah baris sebenarnya dan `truncationNotice()` ditampilkan di UI, PDF, serta Excel.

### 3.12 Audit — 2 route

| Route | Akses | Payload | Hasil |
|---|---|---|---|
| `audit.list` | `audit.view` | `page`, `pageSize`, `search`, `action?`, `entity?`, `username?`, `from?`, `to?` | Halaman audit + daftar aksi/entitas |
| `audit.verify` | `audit.view` | — | `{ ok, checked, total, brokenAt, detail }` |

### 3.13 Pengaturan, template, folder, pencarian — 10 route

| Route | Akses | Payload | Hasil |
|---|---|---|---|
| `settings.get` | sesi | — | `{ settings: rows, map }` |
| `settings.update` | `settings.manage` | `{ values: Record<string,string> }` | Pengaturan terbarui |
| `settings.sequences` | `settings.manage` | — | Daftar pola penomoran + pratinjau |
| `settings.updateSequence` | `settings.manage` | `{ key, prefix?, pattern?, resetPeriod? }` | Pola terbarui |
| `templates.list` | `templates.manage` | — | Template per kategori |
| `templates.pick` | `templates.manage` | — | Dialog pilih DOCX |
| `templates.save` | `templates.manage` | `{ category, fileName, tempPath }` | Template tersimpan |
| `templates.delete` | `templates.manage` | `{ category, fileName }` | Template dihapus |
| `app.openFolder` | sesi | `{ target }` | Membuka folder data di file manager |
| `search.global` | sesi | `{ query }` (min. 2 karakter) | Grup hasil klien/transaksi/akta/invoice/dokumen/pengajuan pemerintah; FTS5 untuk kolom non-sensitif, NIK/NPWP hanya cocok persis |

### 3.14 Backup — 8 route

| Route | Akses | Payload | Hasil |
|---|---|---|---|
| `backup.list` | `backup.manage` | — | `{ files, logs }` (200 riwayat terakhir), `folder`, `totals`, `location` (`{ folder, sameVolumeAsData, freeBytes, note, warnings }`) |
| `backup.create` | `backup.manage` | `{ passphrase?, includeDocuments?, note? }` | Berkas `.npbackup` tervalidasi + manifest |
| `backup.import` | `backup.manage` | — | Dialog impor; menyalin berkas ke folder backup. Berkas format lama di atas 512 MB ditolak (dimuat penuh ke memori); berkas NPBACKUP2 diterima tanpa batas itu |
| `backup.validate` | `backup.manage` | `{ fileName, passphrase? }` | `{ ok, detail, manifest?, tables? }` |
| `backup.delete` | `backup.manage` | `{ fileName }` | `{ ok: true }` |
| `backup.openFolder` | `backup.manage` | — | Membuka folder backup |
| `backup.restore` | `backup.manage` | `{ fileName, passphrase? }` | `{ restoredDatabase, restoredDocuments, manifest }`; sesi diakhiri |
| `backup.checksum` | `backup.manage` | `{ fileName }` | `{ checksum }` SHA-256 berkas, dihitung secara stream tanpa memuat berkas ke memori |

Catatan: `backup.create` memakai kunci vault bila passphrase tidak diberikan. Berkas baru selalu memakai wadah stream NPBACKUP2 (lihat `docs/ARSITEKTUR.md` §10): salinan database diambil lewat SQLite Online Backup API, ditulis `.part` lalu diverifikasi (dekripsi, `integrity_check`, SHA-256) sebelum nama final dibuat — backup lama tidak pernah dihapus sebelum backup baru sah. `backup.restore` selalu membuat backup pengaman terenkripsi lebih dulu; bila gagal, restore dibatalkan.

---

### 3.15 Integrasi Pemerintah — 24 route

Modul gateway hanya berinteraksi dengan database lokal dan filesystem aplikasi. Tidak ada satu route pun yang memanggil portal instansi: pembukaan portal memakai tautan `https` pada antarmuka dan rute `portalOpened` hanya mencatatnya.

| Route | Akses | Payload | Hasil |
|---|---|---|---|
| `government.services` | `government.view` | `{ agency?, includeInactive? }` | Layanan beserta `portalUrl` resmi, `checklist`, `fields` template, dan `submissionCount` |
| `government.dashboard` | `government.view` | — | `{ agencies, capabilities, totals, byStatus, recentSubmissions, recentSyncLogs, encryption, apiNote }`; `apiNote` menyatakan tidak ada API resmi yang diaktifkan |
| `government.submissions.list` | `government.view` | paginasi + `{ agency?, internalStatus?, view?, serviceId?, clientId?, transactionId? }` | Halaman pengajuan (`view` = `PERSIAPAN`/`BERJALAN`/`FINAL`/`SEMUA`) lengkap relasi dan jumlah berkas/referensi |
| `government.submissions.get` | `government.view` | `{ id }` | Detail + `data` hasil urai, `files`, `statusHistory`, `references`, `syncLogs` (30 terakhir), `state`, `transitions` berikut `missing` syarat, `checklist`, `fields`, `portalUrl`, `isFinal` |
| `government.submissions.create` | `government.manage` | `{ agency, serviceId, clientId?, transactionId?, title, description?, data? }` | Baris `DRAFT` bernomor `GOV/{YYYY}/{SEQ:4}`; layanan wajib aktif dan agensinya cocok (`VALIDATION` bila tidak) |
| `government.submissions.update` | `government.manage` | `{ id, title, description?, clientId?, transactionId?, data? }` | Hanya isi persiapan; `CONFLICT` bila pengajuan sudah final |
| `government.submissions.changeStatus` | `government.manage` | `{ id, toStatus, officialStatus?, source?, note? }` | Satu-satunya jalur ubah status. `CONFLICT` untuk transisi tak sah atau pengajuan final; `VALIDATION` dengan daftar syarat yang belum terpenuhi |
| `government.submissions.portalOpened` | `government.manage` | `{ id, online? }` | `{ ok, portalUrl, online }` + log `PENDING`; pesan berbeda saat perangkat luring |
| `government.submissions.recordOfficialStatus` | `government.manage` | `{ id, officialStatus, source?, note? }` | Status resmi disimpan terpisah dari status internal; riwayat `OFFICIAL` + log `STATUS` |
| `government.submissions.addReference` | `government.manage` | `{ submissionId, type, value, issuedAt?, source?, notes? }` | Referensi append-only; `externalRef` terisi bila belum ada dan tipe bukan `LAINNYA` |
| `government.submissions.exportSummary` | `government.manage` | `{ id, filePath? }` | PDF lembar persiapan; `{ canceled: true }` bila dialog dibatalkan |
| `government.files.pick` | `government.manage` | — | Dialog pilih berkas → `{ path, name, sizeBytes, mimeType }` atau `null` |
| `government.files.add` | `government.manage` | `{ submissionId, kind, tempPath, originalName, notes? }` | Berkas tersimpan di `documents/government/<id>` + checksum SHA-256; `CONFLICT` bila final |
| `government.files.remove` | `government.manage` | `{ id }` | Hapus lunak (`deletedAt`); berkas fisik dan jejak audit dipertahankan |
| `government.files.preview` | `government.view` | `{ id }` | Bentuk sama dengan `documents.preview` (batas PDF 12 MB, thumbnail gambar, `kind`/`reason`) |
| `government.files.openExternal` | `government.view` | `{ id }` | Membuka berkas pada aplikasi sistem |
| `government.files.download` | `government.view` | `{ id }` | `{ canceled: true }` atau `{ canceled: false, filePath }` |
| `government.files.list` | `government.view` | paginasi + `{ agency?, kind?, submissionId? }` | Berkas aktif + ringkasan pengajuannya |
| `government.syncLogs.list` | `government.view` | paginasi + `{ agency?, status?, submissionId? }` | Log append-only + pengajuan dan pembuatnya |
| `government.config.get` | `government.configure` | — | Kapabilitas jujur per instansi (`officialApiAvailable:false`, `automatedSubmission:false`), konfigurasi, daftar kredensial **tanpa** `cipherText`, status enkripsi, dan URL portal |
| `government.config.update` | `government.configure` | `{ agency, notes?, apiEnabled? }` | `apiEnabled:true` → `CONFLICT` ("API resmi belum tersedia"); tersimpan selalu `apiEnabled:false`, `mode:'SEMI_OTOMATIS'` |
| `government.credentials.save` | `government.configure` | `{ agency, label, accountHint?, secret }` | Menyimpan ciphertext berawalan `dpapi:`; mengembalikan metadata saja. `CONFLICT` bila safeStorage OS tidak tersedia (rahasia tidak ditulis sebagai plaintext) |
| `government.credentials.delete` | `government.configure` | `{ id }` | `{ ok: true }` + log `KREDENSIAL` |
| `government.credentials.test` | `government.configure` | `{ id }` | `{ ok, algorithm, decryptedLength }`; nilai rahasia tidak pernah dikirim ke renderer |

Syarat perpindahan status yang ditegakkan `missingRequirements`:

| Target | Syarat bukti |
|---|---|
| `SIAP_DIAJUKAN` | minimal 2 data isian dan 1 berkas (pendukung/bukti) |
| `MENUNGGU_PORTAL`, `DRAFT`, `DIBATALKAN` | tidak ada |
| `DIAJUKAN` | nomor resmi (`externalRef`) dan 1 `BUKTI_PENGAJUAN` |
| `DIPROSES` | nomor resmi |
| `SELESAI` | nomor resmi + status resmi + 1 `HASIL_LAYANAN` |
| `DITOLAK` | nomor resmi + status resmi |

Catatan integritas: `government_status_history`, `government_references`, dan `government_sync_logs` bersifat append-only (trigger menolak UPDATE/DELETE); `government_submissions` menolak UPDATE pada kolom identitas dan UPDATE apa pun setelah status `SELESAI`/`DITOLAK`/`DIBATALKAN`; `government_submission_files` hanya boleh dihapus lunak; `government_api_credentials.cipherText` wajib berawalan `dpapi:` (CHECK + trigger).

---

## 4. Skema payload penting

### 4.1 Klien

```ts
{
  type: 'PERORANGAN' | 'BADAN_HUKUM',
  fullName: string,              // 2–200
  nik?, npwp?, birthPlace?, birthDate?, gender?,
  occupation?, address?, kelurahan?, kecamatan?,
  city?, province?, postalCode?, phone?, email?,
  status?: 'AKTIF' | 'NONAKTIF' | 'BLACKLIST',
  notes?,
  identities?: { docType, number?, issuedAt?, expiresAt?, documentId?, notes? }[],
  company?: { companyName, legalType, establishmentDeedNumber?, ... }
}
```

### 4.2 Transaksi

```ts
{
  clientId: uuid,
  type: 'NOTARIS' | 'PPAT',
  serviceType?,
  title: string,                 // 2–250
  description?,
  priority?: 'RENDAH' | 'NORMAL' | 'TINGGI',
  assignedToId?: uuid | null,
  parties?: { role, name, nik?, address?, phone?, clientId?, notes? }[]
}
```

### 4.3 Perubahan status

```ts
// transaksi
{ id: uuid, status: WorkflowStatus, note?: string }
// akta
{ id: uuid, status: 'DRAFT'|'REVIEW'|'APPROVED'|'SIGNED'|'REGISTERED'|'ARCHIVED'|'CANCELLED', note?: string }
```

Transisi di luar daftar resmi ditolak `CONFLICT`. `CANCELLED` mewajibkan alasan. Status `APPROVED`, `SIGNED`, `REGISTERED`, `ARCHIVED` memerlukan izin `deeds.approve`.

### 4.4 Invoice

```ts
{
  clientId: uuid,
  transactionId?, deedId?,
  issueDate: ISO,
  dueDate?: ISO | null,          // default issueDate + finance.invoiceDueDays
  discount: integer,             // rupiah
  taxPercent: number,            // 0–100
  notes?,
  status: 'DRAFT' | 'UNPAID',
  items: { kind, description, quantity, unitPrice }[]  // minimal 1
}
```

Total (`subtotal`, `discount`, `tax`, `total`) selalu dihitung ulang di server; nilai dari renderer tidak dipercaya.

### 4.5 Pembayaran dan pengeluaran

```ts
// payments.create
{ invoiceId: uuid, amount: integer >= 1, method: string, paidAt: ISO, reference?, notes? }

// expenses.create
{ category, description, amount: integer >= 1, expenseDate: ISO, paidTo?, method, receiptDocumentId? }
```

### 4.6 Backup

```ts
// backup.create
{ passphrase?: string, includeDocuments?: boolean, note?: string }

// backup.validate / backup.restore
{ fileName: string, passphrase?: string }
```

---

## 5. Contoh alur lengkap

### 5.1 Login

```ts
await call('vault.unlock', { password: 'master-password' })
const login = await call('auth.login', { username: 'admin', password: '...' })
// login.data.session.permissions.includes('clients.manage')
```

### 5.2 Buat transaksi, unggah dokumen, dan ubah status

```ts
const trx = await call('transactions.create', {
  clientId, type: 'NOTARIS', title: 'Pendirian PT Contoh',
  priority: 'NORMAL', parties: [{ role: 'PENGHADAP', name: 'Budi' }],
})

const picked = await call('documents.pick', {})
await call('documents.upload', {
  title: 'KTP Budi', categoryId, tempPath: picked.data.tempPath,
  originalName: 'ktp.pdf', transactionId: trx.data.id,
})

await call('transactions.changeStatus', {
  id: trx.data.id, status: 'UPLOAD_DOKUMEN', note: 'Dokumen identitas diterima',
})
```

### 5.3 Akta sampai tercatat

```ts
const deed = await call('deeds.create', {
  deedTypeId, deedDate: new Date().toISOString(), clientId, transactionId,
  title: 'Akta Pendirian PT', isi: '...', notaryId: session.userId,
})
await call('deeds.generateDocument', { id: deed.data.id, kind: 'draft' })
for (const status of ['REVIEW', 'APPROVED', 'SIGNED', 'REGISTERED'] as const) {
  await call('deeds.changeStatus', { id: deed.data.id, status })
}
// hasil REGISTERED memuat repertoriumCreated: true
```

### 5.4 Invoice dan pembayaran

```ts
const inv = await call('invoices.create', {
  clientId, transactionId,
  issueDate: new Date().toISOString(),
  discount: 0, taxPercent: 11, status: 'UNPAID',
  items: [{ kind: 'JASA_NOTARIS', description: 'Jasa akta', quantity: 1, unitPrice: 1_000_000 }],
})
await call('payments.create', {
  invoiceId: inv.data.id, amount: 600_000, method: 'TRANSFER',
  paidAt: new Date().toISOString(), reference: 'TRF-001',
})
```

### 5.5 Verifikasi audit

```ts
const verify = await call('audit.verify', {})
// { ok: true, checked: 22, total: 22, brokenAt: null }
```

---

### 5.6 Pengajuan gateway AHU sampai bukti hasil

```ts
const services = await call('government.services', { agency: 'AHU' })
const service = services.find((s) => s.code === 'AHU_PENDIRIAN_PT')

const sub = await call('government.submissions.create', {
  agency: 'AHU',
  serviceId: service.id,
  clientId,
  transactionId,
  title: 'Pendirian PT Contoh Mandiri',
  data: {},
})
// { id, number: 'GOV/2026/0001', internalStatus: 'DRAFT', ... }

await call('government.submissions.update', {
  id: sub.id,
  title: 'Pendirian PT Contoh Mandiri',
  data: { namaBadanHukum: 'PT Contoh Mandiri', nomorAkta: '12', modalDasar: 'Rp 50.000.000' },
})
await call('government.files.add', {
  submissionId: sub.id, kind: 'DOKUMEN_PENDUKUNG', tempPath, originalName: 'dokumen-pendukung.png',
})
// checksum SHA-256 dikembalikan; berkas ditulis di documents/government/<id>

await call('government.submissions.changeStatus', { id: sub.id, toStatus: 'SIAP_DIAJUKAN' })
await call('government.submissions.changeStatus', { id: sub.id, toStatus: 'MENUNGGU_PORTAL' })

// Operator membuka portal resmi pada browser (tautan di antarmuka); aplikasi hanya mencatatnya.
await call('government.submissions.portalOpened', { id: sub.id, online: true })

// Setelah portal memberi nomor, petugas mengetiknya kembali ke aplikasi.
await call('government.submissions.addReference', {
  submissionId: sub.id, type: 'NOMOR_PERMOHONAN', value: 'AHU-2026-000777', source: 'PORTAL',
})
await call('government.files.add', {
  submissionId: sub.id, kind: 'BUKTI_PENGAJUAN', tempPath, originalName: 'tanda-terima.png',
})
await call('government.submissions.changeStatus', { id: sub.id, toStatus: 'DIAJUKAN', source: 'PORTAL' })

await call('government.submissions.recordOfficialStatus', {
  id: sub.id, officialStatus: 'Dalam verifikasi AHU', source: 'PORTAL',
})
await call('government.submissions.changeStatus', { id: sub.id, toStatus: 'DIPROSES', source: 'PORTAL' })

await call('government.files.add', {
  submissionId: sub.id, kind: 'HASIL_LAYANAN', tempPath, originalName: 'sk-hukum.png',
})
const done = await call('government.submissions.changeStatus', {
  id: sub.id, toStatus: 'SELESAI', source: 'SURAT_RESMI', officialStatus: 'SK Hukum diterbitkan',
})
// done.isFinal === true, done.transitions === []
// Percobaan update/changeStatus/files.add berikutnya menolak CONFLICT.
```

Dua kegagalan yang memang diharapkan:

```ts
await call('government.submissions.changeStatus', { id: sub.id, toStatus: 'SELESAI' })
// CONFLICT: Status pengajuan tidak dapat berpindah dari "Draft" ke "Selesai".

await call('government.submissions.changeStatus', { id: sub.id, toStatus: 'DIAJUKAN' })
// VALIDATION: Status "Diajukan" belum dapat dicatat. Catat nomor permohonan/berkas
// yang diberikan portal resmi. Unggah bukti pengajuan dari portal ...

await call('government.config.update', { agency: 'AHU', apiEnabled: true })
// CONFLICT: API resmi AHU/ATR/BPN belum tersedia untuk aplikasi ini.
```

---

## 6. Catatan integritas dan audit

- Handler yang mengubah data memanggil `audit()` dengan `action`, `entity`, `entityId`, serta `before`/`after` bila relevan.
- Penulisan audit diserialisasi per proses dan dicoba ulang saat bentrok; migrasi `007_audit_chain.sql` menambahkan trigger `trg_audit_logs_chain` yang menolak `INSERT` bila `prevHash` tidak sama dengan kepala rantai, sehingga rantai tidak dapat bercabang meski ada penulis lain.
- Tabel audit, repertorium, protokol, revisi akta, dan riwayat workflow dilindungi trigger append-only; percobaan `UPDATE`/`DELETE` langsung ke SQLite akan gagal.
- Akta tidak dapat dihapus; isi akta dikunci setelah `SIGNED` dan juga setelah nomor repertorium tercatat (termasuk pencatatan manual), sehingga nomor tidak pernah menunjuk isi yang berbeda.
- `deeds.repertorium.register` hanya menerima akta berstatus `APPROVED`/`SIGNED`.
- Objek tanah PPAT (`ppat.properties.*`) tidak dapat diubah/dihapus setelah transaksi induknya `SELESAI`/`BATAL`, dan tidak dapat dihapus selama masih memiliki sertifikat atau tenggat; audit menyimpan snapshot objek beserta daftar sertifikat.
- Nomor urut dialokasikan di dalam transaksi database yang sama dengan pembuatan entitas.
- `reports.exportPdf`, `reports.exportExcel`, `invoices.exportPdf`, backup, restore, dan ekspor mencatat aksi audit.
- Route `backup.delete` menghapus berkas backup dan mencatat `DELETE_BACKUP`; berkas dokumen permanen hanya dapat dihapus melalui `documents.purgeFile` dengan izin `settings.manage`.
- Delapan tabel gateway (`government_services`, `government_submissions`, `government_submission_files`, `government_status_history`, `government_references`, `government_sync_logs`, `government_api_config`, `government_api_credentials`) dilindungi trigger pada migrasi `003_government_integration.sql`: riwayat dan log append-only, berkas hanya hapus lunak, identitas dan pengajuan final terkunci.
- Kredensial portal hanya boleh berbentuk ciphertext berawalan `dpapi:` (CHECK + trigger INSERT/UPDATE). Renderer tidak pernah menerima `cipherText`; `government.credentials.test` mengembalikan panjang hasil dekripsi, bukan nilainya.
- Tidak ada route gateway yang membuka koneksi jaringan. Pembukaan portal terjadi lewat tautan `https` di renderer dan dicatat sebagai log `PENDING`.

---

## 7. Menambah route baru

1. Daftarkan dengan `route('nama.route', { auth, perm, schema, handler })` di file modul `src/main/ipc/`.
2. Tambahkan skema Zod di `src/shared/schemas.ts` (atau lokal bila sangat spesifik).
3. Panggil `audit()` untuk operasi tulis.
4. Gunakan `inTransaction()` bila melibatkan beberapa tabel atau penomoran.
5. Tambahkan izin baru ke `PERMISSION_CATALOG` dan role yang berhak bila diperlukan.
6. Tambahkan uji unit/E2E untuk jalur sukses dan minimal satu jalur gagal.
