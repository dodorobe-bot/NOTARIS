# Pengujian — NOTARIS PRO

Dokumen ini mencatat cara menjalankan pengujian, apa yang diperiksa, hasil terakhir, dan area yang belum diuji. Angka pada bagian hasil adalah keluaran nyata, bukan perkiraan.

---

## 1. Prasyarat

- Windows 10/11 x64 (lingkungan verifikasi saat ini), Node.js 24, npm.
- Dependensi terpasang (`npm install`; `postinstall` menjalankan `prisma generate`).
- Pengujian E2E membutuhkan Electron dan tampilan grafis; tidak berjalan di lingkungan headless murni tanpa virtual display.
- Tidak memerlukan Docker, server database, atau koneksi internet.
- Mesin uji memiliki RAM terbatas (sekitar 3,8 GB). Jalankan build/pengemasan satu per satu; hindari proses Node besar bersamaan.

Variabel lingkungan penting:

| Variabel | Fungsi |
|---|---|
| `NOTARIS_DATA_DIR` | Menimpa folder data (dipakai E2E untuk isolasi) |
| `NOTARIS_VAULT=off` | Menonaktifkan vault — **hanya** untuk pengembangan/uji |
| `E2E_APP` | Path executable aplikasi terpaket untuk E2E mode paket |
| `ELECTRON_RUN_AS_NODE` | Harus **dihapus** sebelum menjalankan Electron; bila bernilai `1`, Electron berjalan sebagai Node dan gagal membuka window |

---

## 2. Perintah

```bash
npm run typecheck   # tsc main/preload + renderer, dengan noUnusedLocals/noUnusedParameters
npm test            # Vitest, 22 berkas
npm run e2e         # build + E2E Electron dari sumber
npm run build       # electron-vite build
npm run dist:win    # build + installer NSIS
```

E2E terhadap aplikasi terpaket:

```bash
E2E_APP="release/win-unpacked/NOTARIS PRO.exe" npm run e2e
```

Pada mode terpaket, skrip tidak menjalankan build ulang dan memakai folder data `tmp/e2e-packaged`.

---

## 3. Uji unit (Vitest)

Konfigurasi: `vitest.config.ts`, environment Node, alias `@shared`, pola `tests/**/*.test.ts`.

