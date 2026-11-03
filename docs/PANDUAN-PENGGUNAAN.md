# Panduan Pengguna — NOTARIS PRO

Panduan ini mengikuti label yang benar-benar tampil di aplikasi. Jika sebuah tindakan belum tersedia di layar, panduan ini menyebutnya apa adanya — tidak ada tombol yang hanya berfungsi di atas kertas.

---

## 1. Sebelum mulai

### 1.1 Penyiapan awal (sekali saja)

Saat aplikasi pertama kali dijalankan, layar **Penyiapan Awal** muncul dengan tiga langkah:

1. **Identitas Kantor** — isi **Nama Kantor** dan **Nama Notaris / PPAT** (masing-masing minimal 2 karakter). Alamat, telepon, dan email dilengkapi kemudian di menu **Pengaturan**.
2. **Administrator** — isi **Nama Lengkap Administrator**, **Username** (3–50 karakter: huruf, angka, titik, garis bawah, strip), **Email** (opsional), **Password** (minimal 10 karakter), dan **Konfirmasi Password**.
3. **Keamanan Database** — isi **Master Password Database** (minimal 12 karakter) dan konfirmasinya, lalu centang pernyataan bahwa Anda memahami risiko kehilangan master password. Klik **Selesaikan penyiapan**.

### 1.2 Recovery code

Setelah penyiapan, layar **Simpan Recovery Code Anda** menampilkan kode sekali saja (format `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`).

- Klik **Salin** untuk menyalin ke clipboard, atau catat manual.
- Centang **Saya telah menyimpan recovery code ini di tempat yang aman**, lalu klik **Masuk ke NOTARIS PRO**.
- Kode ini setara dengan kunci database. Simpan di safe deposit box atau password manager. Kode tidak dapat ditampilkan ulang; kode baru hanya dapat dibuat dari dalam aplikasi melalui **Pengaturan → Vault** selama vault masih terbuka.

### 1.3 Membuka database (vault terkunci)

Setiap kali aplikasi ditutup, database kembali dalam keadaan terenkripsi. Layar **Database Terkunci** menawarkan dua mode:

- **Master Password** — masukkan master password, klik **Buka Database**.
- **Recovery Code** — pilih tab **Recovery Code**, masukkan kode, klik **Buka Database**.

Jika sistem menemukan sisa database sementara akibat crash, muncul peringatan **Pemulihan pasca-crash**. Membuka vault akan memvalidasi salinan dan memilih yang utuh.

### 1.4 Masuk (login)

Setelah vault terbuka, masuk dengan **Username** dan **Password** akun Anda. Jika administrator membuatkan password untuk Anda, aplikasi meminta Anda segera mengubahnya melalui menu pengguna.

---

## 2. Navigasi dan pintasan

| Tindakan | Cara |
|---|---|
| Pindah modul | Klik menu di sidebar kiri |
| Pencarian global | `Ctrl+K` (macOS: `Cmd+K`), lalu ketik klien, transaksi, akta, invoice, dokumen, atau nomor pengajuan pemerintah (`GOV/…`). Pencarian mencocokkan awal kata (mis. `bud` menemukan `Budi`) dan nomor lengkap/sebagian (`001/11` menemukan `001/11/2026`); NIK/NPWP harus diketik lengkap |
| Ganti tema terang/gelap | Klik ikon matahari/bulan di bilah atas |
| Ubah password | Menu pengguna (pojok kanan atas) → **Ubah password** |
| Kunci database | Menu pengguna → **Kunci database** |
| Keluar aplikasi | Menu pengguna → **Keluar** |

Sesi berakhir otomatis setelah tidak ada aktivitas sesuai **Batas Idle Sesi (menit)** di **Pengaturan → Sistem** (bawaan 30 menit). Aplikasi juga memeriksa sesi setiap 60 detik; bila sesi tidak valid, Anda kembali ke layar masuk.

---

## 3. Ringkasan modul

| Menu sidebar | Isi |
|---|---|
| **Dashboard** | Ringkasan kantor, grafik, aktivitas terakhir |
| **Klien** | Data perorangan dan badan hukum beserta identitas dan legalitas |
| **Transaksi** | Registrasi perkara notaris/PPAT, workflow, pihak, dokumen, penagihan |
| **Akta Notaris** | Draft, review, approval, tandatangan, pencatatan, minuta, revisi |
| **Akta PPAT** | AJB, APHT, SKMHT, hibah, APHB, tukar menukar, objek tanah dan sertifikat |
| **Dokumen** | Penyimpanan dokumen terpusat dengan kategori dan versi |
| **Kalender** | Jadwal, tugas staf, dan tenggat hukum |
| **Integrasi Pemerintah** | Pengajuan AHU Online dan ATR/BPN: persiapan, berkas, pencatatan nomor/status resmi, log gateway |
| **Repertorium** | Nomor urut pencatatan akta per tahun |
| **Protokol Notaris** | Register minuta, salinan, dan arsip akta |
| **Keuangan** | Invoice, pembayaran, pengeluaran, piutang |
| **Laporan** | Sebelas laporan siap ekspor PDF dan Excel |
| **Karyawan & Role** | Akun pengguna, role, dan hak akses |
| **Audit Log** | Jejak aktivitas dengan rantai hash SHA-256 |
| **Backup & Restore** | Salinan terenkripsi, validasi, dan pemulihan |
| **Performa** | Ukuran basis data, halaman bebas, latensi API, dan log performa tanpa data pribadi |
| **Pengaturan** | Identitas kantor, kebijakan, penomoran, template, vault |

Menu hanya muncul bila role Anda memiliki izin `*.view` untuk modul tersebut. Bila Anda membuka alamat modul tanpa izin, aplikasi menampilkan halaman **Akses Ditolak**.

