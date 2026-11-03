# NOTARIS PRO

Aplikasi desktop offline-first untuk administrasi **Kantor Notaris & PPAT** di Indonesia. Seluruh data tersimpan lokal di perangkat, database dienkripsi saat aplikasi ditutup, dan setiap perubahan penting tercatat pada audit log dengan rantai hash SHA-256.

- Nama aplikasi: **NOTARIS PRO**
- Versi: **1.0.0**
- Platform utama: **Windows 10/11 x64**
- Bahasa antarmuka: **Indonesia**
- Mata uang: **Rupiah**, tanggal **DD-MM-YYYY**, zona waktu **Asia/Jakarta**

## Status verifikasi

| Pemeriksaan | Status |
| --- | --- |
| Typecheck main + renderer (`npm run typecheck`) | Lulus |
| Unit test Vitest | 87 tes lulus (9 berkas) |
| E2E Electron build dev (`npm run e2e`) | Lulus |
| E2E aplikasi terpaket (`E2E_APP=...`) | Lulus |
| Installer Windows NSIS x64 | Terbentuk dan diuji start |
| Linux AppImage/deb, macOS DMG | Target dikonfigurasi, **belum dibangun/diuji** di lingkungan ini |

E2E mencakup setup vault, login, CRUD klien, workflow transaksi, akta + pembuatan DOCX + repertorium otomatis, invoice + pembayaran + pengeluaran, 11 laporan PDF/Excel, jalur gateway AHU Draft→Selesai dengan nomor resmi + bukti + hasil, penguncian pengajuan final, kredensial terenkripsi, backup + validasi + restore, verifikasi audit, pembukaan 15 modul UI termasuk delapan tab Integrasi Pemerintah, logout, dan login ulang.

## Kemampuan utama

- **Dashboard**: ringkasan klien, akta, transaksi, pendapatan, grafik bulanan, distribusi jenis akta, agenda, dan aktivitas.
- **Klien**: perorangan/badan hukum, identitas (KTP, NPWP, paspor, dll.), legalitas perusahaan, catatan internal, arsip.
- **Transaksi**: alur kerja 14 tahap dengan riwayat pengguna, waktu, status lama/baru, dan catatan.
- **Akta Notaris & PPAT**: draft, review, approval, tanda tangan, pencatatan, arsip; pembuatan DOCX dari template; revisi tersimpan; isi akta terkunci setelah ditandatangani.
- **Repertorium & Protokol**: nomor urut per tahun, pencatatan otomatis saat akta berstatus Tercatat, catatan tidak dapat diubah/dihapus.
- **Dokumen**: upload, kategori, versi, ganti berkas, unduh, pratinjau, audit, soft delete dengan berkas fisik dipertahankan.
- **Keuangan**: invoice dengan item, diskon, pajak, pembayaran parsial, piutang, pengeluaran, ringkasan laba/rugi sederhana.
- **Kalender**: jadwal, tugas, dan tenggat hukum.
- **Integrasi Pemerintah**: pencatatan pengajuan AHU Online dan ATR/BPN secara semi-otomatis — persiapan data, berkas ber-checksum SHA-256, tautan portal resmi, pencatatan nomor/status/bukti, log append-only, dan kredensial terenkripsi DPAPI. Tidak ada API resmi yang diaktifkan dan tidak ada scraping.
- **Laporan**: 11 laporan dengan ekspor PDF dan Excel.
- **Karyawan & Role**: 8 role bawaan, izin granular, nonaktifkan akun.
- **Audit Log**: append-only, hash chain, tombol verifikasi rantai.
- **Backup & Restore**: backup dialirkan per berkas melalui wadah NPBACKUP2 (tidak pernah memuat seluruh database ke memori), salinan konsisten lewat SQLite Online Backup API, enkripsi AES-256-GCM + gzip, validasi checksum + integritas SQLite sebelum berkas final diberi nama, penolakan backup yang penulisannya terputus, backup pengaman sebelum restore, dan rollback otomatis bila restore gagal.
- **Pengaturan**: identitas kantor, kebijakan sistem/keuangan/keamanan, penomoran otomatis, template DOCX, vault.

## Teknologi

Electron 45, React 19, TypeScript 5.9, Tailwind CSS 3.4, React Router 7, Recharts, Lucide, Prisma 6 + SQLite, Docxtemplater, SheetJS (XLSX), PDF melalui `printToPDF` Electron, hash-wasm (Argon2id), electron-builder.

Tidak menggunakan Docker. Tidak ada server cloud. Tidak ada panggilan API keluar dari aplikasi — termasuk ke AHU atau ATR/BPN; modul Integrasi Pemerintah hanya mencatat pekerjaan yang operator lakukan pada portal resmi.

## Menjalankan dari sumber

Prasyarat: Node.js 20 atau lebih baru (diuji pada Node 24), npm, Windows untuk build installer.

```bash
npm install
npm run dev
```

Saat pertama dijalankan, aplikasi membuka wizard penyiapan tiga langkah:

1. **Identitas Kantor** — nama kantor dan nama notaris/PPAT.
2. **Administrator** — nama lengkap, username, password (minimal 10 karakter).
3. **Keamanan Database** — master password (minimal 12 karakter) dan persetujuan risiko.