| Berkas | Jumlah | Cakupan |
|---|---:|---|
| `tests/crypto.test.ts` | 13 | Format hash Argon2id (bukan plaintext), verifikasi password benar/salah, hash rusak ditolak, AES-256-GCM bolak-balik, tag diubah gagal, magic `NPVAULT1`, magic salah ditolak, kode pemulihan 24 karakter berkelompok, SHA-256 deterministik; berkas NPVAULT2 (streaming) bolak-balik utuh dengan SHA-256 sama, berkas NPVAULT1 lama tetap terbaca, byte rusak/gunting/tanpa kunci yang benar ditolak dan tidak meninggalkan berkas hasil separuh |
| `tests/finance.test.ts` | 11 | Semua token penomoran, tahun dua digit/Romawi, lebar urutan, tanggal Asia/Jakarta, perhitungan subtotal/diskon/pajak/total, diskon melebihi subtotal, pembulatan rupiah, status invoice dari pembayaran, status `DRAFT`/`VOID`, metadata paginasi, rentang tanggal inklusif |
| `tests/workflow.test.ts` | 6 | Setiap status memiliki label Indonesia, semua transisi menuju status dikenal, `SELESAI`/`BATAL` final, status lain dapat menuju `BATAL`, jalur registrasi→selesai dapat dilalui, tidak ada lompatan mundur dari status akhir |
| `tests/audit.test.ts` | 8 | Hash deterministik dan sensitif perubahan, rantai utuh diterima, perubahan isi terdeteksi, penghapusan entri tengah terdeteksi, `prevHash` tidak cocok terdeteksi, rantai kosong valid, verifikasi bertahap memberi hasil sama dengan verifikasi sekaligus, entri sesudah titik putus tidak mengubah hasil |
| `tests/audit-chain-db.test.ts` | 2 | 24 penulisan audit paralel pada SQLite nyata tetap membentuk satu rantai yang lolos verifikasi; trigger migrasi 007 menolak baris dengan `prevHash` yang tidak menyambung ke kepala rantai dan menerima baris yang benar |
| `tests/audit-multiprocess.test.ts` | 1 | Dua proses Node terpisah menulis 15 entri audit serentak ke satu berkas SQLite WAL nyata; 30 baris tersimpan dengan `entityId` unik dan verifikasi rantai melaporkan 30 entri utuh. Menguji pemetaan `P2003` dari trigger SQLite dan retry konflik rantai yang sebelumnya tidak tertangani |
| `tests/attempt-guard.test.ts` | 5 | Kunci setelah 5 kegagalan dan tetap terkunci setelah proses dibuat ulang; mode recovery terpisah dari master; berkas status tidak memuat kata sandi; kunci dibuka setelah 60 detik dan satu kegagalan langsung mengunci lagi; keberhasilan menghapus riwayat; berkas rusak/terlalu besar/`until` di masa depan diabaikan atau dijepit; batas percobaan dapat dikonfigurasi untuk login |
| `tests/restore-failure.test.ts` | 3 | Restore gagal di tengah proses (berkas dokumen menjadi direktori) tidak merusak database, lalu rollback memulihkan database dan dokumen ke kondisi pra-restore tanpa menyisakan `.restoring`; koneksi SQLite yang masih terbuka saat restore ditunggu sampai kunci Windows dilepas (regresi `EPERM`); backup rusak ditolak sebelum database aktif disentuh |
| `tests/backup.test.ts` | 4 | Magic `NPBACKUP1` dan pembacaan ulang header, magic salah ditolak, ciphertext diubah ditolak, kunci salah ditolak |
| `tests/backup-stream.test.ts` | 12 | Wadah NPBACKUP2: baca-ulang identik untuk codec gzip dan raw, verifikasi tanpa menulis ke disk, penulisan terputus dikenali (footer hilang), byte diubah tertangkap tag GCM, footer dikutak-atik gagal checksum, kunci salah ditolak tanpa meninggalkan berkas separuh jadi, nama entri keluar direktori ditolak, filter `include` hanya menulis yang diminta tetapi semua entri tetap diverifikasi, daftar isi tanpa kunci cocok ukuran sumber, wadah kosong/header asing ditolak, progres per entri |
| `tests/migrate.test.ts` | 8 | Salinan memakai SQLite Online Backup API dan berisi seluruh data, salinan tidak mengandung data yang masih di WAL sumber, checkpoint melaporkan keberhasilan eksplisit, PRAGMA performa menjaga `synchronous=FULL` dan tidak pernah memuat VACUUM, migrasi 004 membuat enam indeks komposit dan ANALYZE menulis `sqlite_stat1` tanpa merusak integritas, migrasi 005 menjaga indeks FTS5 tetap sinkron saat baris ditambah/diubah/dihapus, migrasi 006 mengganti indeks `deedId` dengan komposit `(deedId, createdAt)` dan rencana kueri riwayat memakai indeks itu sekaligus mengembalikan baris berurutan, PRAGMA menolak nilai tidak masuk akal |
| `tests/search-query.test.ts` | 7 | Satu kata menjadi kueri awalan, beberapa kata digabung AND, nomor akta dipecah menurut tanda baca, tanda kutip/operator FTS dari masukan tidak diteruskan, token ganda dibuang, masukan tanpa huruf/angka menghasilkan kueri kosong, jumlah token dibatasi enam |
| `tests/pagination.test.ts` | 6 | Offset halaman pertama selalu nol, perhitungan offset halaman dalam, nomor halaman tidak masuk akal tidak menghasilkan offset negatif, pagar 200.000 baris menerima tepat pada batas dan menolak di atasnya |
| `tests/perf.test.ts` | 8 | Baris log performa hanya memuat kunci `at/route/ms/ok/code`, field tambahan (payload/NIK/nama pengguna) tidak lolos, rute asing menjadi `unknown`, kode galat bebas dihilangkan, durasi negatif/NaN menjadi 0 dan dibulatkan, ringkasan p50/p95/maks dengan nearest-rank, penanda lambat ≥250 ms, pengelompokan per rute menurut p95, ring memori dibatasi |
| `tests/virtual.test.ts` | 7 | Jendela virtual kosong untuk data kosong, overscan di posisi teratas, pergeseran jendela mengikuti scroll, penjepitan di ujung bawah, spacer atas+baris+spacer bawah menutup tinggi total, nilai scroll/tinggi tidak masuk akal diganti default, jendela hanya aktif di atas 60 baris dan saat diminta |
| `tests/report-notice.test.ts` | 3 | Pesan pemotongan diam ketika seluruh baris termuat, menyebutkan jumlah yang dimuat dan yang ada, tetap memperingatkan ketika hasil kosong namun datanya ada |
| `tests/preview-policy.test.ts` | 15 | Keputusan pratinjau per tipe dan ukuran (gambar/PDF/DOCX/XLSX, ukuran nol atau tidak valid); thumbnail tidak memperbesar gambar kecil dan dibatasi 1.024 px; kunci cache berubah saat path, mtime, ukuran, lebar, atau tipe berubah; pembersihan cache membuang berkas kedaluwarsa lalu yang paling lama diakses sampai muat, termasuk berkas tunggal yang melebihi batas |
| `tests/templates.test.ts` | 5 | Tiga template DOCX bawaan ada dan dapat dirender Docxtemplater tanpa sisa placeholder, hasil render akta memuat nomor, klien, dan penghadap, hanya DOCX aktif yang dianggap template |
| `tests/vault-file.test.ts` | 2 | Siklus vault nyata pada folder data sementara: buat vault, kunci (database plaintext dan WAL hilang, berkas terenkripsi `NPVAULT2`, tanpa `.tmp`), kata sandi salah ditolak, buka kembali dan data utuh; berkas `NPVAULT1` versi lama tetap dapat dibuka lalu dikunci ulang sebagai `NPVAULT2` |
| `tests/settings.test.ts` | 5 | Menerima nilai sah, menolak zona waktu tak dikenal, boolean selain `true`/`false`, angka di luar batas, dan format tanggal yang tidak didukung |
| `tests/time.test.ts` | 5 | Tanggal Jakarta (bukan UTC), awal/akhir hari Jakarta, awal bulan menurut zona kantor, pergeseran bulan, dan konversi komponen lokal ke instant UTC |
| `tests/government.test.ts` | 36 | Transisi status gateway (jalur sah, empat lompatan ilegal, pesan berbahasa Indonesia, status final tanpa keluaran); syarat bukti tiap status (nomor resmi, bukti pengajuan, hasil layanan, status resmi); `parseGovernmentData` membuang nilai kosong/bukan teks/JSON rusak; gerbang portal hanya menerima `https://layanan.ahu.go.id/` dan `https://mitra.atrbpn.go.id/` serta menolak http, domain mirip (`ahu.go.id.evil.test`), hostname telanjang, `javascript:`; kapabilitas jujur (`officialApiAvailable`/`automatedSubmission` = false); `isEncryptedCredential` dan enkripsi DPAPI; skema Zod (default view, enum, batas 30 isian, kunci 60 karakter, `apiEnabled` tak boleh default true); kelompok tampilan menutup 8 status tanpa tumpang tindih; 17 layanan master unik berprefiks instansi; **enam tes menjalankan migrasi SQL 001–003 pada SQLite in-memory** dan membuktikan pemicu menolak ubah nomor/instansi/layanan, ubah/hapus riwayat status, referensi, log, hapus berkas, serta menyimpan kredensial tanpa awalan `dpapi:` |
| **Total** | **172** | |