---

## 4. Dashboard

Dashboard menampilkan lima kartu ringkasan: **Total Klien**, **Total Akta**, **Akta Dalam Proses**, **Akta Selesai**, dan **Belum Ditandatangani**. Badge pada kartu menunjukkan perubahan dibanding bulan sebelumnya; bila belum ada data pembanding, badge bertuliskan **Baru** atau tidak ditampilkan.

Di bawahnya tersedia:

- **Grafik Pendapatan** — total penerimaan Rupiah pada rentang **6 Bulan Terakhir** atau **12 Bulan Terakhir**; pilihan rentang langsung memuat ulang data.
- **Jenis Akta** — donat jumlah akta per jenis beserta persentasenya; jenis di luar lima terbesar digabung sebagai **Lainnya**.
- **Jadwal Hari Ini** — konsultasi, verifikasi, dan penandatanganan pada tanggal berjalan; **Lihat Semua** membuka menu **Kalender**.
- **Transaksi Terbaru** — baris terbaru dengan nomor transaksi, nama klien, jenis layanan, status, dan tanggal; klik baris untuk membuka detail transaksi.
- **Notifikasi** — pemberitahuan sistem beserta waktu relatif; klik notifikasi yang memiliki tautan untuk membuka data terkait.
- **Kalender** — kalender bulan berjalan dengan penanda hari ini dan titik emas pada tanggal yang memiliki jadwal; tombol panah memuat jadwal bulan sebelumnya/berikutnya.

Semua angka berasal dari database kantor; dashboard tidak menampilkan data contoh ketika database masih kosong.

---

## 5. Klien

Halaman **Klien** menampilkan tabel dengan pencarian, filter jenis/status, dan paginasi. Klik **Klien Baru** untuk menambah.

### 5.1 Menambah klien

- **Perorangan**: isi nama lengkap, NIK, jenis kelamin, tempat/tanggal lahir, pekerjaan, alamat, telepon, email, dan status (Aktif/Nonaktif/Daftar Hitam).
- **Badan Hukum**: isi nama perusahaan, bentuk badan, nomor akta pendirian, tanggal, dan data pengurus. Tab **Data Badan Hukum & Legalitas** pada detail klien merangkum legalitas perusahaan.
- Klik **Simpan klien**. Kode klien dibuat otomatis dengan pola `KLN-00001` dan tidak dapat diubah.

### 5.2 Detail klien

Klik baris klien untuk membuka **Identitas Klien** dan tab:

- **Identitas Tambahan** — KTP, NPWP, paspor, KK, dan dokumen identitas lain beserta masa berlaku dan keterkaitan berkas.
- **Transaksi**, **Akta**, **Invoice**, **Dokumen** — riwayat terkait klien.

Tombol **Ubah** membuka form edit. Tombol **Transaksi Baru** langsung membuat transaksi untuk klien tersebut. Ikon **Arsipkan klien** (dengan konfirmasi **Arsipkan klien?**) menandai klien sebagai terhapus lunak; riwayat dan audit tetap tersimpan. Untuk menonaktifkan tanpa mengarsipkan, ubah status menjadi **Nonaktif**.

---

## 6. Transaksi

Halaman **Transaksi** menampilkan kode transaksi (pola `TRX-YYYYMM-0001`), judul, klien, jenis (Notaris/PPAT), dan status workflow.

### 6.1 Membuat transaksi

1. Klik **Transaksi Baru**.
2. Pilih klien, jenis layanan, judul perkara, dan detail yang diminta.
3. Simpan. Status awal adalah **Registrasi Transaksi**.

### 6.2 Tahapan workflow

Transisi hanya boleh mengikuti urutan berikut. Setiap perubahan mencatat pengguna, waktu, status lama, status baru, dan catatan pada riwayat workflow.

| Status | Label layar | Dapat menuju |
|---|---|---|
| `REGISTRASI_KLIEN` | Registrasi Klien | Registrasi Transaksi, Dibatalkan |
| `REGISTRASI_TRANSAKSI` | Registrasi Transaksi | Upload Dokumen, Dibatalkan |
| `UPLOAD_DOKUMEN` | Upload Dokumen | Verifikasi, Dibatalkan |
| `VERIFIKASI` | Verifikasi | Pembuatan Draft, Upload Dokumen, Dibatalkan |
| `DRAFT` | Pembuatan Draft | Review Notaris/PPAT, Dibatalkan |
| `REVIEW` | Review Notaris/PPAT | Approval, Pembuatan Draft, Dibatalkan |
| `APPROVAL` | Approval | Penjadwalan, Pembuatan Draft, Dibatalkan |
| `PENJADWALAN` | Penjadwalan | Penandatanganan, Dibatalkan |
| `PENANDATANGANAN` | Penandatanganan | Pencatatan Akta, Dibatalkan |
| `PENCATATAN_AKTA` | Pencatatan Akta | Pengarsipan, Dibatalkan |
| `PENGARSIPAN` | Pengarsipan | Pembayaran, Dibatalkan |
| `PEMBAYARAN` | Pembayaran | Serah Terima, Dibatalkan |
| `SERAH_TERIMA` | Serah Terima | Selesai, Dibatalkan |
| `SELESAI` | Selesai | — |
| `BATAL` | Dibatalkan | — |

Pada detail transaksi, tombol **Ubah Status** membuka pilihan status yang diizinkan; tombol **Simpan Status** menyimpan perubahan beserta catatan. Dokumen diunggah dari tab dokumen transaksi atau modul **Dokumen**; pihak-pihak dicatat pada bagian **Data transaksi dan pihak-pihak yang terlibat**.

