# Instalasi dan Pemeliharaan

## Persyaratan

- Windows 10 atau Windows 11, 64-bit.
- RAM minimal 4 GB; disarankan 8 GB.
- Ruang disk minimal 500 MB untuk aplikasi dan cadangan awal.
- Akun Windows dengan izin menulis ke profil pengguna (`%APPDATA%`).
- Tidak memerlukan server, database terpisah, Docker, atau koneksi internet.

## Instalasi Windows

1. Jalankan `NOTARIS-PRO-Setup-1.0.0-x64.exe`.
2. Bila Windows SmartScreen muncul, pilih **More info** lalu **Run anyway**. Installer belum ditandatangani secara digital.
3. Pilih folder instalasi. Pemasangan default dilakukan per pengguna sehingga tidak memerlukan hak administrator.
4. Selesaikan wizard. Shortcut **NOTARIS PRO** dibuat di Desktop dan Start Menu.
5. Jalankan aplikasi dari shortcut.

Installer tidak menghapus folder data saat uninstall. Data tetap berada di `%APPDATA%\Notaris Pro`.

## Penyiapan pertama

Aplikasi menampilkan wizard tiga langkah. Seluruh field bertanda bintang wajib diisi.

### Langkah 1 — Identitas Kantor

- **Nama Kantor** (minimal 2 karakter), contoh: `Kantor Notaris & PPAT Budi Santoso, S.H.`
- **Nama Notaris / PPAT** (minimal 2 karakter), beserta gelar.

Alamat, telepon, email, dan kota dapat dilengkapi kemudian di menu **Pengaturan → Kantor**.

### Langkah 2 — Administrator

- **Nama Lengkap Administrator**
- **Username** 3–50 karakter: huruf, angka, titik, garis bawah, atau strip.
- **Email** opsional.
- **Password** minimal 10 karakter.
- **Konfirmasi Password**

### Langkah 3 — Keamanan Database

- **Master Password Database** minimal 12 karakter.
- **Konfirmasi Master Password**.
- Centang pernyataan pemahaman risiko.

Setelah tombol **Selesaikan penyiapan** ditekan:

1. Skema database dibuat dan data referensi (role, izin, jenis akta, kategori dokumen, penomoran, pengaturan awal) diisi.
2. Vault dibuat dan database dienkripsi.
3. **Recovery code** ditampilkan satu kali.

> Simpan recovery code di tempat aman (safe deposit box atau password manager). Kode ini setara dengan kunci database. Jika master password dan recovery code hilang, data tidak dapat dipulihkan oleh siapa pun, termasuk pembuat aplikasi.

Centang **Saya telah menyimpan recovery code ini di tempat yang aman**, lalu tekan **Masuk ke NOTARIS PRO**.

## Lokasi data

| Isi | Lokasi |
| --- | --- |
| Database terenkripsi | `%APPDATA%\Notaris Pro\database\notaris_pro.db.enc` |
| Database aktif (hanya saat terbuka) | `%APPDATA%\Notaris Pro\database\notaris_pro.db` |
| Dokumen | `%APPDATA%\Notaris Pro\documents` |
| Template | `%APPDATA%\Notaris Pro\templates` |
| Ekspor PDF/Excel | `%APPDATA%\Notaris Pro\exports` |
| Backup | `%APPDATA%\Notaris Pro\backups` |
| Log aplikasi | `%APPDATA%\Notaris Pro\logs\app.log` |
| Metadata vault | `%APPDATA%\Notaris Pro\config\vault.json` |

Untuk keperluan uji atau pemakaian portable, set variabel lingkungan `NOTARIS_DATA_DIR` sebelum aplikasi dijalankan. Jangan gunakan variabel ini untuk memindahkan data produksi tanpa menyalin seluruh isi folder.

## Backup rutin

- Backup harian otomatis aktif secara default setelah login pertama pada hari tersebut (`system.autoBackupDaily = true`).
- Backup dapat dibuat manual di **Backup & Restore → Buat Backup**. Prosesnya membaca ulang dan memverifikasi backup sebelum berkas final dibuat, jadi backup lama tidak pernah dihapus lebih dulu.
- Simpan salinan berkas `.npbackup` di media terpisah. Backup terikat pada vault atau passphrase yang dipakai saat membuatnya. Ketika folder backup berada di volume yang sama dengan data aplikasi, halaman **Backup & Restore** menampilkan pengingat untuk menyalinnya ke media lain.
- Jumlah backup otomatis yang disimpan diatur di **Pengaturan → Sistem** (`Jumlah backup otomatis yang disimpan`, bawaan 30). Yang dibersihkan hanya berkas otomatis dan selalu tersisa minimal satu.