Hasil terakhir (2026-11-03):

```
Test Files  22 passed (22)
     Tests  172 passed (172)
  Duration  11.30s
```

`npm run typecheck` selesai tanpa keluaran kesalahan (tsc untuk `tsconfig.node.json` dan `tsconfig.web.json`). Kedua proyek kini memakai `noUnusedLocals` dan `noUnusedParameters`; pelanggaran yang muncul (impor mati di `ppat.ts`, `router.ts`, `settings.ts`, `Auth.tsx`, helper `optInt`, dan variabel `nextMonthBegin` yang tidak terpakai) sudah dibersihkan, bukan diredam.

---

## 4. Uji E2E (Playwright + Electron)

Skrip: `scripts/e2e.mjs`. Alur lengkap dijalankan pada satu sesi aplikasi dengan data terisolasi di `tmp/e2e-data` (dev) atau `tmp/e2e-packaged` (paket). Folder data dihapus sebelum uji.

### 4.1 Cakupan langkah

| Tahap | Yang diverifikasi |
|---|---|
| Penyiapan | Wizard tiga langkah lewat UI; validasi recovery code `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`; masuk ke aplikasi |
| Klien | `clients.create` dan pencarian; kode `KLN-00001` |
| Transaksi | Status awal `REGISTRASI_TRANSAKSI`; transisi `UPLOAD_DOKUMEN → VERIFIKASI → DRAFT → REVIEW → APPROVAL`; jumlah riwayat = transisi + 1 |
| Akta | Pembuatan akta dengan notaris; draft DOCX; status `REVIEW → APPROVED → SIGNED → REGISTERED`; `repertoriumCreated`; minuta; revisi; repertorium |
| Agenda | Dua jadwal (hari ini dan besok) tersimpan dan muncul di `calendar.appointments`; jadwal hari ini tampil di dashboard; tugas dibuat, diselesaikan, lalu dihapus |
| Dokumen | Unggah PNG, pencarian, pratinjau data URL, versi awal, ubah metadata, hapus lunak, dan restore |
| Keuangan | Invoice Rp1.000.000 + pajak 11% = Rp1.110.000; pembayaran sebagian Rp610.000 → `PARTIAL`; lima pembayaran paralel Rp100.000 melunasi invoice; pengeluaran; ringkasan keuangan; PDF invoice |
| Laporan | 11 definisi; laporan keuangan dibuat; ekspor PDF dan XLSX; isi berkas diverifikasi (PDF diawali `%PDF-`, XLSX diawali `PK`, ukuran >1 KB), bukan hanya ekstensi |
| Gateway — master data | 9 layanan AHU + 8 layanan BPN termuat, seluruhnya menunjuk portal resmi `https`; `government.dashboard` pada basis kosong mengembalikan 0 pengajuan/0 berkas/0 referensi (tidak ada data contoh) dan `officialApiAvailable`/`automatedSubmission`/`apiEnabled` terbukti false |
| Gateway — penomoran | Nomor `GOV/YYYY/NNNN`; lima `government.submissions.create` paralel menghasilkan nomor unik |
| Gateway — gerbang bukti | Draft→Selesai langsung ditolak `CONFLICT` dengan pesan "tidak dapat berpindah"; `SIAP_DIAJUKAN` tanpa 2 data + 1 dokumen ditolak `VALIDATION`; `DIAJUKAN` tanpa nomor resmi dan tanpa bukti pengajuan ditolak (dan pesan berhenti menuntut bukti setelah nomor dicatat); `SELESAI` tanpa berkas hasil layanan ditolak |
| Gateway — jalur sah | Draft → Siap → Menunggu Portal → portal resmi dibuka (daring dan luring) → referensi `NOMOR_PERMOHONAN` tercatat sebagai `externalRef` → Diajukan (`submittedAt` terisi) → status resmi dicatat terpisah → Diproses → hasil layanan diunggah → Selesai (`SK Hukum diterbitkan`) |
| Gateway — penguncian | Setelah final: `submissions.update`, `changeStatus`, `files.add`, dan `files.remove` ditolak `CONFLICT`; detail mengembalikan `isFinal=true` dan `transitions=[]`; riwayat status minimal 7 baris |
| Gateway — berkas | Tiga berkas ber-checkbox SHA-256, pratinjau data URL, lembar persiapan diekspor ke PDF, dan berkas fisik berada di `tmp/e2e-data/documents/government/<id>` (di luar direktori instalasi) |
| Gateway — kredensial | Dengan safeStorage aktif: `credentials.save` → `config.get` dan `credentials.test` tidak pernah mengandung rahasia; kolom `cipherText` dibaca langsung dari SQLite dan terbukti berawalan `dpapi:` tanpa plaintext; penghapusan menghapus baris. Tanpa safeStorage: `save` ditolak `CONFLICT` dan tidak ada baris tertulis |
| Gateway — konfigurasi | `config.update { apiEnabled:true }` ditolak `CONFLICT` ("belum tersedia"); catatan tersimpan dan `apiEnabled` tetap false pada `config.get` |
| Gateway — log | `government.syncLogs.list` menghasilkan 28 catatan untuk AHU, 5 berstatus `PENDING` (portal dibuka & menunggu tindakan manusia), dan tidak ada pesan yang mengklaim pengiriman API resmi |
| Backup | Buat, validasi, daftar; checksum |
| Audit | `audit.verify` dengan rantai utuh (75 entri sebelum restore; 78 entri setelah otomatisasi tenggat) |
| UI | Jadwal hari ini tampil, pilihan grafik 6/12 bulan berubah, kalender berpindah bulan, `Ctrl+K` menemukan klien dan nomor pengajuan `GOV/…`; tabel klien, detail invoice, halaman laporan; Dashboard + 15 tautan sidebar lain diklik dan heading modul dimuat; delapan tab gateway diklik satu per satu dan subtitle tiap tab berganti; halaman detail `/integrasi/:id` menampilkan `SK Hukum diterbitkan` dan lencana **Terkunci** |
| Aksesibilitas & tata letak | Setiap modul: tombol/tautan/tab punya nama aksesibel, setiap input/select/textarea punya label atau `aria-label`, gambar punya `alt`, dan tidak ada overflow horizontal. Halaman `/`, `/klien`, `/keuangan`, `/laporan`, `/integrasi` diuji pada 1180×720, 1366×768, 1920×1080, 2560×1440 serta zoom 125% dan 150% |
| Sesi | Logout lewat API, reload, login ulang lewat UI |
| Restore | Buat klien baru setelah backup; restore; sesi berakhir; login ulang; klien baru hilang; total klien kembali 1; tujuh pengajuan gateway, status `SELESAI` + nomor resmi `AHU-2026-000777`, dan tiga berkasnya tetap utuh; rantai audit utuh; minimal 2 berkas backup (termasuk backup pengaman) |
| Konsol | Tidak ada error renderer selain `ResizeObserver`/React DevTools yang diabaikan |