Transaksi tidak dihapus permanen dari daftar operasional; penghapusan bersifat lunak (data ditandai terhapus) dan pembatalan alur dilakukan dengan status **Dibatalkan** agar jejak tetap ada. Keduanya tercatat di audit log.

---

## 7. Akta Notaris

Halaman **Akta Notaris** memuat daftar akta dengan nomor, jenis, klien, tanggal, dan status. Tombol **Akta Baru** membuka form pembuatan.

### 7.1 Membuat dan mengubah draft

1. Klik **Akta Baru**.
2. Pilih klien/transaksi, jenis akta, notaris, tanggal, judul, dan isi akta (komparisi, premis, isi, penutup).
3. Tambahkan pihak melalui **Tambah pihak** dengan peran dari daftar: Penghadap, Penjual, Pembeli, Pemberi Hak, Penerima Hak, Saksi, Kuasa, Lainnya.
4. Klik **Simpan**. Status awal **Draft**.

Isi akta dapat diubah selama status masih **Draft**, **Review**, atau **Disetujui**. Setelah status menjadi **Ditandatangani**, **Tercatat**, atau **Diarsipkan**, isi akta **terkunci** dan layar menampilkan **Isi akta terkunci**. Perubahan setelah tahap itu tidak dimungkinkan melalui aplikasi.

### 7.2 Status akta

| Status | Label | Dapat menuju |
|---|---|---|
| `DRAFT` | Draft | Review, Dibatalkan |
| `REVIEW` | Review | Disetujui, Draft, Dibatalkan |
| `APPROVED` | Disetujui | Ditandatangani, Dibatalkan |
| `SIGNED` | Ditandatangani | Tercatat |
| `REGISTERED` | Tercatat | Diarsipkan |
| `ARCHIVED` | Diarsipkan | — |
| `CANCELLED` | Dibatalkan | — |

Gunakan **Ubah Status** lalu **Simpan Status**. Perubahan status tercatat pada audit log.

### 7.3 Draft, minuta, dan revisi

- **Draft DOCX** dibuat dari template di **Pengaturan → Template**. Tombol **Buat Draft** menghasilkan dokumen draft yang dapat dipratinjau dan diunduh. Pratinjau menampilkan **Belum ada pratinjau** bila dokumen belum dibuat.
- **Minuta** dibuat melalui tombol **Buat Minuta** setelah akta disetujui/ditandatangani sesuai alur kantor. Minuta tersimpan sebagai dokumen `MINUTA`.
- Setiap penyimpanan isi akta membuat **revisi** berisi isi sebelum perubahan. Tab revisi menampilkan daftar versi dan tombol **Lihat Snapshot** untuk membaca isi versi lama. Riwayat revisi bersifat append-only.
- Generator DOCX memakai placeholder template (lihat `docs/TEMPLATE-DOCX.md`). Dokumen hasil generasi **bukan akta autentik** sampai ditandatangani dan dicatat sesuai prosedur kenotariatan.

### 7.4 Repertorium otomatis

Saat status akta diubah menjadi **Tercatat**, aplikasi otomatis membuat entri **Repertorium** dengan nomor urut tahun berjalan (pola `001/2026`). Bila pembuatan otomatis gagal, detail akta menampilkan pesan kesalahan dan pencatatan dapat dilakukan manual di modul **Repertorium** melalui **Catat Repertorium Manual** — pencatatan manual tetap tercatat di audit.

---

## 8. Akta & Layanan PPAT

Halaman **Akta & Layanan PPAT** memuat transaksi pertanahan: AJB, APHT, SKMHT, hibah, APHB, tukar menukar, dan layanan lain. Tombol **Transaksi PPAT Baru** membuka form yang mencakup:

- data transaksi dan para pihak,
- **objek tanah**: jenis hak (Hak Milik, HGB, HGU, Hak Pakai, Hak Pengelolaan, Hak Adat, Lainnya), nomor sertifikat, luas, lokasi, dan NIB,
- nilai transaksi.

Objek tanah dapat ditambah/dihapus pada form; penghapusan meminta konfirmasi **Hapus objek tanah?**. Sertifikat yang tercatat muncul di laporan **Daftar Sertifikat**.

---

## 9. Dokumen

Halaman **Dokumen** menyimpan berkas terpusat. Format yang didukung: PDF, DOCX, XLSX, JPG, PNG. Ukuran maksimum per berkas 50 MB.

1. Klik **Unggah Dokumen**.
2. Isi judul, pilih kategori (KTP, NPWP, Paspor, Kartu Keluarga, Sertifikat Tanah, Buku Nikah, Akta Pendirian, Legalitas Perusahaan, Draft Akta, Minuta, Salinan, Bukti Pembayaran, Invoice, Lainnya), lalu kaitkan dengan klien, transaksi, dan/atau akta.
3. Klik **Pilih Berkas…**, pilih berkas, lalu simpan.

Tombol **Pratinjau** menampilkan PDF hingga 12 MB dan gambar sebagai thumbnail (lebar maksimum 1.024 px, sumber hingga 40 MB). DOCX/XLSX dan berkas yang melebihi batas tidak ditampilkan di jendela pratinjau; gunakan **Buka Aplikasi** atau **Unduh** pada jendela yang sama. Bila berkas hilang dari penyimpanan, jendela pratinjau menyebutkan hal itu dan menyarankan memulihkan dari backup atau mengunggah ulang. Thumbnail disimpan sementara di folder cache aplikasi dan dibersihkan otomatis (batas 64 MB, umur 30 hari).