## Memperbarui aplikasi

1. Buat backup manual dan salin berkas `.npbackup` ke media eksternal.
2. Tutup aplikasi; pastikan tidak ada proses `NOTARIS PRO.exe` yang berjalan.
3. Jalankan installer versi baru. Folder data tidak diubah.
4. Buka aplikasi dan masuk kembali.

Migrasi skema berjalan otomatis saat database dibuka. Bila ada migrasi tertunda dan pengaturan `system.preMigrationBackup` aktif, aplikasi membuat backup pra-migrasi terlebih dahulu; bila backup gagal, migrasi dibatalkan.

## Uninstall

Gunakan **Settings → Apps → NOTARIS PRO → Uninstall**. Langkah ini menghapus program, bukan data. Hapus folder `%APPDATA%\Notaris Pro` secara manual hanya bila data memang tidak diperlukan lagi.

## Pemecahan masalah

| Gejala | Tindakan |
| --- | --- |
| Pesan “Database masih terkunci” | Masukkan master password atau recovery code pada layar **Database Terkunci**. |
| Master password lupa | Gunakan **Recovery Code** pada layar yang sama. Kode tidak peka huruf besar/kecil dan tanda hubung diabaikan. |
| Aplikasi menolak login | Periksa Caps Lock. Setelah 5 percobaan gagal (bawaan), login ditahan 60 detik. |
| Tidak ada jendela setelah splash | Periksa `logs\app.log`; pastikan RAM tidak habis dan antivirus tidak memblokir `NOTARIS PRO.exe`. |
| Antivirus menandai installer | Installer tidak ditandatangani. Tambahkan pengecualian hanya bila checksum installer sudah diverifikasi. |
| Data tidak ditemukan setelah pindah komputer | Salin seluruh folder `%APPDATA%\Notaris Pro`, bukan hanya `notaris_pro.db.enc`; backup `.npbackup` lebih disarankan. |
| Restore gagal | Restore otomatis membuat backup pengaman dan mencoba rollback. Pesan galat menyebut berkas backup pengaman yang dapat dipakai untuk pemulihan manual. |

## Verifikasi build

Sebelum distribusi, cocokkan checksum installer:

```powershell
Get-FileHash "release\NOTARIS-PRO-Setup-1.0.0-x64.exe" -Algorithm SHA256
```

Simpan hasil checksum bersama arsip rilis. Build yang ada saat ini **tidak ditandatangani** (`Get-AuthenticodeSignature` menghasilkan `NotSigned`) karena tidak ada code signing certificate pada mesin build; ini tidak memengaruhi fungsi, tetapi Windows dapat menampilkan peringatan reputasi.

Bila sertifikat tersedia, electron-builder membaca `CSC_LINK` (path/Base64 berkas `.pfx`) dan `CSC_KEY_PASSWORD` dari environment. Jangan menaruh sertifikat atau kata sandinya di repositori:

```powershell
$env:CSC_LINK = "C:\kunci\notarispro-signing.pfx"
$env:CSC_KEY_PASSWORD = "<kata-sandi-pfx>"
npm run dist:win
Get-AuthenticodeSignature "release\NOTARIS-PRO-Setup-1.0.0-x64.exe" | Format-List Status,SignerCertificate
```

Build baru boleh disebut "tertanda" hanya setelah perintah terakhir menampilkan `Status=Valid`.

## Linux dan macOS

Konfigurasi target tersedia (`npm run dist:linux`, `npm run dist:mac`), tetapi build Linux/macOS belum dibangun dan diuji pada lingkungan pengembangan ini. Sebelum distribusi:

1. Build di sistem operasi target.
2. Pastikan engine Prisma untuk platform tersebut tersedia.
3. Jalankan smoke test aplikasi terpaket dan e2e.
4. Uji pembuatan PDF, DOCX, dan restore backup.

Jangan mengklaim dukungan Linux/macOS sebelum langkah di atas lulus.