### 4.2 Hasil terakhir

- **Dev E2E 2026-11-03 (final)**: lulus seluruh langkah (`EXIT=0`), termasuk 16 modul antarmuka (termasuk **Performa**), delapan tab gateway, jalur AHU Draft→Selesai dengan bukti, penguncian pengajuan final, kredensial DPAPI, dashboard interaktif, restore, dan verifikasi sesi. Pemeriksaan aksesibilitas menemukan dan memperbaiki kontrol tanpa label; hasil akhir: 16 modul lolos tanpa overflow. Pemindaian ukuran 1180×720 sampai 2560×1440 dan zoom 125/150% lolos tanpa overflow horizontal. PDF/Excel diverifikasi dari magic bytes dan ukuran. `audit.verify` melaporkan rantai utuh 75 entri sebelum restore dan 78 entri setelah otomatisasi tenggat. Pemeriksaan performa memastikan metrik basis data terbaca dan setiap baris `logs/performance.log` hanya memuat kunci yang diizinkan tanpa NIK/kata sandi uji. Backup: `notarispro-backup-20261103-111302-manual.npbackup`. Tidak ada error renderer di luar `ResizeObserver`/React DevTools.
- **Paket E2E 1.0.1 (final)**: lulus seluruh langkah (`EXIT=0`) terhadap `release/win-unpacked/NOTARIS PRO.exe` versi 1.0.1, termasuk 16 modul dengan aksesibilitas dasar, pemindaian ukuran/zoom, PDF/Excel dari magic bytes, delapan tab gateway, jalur AHU Draft→Selesai dengan bukti, penguncian, kredensial DPAPI, restore, dan verifikasi rantai audit 75→78 entri. Backup paket: `notarispro-backup-20261103-112138-manual.npbackup`; data uji di `tmp/e2e-packaged` dan berkas gateway fisik di `tmp/e2e-packaged/documents/government/…`.
- Data uji: 1 klien, 7 transaksi (6 paralel + 1 transaksi utama), 1 akta, 2 jadwal, 1 dokumen unggahan + dokumen akta, 1 invoice, 6 pembayaran (1 transfer + 5 tunai paralel), 1 pengeluaran, 7 pengajuan gateway (1 selesai, 5 dibatalkan, 1 BPN siap), 4 berkas gateway, 1 referensi resmi, 28 log gateway, dan 75 entri audit pada kondisi sebelum restore.
- Setelah restore: klien kembali 1, data pasca-backup hilang, seluruh pengajuan beserta berkas dan nomor resminya tetap ada, rantai audit utuh, lalu otomatisasi tenggat menambah 3 entri audit (total 78).