Setiap berkas mendapat ID unik dan checksum. Membuka dokumen memakai penampil bawaan atau aplikasi eksternal. Unggahan ulang untuk dokumen yang sama membuat **versi** baru; tab versi menampilkan riwayat. Tombol **Hapus dokumen?** meminta konfirmasi dan menghapus metadata serta berkas sesuai kebijakan; tindakan tercatat di audit.

---

## 10. Repertorium

Halaman **Repertorium Akta** menampilkan nomor urut pencatatan per tahun, tanggal, nomor akta, jenis, dan nama klien.

- Nomor dibuat otomatis dari urutan tahunan (`{SEQ:3}/{YYYY}`).
- **Catat Repertorium Manual** dipakai hanya bila pencatatan otomatis tidak terjadi; isian wajib diisi dan alasan dicatat.
- Entri repertorium **tidak dapat diubah atau dihapus** setelah dibuat (dijaga trigger database). Koreksi dilakukan dengan catatan baru yang tercatat, bukan dengan menyunting riwayat.

---

## 11. Protokol Notaris

Halaman **Protokol Notaris** mendata penyimpanan minuta, salinan, dan arsip.

1. Klik **Catat Protokol Notaris**.
2. Pilih akta, jenis protokol (minuta/salinan/arsip), nomor, tanggal, dan lokasi penyimpanan (lemari/rak/boks).
3. Simpan. Nomor protokol memakai pola tahunan `{SEQ:3}/{YYYY}`.

Catatan protokol bersifat append-only. Bila akta sudah memiliki catatan protokol, detail akta menampilkan tautan untuk melihatnya.

---

## 12. Keuangan

Halaman **Keuangan** memiliki tab **Invoice**, **Pembayaran**, **Pengeluaran**, dan **Piutang**, serta ringkasan pemasukan, pengeluaran, dan laba.

### 12.1 Invoice

1. Klik **Buat Invoice** (dari tab Invoice atau detail transaksi/klien).
2. Pilih klien dan transaksi (opsional), lalu tambahkan baris jasa: **Jasa Notaris**, **Jasa PPAT**, **Biaya Administrasi**, **Pajak Terkait Transaksi**, atau **Lainnya**.
3. Isi jumlah, harga satuan, dan diskon bila ada. Pajak dihitung dari **Persentase Pajak Bawaan Invoice** di Pengaturan; dapat disesuaikan per invoice.
4. Klik **Buat Invoice**. Nomor dibuat otomatis (`INV/2026/0001`). Status awal **Belum Dibayar** setelah diterbitkan; simpan sebagai **Draft** bila masih konsep.
5. Detail invoice menyediakan **Unduh PDF**, **Catat Pembayaran**, dan **Batalkan Invoice** (hanya bila belum ada pembayaran; status menjadi **Dibatalkan** dan nomor tidak dipakai ulang).

Status invoice: **Draft**, **Belum Dibayar**, **Dibayar Sebagian**, **Lunas**, **Dibatalkan**.

### 12.2 Pembayaran

Klik **Catat Pembayaran** pada invoice atau tab **Pembayaran**. Isi tanggal, jumlah, metode (**Tunai**, **Transfer Bank**, **QRIS**, **Cek/Bilyet Giro**, **Lainnya**), nomor referensi, dan catatan. Nomor kuitansi dibuat otomatis (`KW/2026/0001`). Pembayaran sebagian mengubah status invoice menjadi **Dibayar Sebagian**; pembayaran penuh menjadi **Lunas**. Kelebihan bayar ditolak validasi.

### 12.3 Pengeluaran

Pada tab **Pengeluaran**, catat beban kantor: kategori **Operasional**, **Gaji & Honor**, **Sewa**, **Listrik, Air, Internet**, **Perlengkapan**, **Perpajakan**, atau **Lainnya**. Nomor pengeluaran memakai pola `EXP/2026MM/0001`. Pengeluaran dapat dihapus dengan konfirmasi **Hapus Pengeluaran**; tindakan tercatat di audit.

### 12.4 Piutang

Tab **Piutang** menampilkan invoice yang belum lunas beserta sisa tagihan dan umur piutang. Gunakan filter status/tanggal untuk menindaklanjuti penagihan.

---

## 13. Kalender & Agenda

Halaman **Kalender & Agenda** memiliki tab:

- **Jadwal** — konsultasi, verifikasi dokumen, penandatanganan, dan agenda lain. Klik **Jadwal Baru**; isi jenis, waktu, klien/transaksi, dan catatan. Status: **Terjadwal**, **Selesai**, **Dibatalkan**.
- **Tugas** — tugas staf dengan prioritas, penanggung jawab, dan jatuh tempo. Klik **Tugas Baru**.
- **Tenggat Hukum** — jatuh tempo SKMHT, pendaftaran, perpanjangan, pembayaran. Klik **Tenggat Baru**. Status: **Aktif**, **Selesai**, **Terlambat**, **Dibatalkan**.

Agenda dapat diubah atau dihapus dengan konfirmasi **Hapus data agenda?**.

---

## 14. Integrasi Pemerintah

Menu **Integrasi Pemerintah** (butuh izin `government.view`) mencatat pengajuan ke **AHU Online** (`https://layanan.ahu.go.id/`) dan **Aplikasi Mitra ATR/BPN** (`https://mitra.atrbpn.go.id/`).

**Yang dikerjakan modul ini, dan yang tidak.** Aplikasi menyiapkan data, menyimpan berkas, membuka portal resmi di browser, lalu Anda catat kembali nomor, status, dan bukti yang tampil di portal. Aplikasi **tidak** mengisi formulir portal, **tidak** membaca isi halaman portal, **tidak** melakukan scraping, **tidak** melewati login atau CAPTCHA, dan **tidak** mengunggah apa pun ke instansi. Tidak ada API resmi AHU/ATR/BPN yang diaktifkan karena belum ada dokumentasi maupun otorisasi tertulis dari penyelenggara. Status **Selesai** berarti berkas bukti Anda lengkap di aplikasi, bukan bahwa instansi menyetujui permohonan.