Setelah selesai, **recovery code ditampilkan satu kali**. Simpan kode tersebut di tempat aman; tanpa master password dan recovery code, data tidak dapat dipulihkan.

## Build installer Windows

```bash
npm run dist:win
```

Hasil:

```
release/NOTARIS-PRO-Setup-1.0.0-x64.exe
release/win-unpacked/NOTARIS PRO.exe
```

Installer tidak ditandatangani secara digital. Windows SmartScreen dapat menampilkan peringatan pada instalasi pertama; verifikasi checksum berkas bila installer didistribusikan.

## Tes

```bash
npm test                 # unit test
npm run e2e              # build + E2E Electron dengan data sementara
E2E_APP="release/win-unpacked/NOTARIS PRO.exe" npm run e2e   # E2E aplikasi terpaket
```

E2E memakai direktori data terpisah di `tmp/` dan membersihkannya setiap awal run. Lihat [docs/PENGUJIAN.md](docs/PENGUJIAN.md).

## Lokasi data

| Sistem | Direktori |
| --- | --- |
| Windows | `%APPDATA%\Notaris Pro` |
| Linux | `~/.config/Notaris Pro` |
| macOS | `~/Library/Application Support/Notaris Pro` |

Isi direktori:

```
database/  notaris_pro.db (saat terbuka), notaris_pro.db.enc (saat terkunci)
documents/ dokumen klien, akta, sertifikat, invoice, identitas, government
templates/ template DOCX kantor
exports/   hasil ekspor PDF dan Excel
backups/   berkas .npbackup
logs/      app.log
config/    vault.json, local.json
tmp/       berkas kerja sementara
```

Direktori ini **bukan** direktori instalasi aplikasi, sehingga pembaruan/uninstall tidak menghapus data secara diam-diam. Override untuk pengujian/portable: variabel lingkungan `NOTARIS_DATA_DIR`.

## Keamanan

- Master password dan password pengguna tidak pernah disimpan plaintext; password pengguna memakai **Argon2id**.
- Kunci database acak 32 byte dibungkus master password (Argon2id + AES-256-GCM) dan recovery code.
- Saat aplikasi ditutup atau vault dikunci, database plaintext dihapus dan hanya `notaris_pro.db.enc` yang tersisa.
- Backup selalu terenkripsi AES-256-GCM; kunci diturunkan dari vault (HKDF) atau passphrase (Argon2id).
- Audit log, repertorium, protokol, revisi akta, dan riwayat workflow dilindungi trigger SQLite append-only.
- Riwayat status, nomor/referensi resmi, dan log gateway pemerintah juga append-only; berkas pengajuan hanya dapat dikeluarkan dari daftar, dan pengajuan berstatus Selesai/Ditolak/Dibatalkan terkunci penuh.
- Kata sandi portal hanya disimpan sebagai ciphertext berawalan `dpapi:` (DPAPI via safeStorage); CHECK dan trigger menolak teks terbuka, dan nilai rahasia tidak pernah dikirim ke renderer.
- Isi akta berstatus SIGNED/REGISTERED/ARCHIVED tidak dapat diubah; akta tidak dapat dihapus.
- Renderer berjalan dengan `contextIsolation`, `sandbox`, tanpa `nodeIntegration`; akses data hanya melalui satu kanal IPC tervalidasi zod.

Detail: [docs/ARSITEKTUR.md](docs/ARSITEKTUR.md).

## Batas yang disengaja

- **Tidak ada integrasi API dengan AHU atau BPN.** Modul Integrasi Pemerintah berhenti pada Level 1–2: aplikasi menyiapkan data, membuka portal resmi, dan mencatat kembali nomor, status, serta bukti yang Anda lihat di sana. Tidak ada pengiriman berkas, tidak ada pengisian formulir otomatis, tidak ada scraping atau bypass login/CAPTCHA, dan tidak ada klaim status dari instansi sebelum bukti resmi dicatat. Level 3 (API) baru dibuka setelah ada dokumentasi resmi dan uji dengan akses resmi.
- Aplikasi mencatat alur dan menyimpan draft/minuta, tetapi **tidak menjadikan draft sebagai akta autentik**. Keabsahan akta tetap ditentukan oleh pejabat berwenang dan prosedur hukum yang berlaku.
- Tidak ada sinkronisasi multi-perangkat atau cloud. Satu database lokal per instalasi.
- Template invoice DOCX disediakan sebagai cadangan; PDF invoice memakai tata letak bawaan aplikasi.
- Build Linux/macOS belum diverifikasi pada lingkungan ini.

## Dokumentasi

- [Instalasi & pemeliharaan](docs/INSTALL.md)
- [Panduan penggunaan](docs/PANDUAN-PENGGUNAAN.md)
- [Arsitektur & keamanan](docs/ARSITEKTUR.md)
- [API internal (IPC)](docs/API-INTERNAL.md)
- [Panduan template DOCX](docs/TEMPLATE-DOCX.md)
- [Panduan pengujian](docs/PENGUJIAN.md)
- [Hasil pengukuran performa](docs/PERFORMA.md)
- [Contoh variabel lingkungan](.env.example)