### 4.3 Pemeriksaan paket

- Installer: `release/NOTARIS-PRO-Setup-1.0.1-x64.exe`, 156.611.593 byte, SHA-256 `67ee18baced5d94d2da41baf37a8d60df4bb5b602860e0b02d75c5e09c042c76`.
- Tanda tangan installer: `Get-AuthenticodeSignature` → `NotSigned` (log electron-builder: "no code signing certificate configured, signing is skipped"). Mesin build tidak memiliki code signing certificate (`Cert:\CurrentUser\My`, `Cert:\LocalMachine\My`, dan variabel `CSC_*` kosong), sehingga risiko SmartScreen **belum dapat ditutup di sini**; prosedur signing berbasis `CSC_LINK`/`CSC_KEY_PASSWORD` didokumentasikan di `docs/INSTALL.md`.
- Aplikasi portabel: `release/win-unpacked/NOTARIS PRO.exe` versi 1.0.1 (249.878.528 byte, SHA-256 `18ffbed7e8ce1408ddc3e20f4176b48fd929d690f168f296b4045d1bcf46f9a9`, `NotSigned`).
- Aset terpaket diverifikasi ada: `resources/migrations/001_init.sql` sampai `resources/migrations/007_audit_chain.sql`, `resources/templates/notary/akta-umum.docx`, `resources/app/node_modules/.prisma/client/query_engine-windows.dll.node` (21.182.976 byte).
- `npm run build` diverifikasi menghasilkan `index.html` dengan CSP produksi: `script-src 'self'` (tanpa `'unsafe-inline'`) dan `connect-src 'self'` (tanpa `ws:`/`http://localhost:*`), serta hanya satu tag `<script` eksternal.
- Aplikasi terpaket membuka layar penyiapan dan menyelesaikan E2E penuh, termasuk dashboard interaktif dan seluruh modul Integrasi Pemerintah.