### 14.1 Delapan tab

| Tab | Isi |
|---|---|
| **Dashboard Integrasi** | Kartu **Total pengajuan**, **Butuh tindakan manual**, **Berjalan di portal**, **Selesai / ditolak**; daftar **Pengajuan terbaru** (klik baris membuka kartu), **Ringkasan per status**, dan keterangan kapabilitas |
| **Pengajuan AHU** | Pengajuan AHU kelompok **Persiapan** (Draft, Siap Diajukan) dan tombol **Buat Pengajuan** |
| **Monitoring AHU** | Pengajuan AHU yang **Berjalan di portal** (Menunggu Portal, Diajukan, Diproses). Hanya untuk memantau dan mencatat hasil; tidak ada tombol pembuatan |
| **Pengajuan BPN** | sama, untuk layanan ATR/BPN |
| **Monitoring BPN** | sama |
| **Dokumen Pemerintah** | Semua berkas pengajuan beserta checksum SHA-256, pratinjau, unduh, dan pengeluaran berkas dari daftar |
| **Riwayat Sinkronisasi** | Log setiap tindakan gateway; baris **Menunggu tindakan manual** berarti langkah berikutnya ada di portal, bukan di aplikasi |
| **Konfigurasi Integrasi** | Muncul hanya bila Anda punya izin `government.configure`: mode per instansi, status ketersediaan API resmi, catatan, dan kredensial |

### 14.2 Membuat pengajuan

1. Buka tab **Pengajuan AHU** atau **Pengajuan BPN**, klik **Buat Pengajuan**.
2. Pilih **Layanan**, isi **Perihal pengajuan**, kaitkan **Klien** dan **Transaksi** bila perlu, tambah **Uraian**, lalu klik **Simpan Draft**. Nomor `GOV/tahun/urutan` dibuat otomatis dan terkunci.
3. Pada kartu pengajuan klik **Ubah data persiapan** untuk mengisi isian layanan (nama badan hukum, nomor akta, kedudukan, modal dasar, nomor sertifikat, dan sebagainya sesuai instansi).
4. Klik **Tambah Berkas** → **Pilih Berkas…** → **Unggah Berkas**. Format diterima: PDF, DOCX, XLSX, JPG, PNG; maksimal 50 MB. Setiap berkas dihitung SHA-256 dan tercatat di log.
5. Klik **Ekspor Lembar Persiapan** untuk memperoleh PDF berisi daftar periksa dan data, dipakai saat mengisi formulir di portal.

### 14.3 Status dan syarat buktinya

Perpindahan status hanya lewat tombol pada kartu pengajuan. Tombol baru aktif bila seluruh syarat bukti terpenuhi; syarat yang kurang tertulis persis di bawah tombol.

| Status | Syarat sebelum dapat dicatat |
|---|---|
| **Draft** | — |
| **Siap Diajukan** | minimal dua data isian + satu dokumen pendukung atau bukti |
| **Menunggu Portal** | — |
| **Diajukan** | nomor resmi dicatat + satu berkas **Bukti Pengajuan** |
| **Diproses** | nomor resmi dicatat |
| **Selesai** | nomor resmi + status resmi diisi + satu berkas **Hasil Layanan** |
| **Ditolak** | nomor resmi + status resmi penolakan |
| **Dibatalkan** | — (pengganti penghapusan; selalu isi alasan) |

Status resmi instansi dicatat terpisah melalui **Catat status resmi**, dan nomor melalui **Catat nomor resmi** atau **Tambah Referensi**. Karena kedua kolom itu terpisah, pengajuan yang di aplikasi berstatus **Diproses** bisa saja sudah ditolak di portal — dan sebaliknya aplikasi tidak pernah menyatakan permohonan Anda disetujui tanpa bukti hasil.

### 14.4 Berkas, riwayat, dan penguncian

- Berkas disimpan di folder data pengguna (`documents/government/<id>`), bukan di folder instalasi.
- **Keluarkan berkas dari daftar** hanya menandai berkas tidak aktif; berkas fisik, checksum, dan jejak audit tetap ada.
- Riwayat status, nomor/referensi resmi, dan log sinkronisasi bersifat append-only. Percobaan mengubah atau menghapusnya melalui basis data langsung pun ditolak trigger.
- Pengajuan **Selesai**, **Ditolak**, atau **Dibatalkan** terkunci: lencana **Terkunci** tampil, seluruh tombol perubahan hilang, dan perubahan dari mana pun ditolak.
- Pembatalan memakai status **Dibatalkan** beserta alasan; pengajuan tidak dapat dihapus. Nomornya tidak dipakai ulang.

### 14.5 Saat perangkat luring

Tombol portal tetap menampilkan alamat resmi, tetapi aplikasi mencatat log bahwa perangkat sedang luring dan seluruh persiapan tetap tersimpan di komputer Anda. Log itu tetap berstatus **Menunggu tindakan manual** sampai Anda mencatat nomor, status, atau bukti dari portal.

### 14.6 Kredensial portal