---

## 5. Isolasi dan pembersihan

- Semua data uji berada di `tmp/` (diabaikan git) dan tidak menyentuh folder data pengguna.
- E2E menghapus folder datanya di awal; bila perlu membersihkan manual: hapus `tmp/e2e-data`, `tmp/e2e-packaged`, `tmp/packaged-data`, `tmp/manual-data`.
- Skrip tidak membuat data dummy di database produksi. Data uji dibuat melalui API resmi seperti pengguna nyata.
- Aplikasi memakai single-instance lock; pastikan tidak ada instance NOTARIS PRO lain saat menjalankan E2E.

---

## 6. Pemecahan masalah pengujian

| Gejala | Penyebab/tindakan |
|---|---|
| `Process failed to launch!` | `ELECTRON_RUN_AS_NODE=1` masih ada di environment; hapus sebelum menjalankan Electron |
| Window tidak muncul pada aplikasi terpaket | `node_modules/.prisma` tidak tersalin; pastikan `afterPack` berjalan dan engine ada di `resources/app/node_modules/.prisma` |
| Build/pengemasan gagal dengan `Fatal process out of memory` | RAM terbatas; tutup proses lain, jalankan satu build pada satu waktu |
| E2E gagal di login | Periksa hash password di database pengujian; verifikasi Argon2id harus membaca `v=19` sebagai bagian format, bukan parameter KDF |
| Restore gagal | Backup pengaman pra-restore wajib berhasil; periksa ruang disk dan izin folder backup |
| Port/instance bentrok | Tutup instance aplikasi yang sedang berjalan |