Pada tab **Konfigurasi Integrasi**, tombol **Simpan Kredensial** menyimpan kata sandi portal agar tidak tercatat di buku atau berkas. Nilainya dienkripsi penyimpanan terenkripsi Windows (DPAPI) dan hanya boleh tersimpan sebagai teks tersandi berawalan `dpapi:`. Aplikasi tidak pernah menampilkannya kembali: **Uji pembacaan** hanya melaporkan jumlah karakter hasil dekripsi, dan daftar kredensial tidak memuat isi rahasianya. Menyimpan kredensial **tidak** mengaktifkan login otomatis dan tidak membuat aplikasi membaca portal. Sakelar **Aktifkan pengiriman API otomatis** sengaja terkunci dengan keterangan di layar; ia baru bisa diaktifkan bila dokumentasi API resmi tersedia dan pengujian dengan akses resmi lulus. Pada perangkat tanpa penyimpanan terenkripsi, aplikasi menolak menyimpan kredensial sama sekali daripada menulisnya sebagai teks terbuka.

---

## 15. Laporan

Halaman **Laporan** memuat sebelas laporan:

1. **Daftar Klien**
2. **Daftar Akta**
3. **Repertorium Akta**
4. **Protokol Notaris**
5. **Transaksi PPAT**
6. **Daftar Sertifikat**
7. **Laporan Keuangan (Invoice)**
8. **Laporan Pembayaran**
9. **Laporan Piutang**
10. **Aktivitas Karyawan**
11. **Audit Log**

Pilih laporan, atur periode (**Dari tanggal** / **Sampai tanggal**) dan filter yang tersedia, lalu klik **Tampilkan**. Tombol **Ekspor PDF** dan **Ekspor Excel** mengunduh berkas ke folder ekspor. Laporan bertanda tangan (Repertorium dan Protokol) menyertakan blok tanda tangan notaris pada PDF.

**Batas jumlah baris.** Laporan dengan lebih dari 20.000 baris tidak dibangkitkan: aplikasi menolak dengan pesan `Laporan "..." memuat lebih dari 20.000 baris. Persempit periode (tahun atau tanggal) atau filter status, lalu cetak bertahap.` Penolakan berlaku sama untuk **Tampilkan**, **Ekspor PDF**, dan **Ekspor Excel** — tidak pernah ada berkas yang tampak lengkap padahal isinya terpotong. Khusus laporan **Audit Log**, yang ditampilkan maksimal 5.000 baris terakhir; bila lebih, hasil diberi badge **Dipotong** dan peringatan `Perhatian: laporan ini dipotong pada 5.000 baris dari X baris yang ada. Persempit periode atau filter untuk mencetak seluruh baris.` yang juga dicetak ke PDF dan Excel.

Laporan dibangun dari data nyata di database; laporan kosong menampilkan **Belum ada data** dan tetap dapat diekspor sebagai tabel kosong.

---

## 16. Karyawan & Role

Halaman **Karyawan & Role** memiliki tab **Karyawan** dan **Role & Hak Akses**.

- **Tambah Karyawan** — isi nama, username, email, role, dan password awal. Password awal wajib diganti pengguna saat login pertama (aplikasi menampilkan pemberitahuan).
- Nonaktifkan akun untuk mencabut akses tanpa menghapus jejak audit.
- Tab **Role & Hak Akses** menampilkan matriks izin per role. Role bawaan tidak dapat dihapus; izinnya dapat disesuaikan bila Anda memiliki `users.manage`. Klik **Simpan Hak Akses**.

### 16.1 Role bawaan

| Role | Cakupan utama |
|---|---|
| **Administrator** | Seluruh modul dan konfigurasi |
| **Notaris** | Klien, transaksi, akta notaris (termasuk review/approval), protokol, laporan, audit |
| **PPAT** | Klien, transaksi, akta PPAT, protokol, laporan |
| **Kepala Staf** | Operasional harian, klien, transaksi, akta, PPAT, keuangan (lihat), audit |
| **Staff Notaris** | Klien, transaksi, draft akta notaris, dokumen, kalender |
| **Staff PPAT** | Klien, transaksi, layanan PPAT, dokumen, kalender |
| **Finance** | Invoice, pembayaran, pengeluaran, laporan keuangan |
| **Receptionist** | Pendaftaran klien, jadwal, informasi transaksi |

Hak akses berlaku pada menu dan pada setiap pemanggilan API; menyembunyikan menu saja tidak dijadikan pengaman.

---

## 17. Audit Log

Halaman **Audit Log** menampilkan waktu, pengguna, aksi, entitas, ID entitas, dan hash. Setiap entri dirantai dengan hash SHA-256 dari entri sebelumnya.

- Gunakan pencarian dan filter untuk menelusuri aktivitas.
- Klik entri untuk membuka **Detail Audit** (nilai sebelum/sesudah bila ada).
- Verifikasi rantai dilakukan dari API audit; bila rantai terputus, aplikasi melaporkan entri pertama yang tidak valid. Audit log tidak dapat disunting atau dihapus dari aplikasi.

---

## 18. Backup & Restore

Halaman **Backup & Restore** memiliki tab **Berkas Backup** dan **Riwayat**.

### 18.1 Membuat backup

1. Klik **Buat Backup**.
2. Pilih apakah dokumen ikut disertakan. **Passphrase Backup** bersifat opsional: kosongkan untuk memakai kunci vault yang sedang terbuka, atau isi minimal 8 karakter bila backup harus dapat dibuka tanpa vault. Jika memakai passphrase, simpan passphrase tersebut — aplikasi tidak dapat memulihkannya.
3. Simpan. Aplikasi mengambil salinan database yang konsisten lewat SQLite Online Backup API (bukan menyalin berkas saat basis data masih dipakai), memeriksanya dengan `PRAGMA integrity_check`, lalu menulis wadah terenkripsi sementara. Sebelum backup diberi nama final, wadah itu dibaca ulang dan divalidasi: dekripsi, `PRAGMA integrity_check`, dan pencocokan SHA-256 database. Bila salah satu gagal, berkas sementara dibuang, kesalahan ditampilkan, dan backup lama tidak pernah dihapus.
4. Jenis backup: **Manual**, **Otomatis** (harian sesuai Pengaturan), dan **Pra-migrasi** (dibuat sebelum migrasi database).