---

## 7. Area yang belum diuji

| Area | Status |
|---|---|
| Linux (AppImage/deb) dan macOS (DMG) | Dikonfigurasi, belum dijalankan pada lingkungan ini |
| Injeksi kegagalan restore di tengah proses | Tidak diuji; validasi, backup pengaman, dan rollback jalur normal sudah diuji |
| Uji beban / banyak pengguna bersamaan | Enam pembuatan transaksi paralel dan sepuluh pembayaran paralel sudah diuji dalam satu proses; beban multi-proses/tinggi belum diuji |
| Semua kombinasi role × route | Matriks izin diuji lewat kode dan beberapa jalur E2E, bukan seluruh 8 role secara manual |
| Aksesibilitas menyeluruh | Tidak ada audit WCAG formal |
| Tampilan pada semua resolusi/DPI | Minimum window 1180×720; belum diuji pada semua skala Windows |
| Cetak langsung ke printer | PDF dibuat melalui Chromium; alur cetak fisik bergantung printer pengguna |
| Integrasi API resmi AHU/ATR/BPN | **Tidak diaktifkan dan tidak diklaim.** Tidak ada dokumentasi API dan tidak ada uji dengan akses resmi, jadi `apiEnabled` dipaksa false dan pengaktifannya ditolak. Yang diuji end-to-end adalah jalur semi-otomatis Level 1–2: persiapan, pembukaan portal resmi, pencatatan nomor/status/bukti |
| Pengambilan data dari halaman portal | Tidak diimplementasikan. Tidak ada scraping, tidak ada otomatisasi login, tidak ada bypass CAPTCHA, dan tidak akan ditambahkan tanpa izin penyelenggara |
| Isi formulir pada portal instansi | Di luar kendali aplikasi; dilakukan operator manusia. E2E hanya memverifikasi tautan portal resmi dan pencatatan balik di sisi aplikasi |
| Kredensial pada perangkat tanpa penyimpanan DPAPI | Penolakan penyimpanan plaintext diuji pada level kode dan lewat E2E; belum diuji pada profil Windows yang rusak/terbatas |
| Matriks izin `government.view/manage/configure` per role | Dirute diuji lewat jalur Administrator; penolakan untuk role tanpa izin dijaga `Guard`/`route` tetapi matriks penuh 8 role belum diuji manual |

---

## 8. Menjalankan ulang sebelum rilis

Urutan yang disarankan pada mesin ini:

```bash
npm run typecheck
npm test
npm run e2e
npm run dist:win
E2E_APP="release/win-unpacked/NOTARIS PRO.exe" npm run e2e
```

Pastikan hasil unit tetap 172 lulus (22 berkas), typecheck tanpa kesalahan termasuk pemeriksaan simbol tak terpakai, kedua E2E lulus, dan checksum installer dicatat pada catatan rilis. Benchmark performa dijalankan terpisah (`node scripts/perf-bench.mjs --profile=smoke|full --label=baseline|after`) di atas dataset sintetis di `tmp/perf-*`; hasil dan perangkat uji dicatat di `docs/PERFORMA.md`, dan angka hanya boleh diklaim dari mesin yang sama.