Backup dienkripsi AES-256-GCM per isi berkas, dan isi berkas ditekan (gzip) sehingga arsip jauh lebih kecil daripada ukuran database asli. Tanpa passphrase atau kunci vault, berkas tidak dapat dibuka. Di bawah daftar berkas, layar menampilkan `Folder: <lokasi> — ruang kosong <ukuran>`. Bila folder backup berada di volume yang sama dengan data aplikasi, kotak **Kebijakan pemulihan** menampilkan pengingat: *Berkas backup berada di volume yang sama dengan data aplikasi. Salin minimal satu backup ke volume atau media lain secara berkala; kerusakan satu disk akan menghapus data dan backupnya bersamaan.*

### 18.2 Memvalidasi dan memulihkan

- Klik ikon **Validasi backup** pada baris berkas, lalu **Validasi** di dialog. Pemeriksaan membaca header, dekripsi dengan kunci vault (atau **Passphrase** yang Anda isi), memverifikasi SHA-256 database, dan menjalankan `PRAGMA integrity_check` tanpa mengubah apa pun. Hasil validasi menampilkan waktu pembuatan, versi aplikasi, versi skema, status penyertaan dokumen, jumlah tabel, dan pangkal checksum database.
- Backup format lama (`NPBACKUP1`) tetap dapat divalidasi dan dipulihkan; backup baru selalu memakai format `NPBACKUP2`.
- Backup yang penulisannya terputus (misalnya listrik padam) dikenali dari hilangnya penanda akhir dan ditolak dengan pesan `Cadangan tidak lengkap: penanda akhir tidak ditemukan (penulisan terputus).`
- Klik ikon **Pulihkan dari backup**. Aplikasi **wajib** membuat backup pra-restore terenkripsi terlebih dahulu; bila pembuatan gagal, restore dibatalkan. Ketik `PULIHKAN` pada isian **Konfirmasi** untuk mengaktifkan tombol.
- Setelah restore, semua sesi pengguna diakhiri dan Anda harus membuka vault serta masuk kembali.
- Restore mengganti database dan menggabungkan dokumen/template dari backup. Data yang dibuat setelah backup akan hilang — pastikan Anda memilih berkas yang benar. Berkas hasil ekstraksi yang gagal di tengah jalan ikut dibersihkan, tidak ada database setengah jadi yang tertinggal.
- Ikon **Salin checksum SHA-256** menyalin checksum berkas ke papan klip (dihitung stream, tanpa memuat seluruh berkas ke memori); **Hapus backup** menghapus berkas dengan konfirmasi dan dicatat di audit.

### 18.3 Retensi

Jumlah backup otomatis yang disimpan diatur oleh **Jumlah Backup Otomatis Disimpan** di **Pengaturan → Sistem**. Yang dihapus otomatis hanya berkas `-auto`, dan selalu tersisa minimal satu berkas; penghapusan baru dilakukan setelah backup otomatis yang baru terbukti sah. Backup manual dan pra-migrasi tidak dihapus otomatis. Berkas dapat dihapus manual melalui **Hapus backup** dengan konfirmasi.

### 18.4 Peringatan lokasi

Bila folder backup berada di volume berbeda dari data aplikasi, atau ruang kosongnya tinggal di bawah 2 GB, halaman ini menampilkan kotak **Lokasi backup perlu perhatian** berisi daftar penyebabnya (misalnya `Ruang kosong folder backup tinggal 812 MB. Cadangan berikutnya dapat gagal.`). Pembuatan backup juga menolak berjalan lebih awal jika ruang yang tersisa tidak cukup, dengan pesan `Ruang tersisa di <folder> hanya N MB, padahal cadangan memerlukan sekitar M MB. Kosongkan disk atau arahkan folder backup ke media lain.`

---

## 19. Performa Sistem

Halaman **Performa** (izin `settings.manage`) membantu memeriksa kesehatan basis data tanpa membuka berkas secara manual:

| Bagian | Isi |
|---|---|
| Kartu ringkas | Ukuran basis data + WAL/SHM, jumlah halaman dan halaman bebas, latensi API p50/p95 sesi ini, jumlah permintaan di atas 250 ms |
| **Basis Data** | Mode jurnal (`WAL`), sinkronisasi (`FULL`), cache, mmap, auto vacuum, jumlah tabel/indeks/trigger, jumlah migrasi, status `ANALYZE`, daftar indeks FTS5 |
| **Ukuran Objek** | Tombol **Hitung Ukuran** menampilkan tabel/indeks terbesar dari `dbstat`; pada basis data besar perhitungan ini memakan waktu dan dijalankan hanya saat diminta |
| **Latensi per Rute API** | Jumlah panggilan, p50, p95, maksimum, dan jumlah permintaan lambat untuk tiap rute pada 500 panggilan terakhir |
| **Permintaan Terlambat** | Delapan panggilan paling lama beserta statusnya |
| **Log Performa** | Lokasi dan ukuran `performance.log`, batas rotasi 2 MB |

**Batas privasi:** log performa hanya mencatat nama rute, durasi, status, kode hasil, dan waktu. Payload permintaan, NIK/NPWP, isi akta, nama pengguna, dan kata sandi tidak pernah ditulis. Angka latensi berasal dari sesi aplikasi yang sedang berjalan; angka tersebut bukan klaim target performa—target diukur terpisah di perangkat uji (lihat `docs/PERFORMA.md`).

---

## 20. Pengaturan

Halaman **Pengaturan** memiliki tab:

| Tab | Isi |
|---|---|
| **Kantor** | Nama Kantor, Nama Notaris Penanggung Jawab, Alamat Kantor, Kota Kedudukan, Telepon Kantor, Email Kantor |
| **Sistem** | Zona Waktu, Format Tanggal, Batas Idle Sesi (menit), Backup Otomatis Harian, Backup Sebelum Migrasi, Jumlah Backup Otomatis Disimpan |
| **Keuangan** | Persentase Pajak Bawaan Invoice, Jatuh Tempo Invoice (hari) |
| **Keamanan** | Percobaan Login Sebelum Jeda, Panjang Minimal Password |
| **Penomoran** | Pola nomor klien, transaksi, akta, repertorium, protokol, invoice, pembayaran, pengeluaran; pratinjau nomor berikutnya |
| **Template** | Unggah/hapus template DOCX kategori Akta Notaris, Akta PPAT, dan Invoice |
| **Vault** | **Buat Kode Pemulihan Baru**, ubah master password, **Kunci Vault** |

Perubahan pengaturan disimpan dengan tombol **Simpan** pada masing-masing bagian dan tercatat di audit. Nilai numerik divalidasi pada rentang yang ditampilkan.

Catatan jujur: kategori template **Invoice** disediakan sebagai cadangan; PDF invoice saat ini memakai tata letak bawaan aplikasi, bukan template DOCX.

---

## 21. Aturan integritas yang perlu dipahami

- **Akta yang sudah ditandatangani tidak dapat diubah isinya.** Status **Ditandatangani**, **Tercatat**, dan **Diarsipkan** mengunci konten.
- **Repertorium, protokol, revisi akta, riwayat workflow, dan audit log bersifat append-only.** Trigger database menolak UPDATE/DELETE.
- **Akta tidak dapat dihapus.** Pembatalan dilakukan melalui status **Dibatalkan**.
- **Nomor tidak dipakai ulang.** Invoice yang dibatalkan tetap mempertahankan nomornya.
- **Draft bukan akta autentik.** Aplikasi tidak pernah menandai draft sebagai akta sah secara otomatis. Penandatanganan dan pencatatan adalah tindakan pengguna yang tercatat.
- **Tidak ada pertukaran data otomatis dengan instansi.** Modul **Integrasi Pemerintah** hanya mencatat: portal dibuka lewat tautan resmi oleh Anda, dan nomor/status/bukti Anda ketik kembali. Tidak ada API resmi AHU/ATR/BPN yang diaktifkan, tidak ada scraping, dan tidak ada pengiriman berkas ke portal dari aplikasi.
- **Pengajuan pemerintah yang sudah final terkunci.** Riwayat status, referensi resmi, dan log gateway bersifat append-only; berkas hanya dapat dikeluarkan dari daftar, dan pengajuan dibatalkan dengan alasan, bukan dihapus.
- **Kata sandi portal tidak pernah teks terbuka.** Kredensial disimpan terenkripsi (DPAPI) dengan awalan `dpapi:`; bila penyimpanan terenkripsi tidak tersedia, aplikasi menolak menyimpannya.

---

## 22. Format tampilan

- Mata uang: Rupiah tanpa desimal (contoh `Rp1.110.000`).
- Tanggal: `DD-MM-YYYY`; waktu memakai zona **Asia/Jakarta**.
- Angka urut: minimal sesuai lebar pola (contoh `00001`, `001/2026`).
- Tema terang/gelap tersimpan per perangkat.

---

## 23. Pemecahan masalah singkat

| Gejala | Tindakan |
|---|---|
| Lupa master password | Gunakan tab **Recovery Code** pada layar **Database Terkunci**. Bila keduanya hilang, data tidak dapat dipulihkan — inilah alasan backup terenkripsi wajib disimpan. |
| Vault tidak terbuka setelah crash | Baca peringatan **Pemulihan pasca-crash**; buka vault untuk memvalidasi salinan. |
| Backup gagal divalidasi | Pastikan passphrase benar dan berkas tidak berubah. Coba berkas backup lain; jangan menghapus berkas asli sebelum ada salinan valid. |
| Restore tidak berjalan | Restore membatalkan diri bila backup pra-restore gagal dibuat. Pastikan folder backup dapat ditulis dan ruang disk cukup. |
| Menu tidak terlihat | Role Anda tidak memiliki izin modul tersebut. Hubungi Administrator melalui **Karyawan & Role**. |
| Sesi berakhir saat bekerja | Sesi mengikuti **Batas Idle Sesi**. Masuk kembali; pekerjaan yang sudah disimpan tidak hilang. |
| Aplikasi menolak nomor invoice/akta | Nomor dibuat otomatis; jangan mengisi manual. Periksa pola di **Pengaturan → Penomoran**. |

---

## 24. Berkas dan lokasi data

Semua data disimpan di folder aplikasi milik pengguna (bukan folder instalasi):

- Database SQLite (saat terbuka) dan vault terenkripsi
- `documents/` — berkas klien, akta, dan transaksi
- `templates/` — template DOCX
- `backups/` — berkas `.npbackup`
- `exports/` — hasil ekspor PDF/Excel
- `logs/` — log aplikasi dan `performance.log` (rute, durasi, status; tanpa NIK, isi akta, atau kata sandi)
- `cache/thumbnails/` — thumbnail pratinjau yang dapat dibersihkan otomatis (64 MB / 30 hari)

Lokasi persis per sistem operasi dijelaskan di `docs/INSTALL.md`. Jangan menyalin database dalam keadaan terbuka; gunakan fitur **Backup** agar salinan konsisten dan terenkripsi.
