# Template DOCX — NOTARIS PRO

Aplikasi menghasilkan dokumen akta dalam format DOCX menggunakan **Docxtemplater**. Template dapat diganti melalui **Pengaturan → Template** tanpa membangun ulang aplikasi. Dokumen yang dihasilkan adalah **draft/minuta administratif**, bukan akta autentik.

---

## 1. Di mana template disimpan

| Lokasi | Fungsi |
|---|---|
| `<data>/templates/notary/` | Template akta notaris unggahan pengguna |
| `<data>/templates/ppat/` | Template akta PPAT unggahan pengguna |
| `<data>/templates/invoices/` | Template invoice (cadangan) |
| `resources/templates/` | Template bawaan saat aplikasi dipaketkan |

Urutan pencarian saat membuat dokumen:

1. `templates/<kategori>/<berkas>` di folder data pengguna;
2. template bawaan di `resources/templates/<kategori>/<berkas>`.

Setiap jenis akta memiliki `templatePath` bawaan:

- Seluruh jenis akta **Notaris** → `notary/akta-umum.docx`
- Seluruh jenis akta **PPAT** → `ppat/akta-ppat.docx`

Mengunggah berkas dengan nama yang sama di kategori terkait akan menimpa template yang dipakai (berkas lama disalin menjadi `<nama>.<timestamp>.bak.docx`).

Template bawaan dibuat oleh `scripts/make-templates.mjs` (perintah `npm run templates`).

---

## 2. Placeholder yang tersedia

Placeholder ditulis dengan kurung kurawal: `{nama_placeholder}`. Nama harus sama persis (huruf kecil, garis bawah).

### 2.1 Data akta

| Placeholder | Isi |
|---|---|
| `{nomor_akta}` | Nomor akta, mis. `001/11/2026` |
| `{tanggal_akta}` | Tanggal akta format panjang Indonesia |
| `{judul}` | Judul akta (atau nama jenis akta bila kosong) |
| `{jenis_akta}` | Nama jenis akta, mis. `Akta Pendirian Perseroan Terbatas` |
| `{status_akta}` | Label status saat dokumen dibuat: `Draft`, `Review`, `Disetujui`, `Ditandatangani`, `Tercatat`, `Diarsipkan`, `Dibatalkan` |
| `{tanggal_cetak}` | Tanggal pembuatan dokumen |

### 2.2 Klien dan para pihak

| Placeholder | Isi |
|---|---|
| `{klien}` | Nama lengkap klien |
| `{kode_klien}` | Kode klien, mis. `KLN-00001` |
| `{penghadap}` | Teks penghadap yang diisi pada akta |
| `{pihak}` | Daftar pihak sebagai teks, satu baris per pihak: `PERAN: Nama` |
| `{pihak_list}` | Perulangan pihak (lihat 2.4) |
| `{saksi}` | Nama saksi digabung koma |
| `{saksi_list}` | Perulangan saksi (lihat 2.4) |

### 2.3 Isi akta dan kantor

| Placeholder | Isi |
|---|---|
| `{komparisi}` | Paragraf komparisi |
| `{premis}` | Paragraf premis |
| `{isi}` | Isi akta |
| `{penutup}` | Paragraf penutup |
| `{notaris}` | `office.notaryName` dari Pengaturan; bila kosong memakai nama notaris pada akta |
| `{kantor}` | `office.name` |
| `{kota}` | `office.city` |
| `{alamat_kantor}` | `office.address` |

### 2.4 Perulangan (loop)

Docxtemplater memakai pasangan `{#tag}...{/tag}`:

**Pihak:**

```
{#pihak_list}{role} — {nama} (NIK: {nik}) — {alamat}{/pihak_list}
```

Setiap item berisi: `role`, `nama`, `nik`, `alamat`. Nilai kosong menjadi string kosong.

**Saksi:**

```
{#saksi_list}- {nama}{/saksi_list}
```

Setiap item berisi `nama`.

Loop harus berada dalam satu paragraf yang sama seperti contoh, atau dipisah per baris dengan pasangan buka/tutup yang jelas. Jangan menaruh `{#pihak_list}` dan `{/pihak_list}` di paragraf berbeda tanpa memahami perilaku `paragraphLoop`.

### 2.5 Placeholder invoice (template cadangan)

Template `templates/invoices/invoice.docx` disediakan sebagai cadangan. PDF invoice saat ini **tidak** memakai template ini; PDF dibuat dari tata letak bawaan aplikasi. Placeholder yang tercantum di template cadangan:

`{kantor}`, `{alamat_kantor}`, `{kota}`, `{nomor_invoice}`, `{tanggal_invoice}`, `{klien}`, `{jatuh_tempo}`, `{item_list}` (loop: `{deskripsi}`, `{jumlah}`, `{harga}`, `{total}`), `{subtotal}`, `{diskon}`, `{pajak}`, `{total}`, `{catatan}`, `{notaris}`.

---

## 3. Membuat dokumen dari template

1. Buka detail akta yang sudah memiliki jenis akta dan isi.
2. Klik **Buat Draft** (atau **Buat Minuta** setelah tahap yang sesuai).
3. Aplikasi mengisi template, menyimpan DOCX sebagai dokumen kategori **Draft Akta** atau **Minuta**, dan menautkannya ke akta.
4. Nama berkas: `Draft-<nomor akta>.docx` atau `Minuta-<nomor akta>.docx`. Nomor akta disanitasi untuk nama berkas.
5. Unduh/pratinjau melalui daftar dokumen akta.

Setiap pembuatan ulang menambah versi dokumen; versi lama tetap tersimpan.

Kesalahan umum saat render:

| Pesan | Penyebab |
|---|---|
| `Template "..." tidak ditemukan` | Nama berkas template tidak ada di folder pengguna maupun bawaan |
| `Gagal mengisi template DOCX: ...` | Placeholder tidak seimbang, loop rusak, atau tag tidak dikenal |
| `Kategori dokumen draft/minuta belum tersedia` | Seed kategori belum berjalan; jalankan ulang aplikasi/migrasi |

---

## 4. Mengunggah template

1. Buka **Pengaturan → Template** (memerlukan izin `templates.manage`).
2. Pilih kategori: **Akta Notaris**, **Akta PPAT**, atau **Invoice**.
3. Klik tombol unggah, pilih berkas `.docx`.
4. Berkas harus DOCX, ukuran 1 byte–20 MB. Nama berkas disanitasi; karakter di luar `A-Z a-z 0-9 . _ - spasi` diganti `_`.
5. Simpan. Unggahan tercatat di audit sebagai `UPLOAD_TEMPLATE`.

Menghapus template meminta konfirmasi **Hapus Template**. Bila template pengguna dihapus, aplikasi kembali memakai template bawaan (bila ada).

---

## 5. Catatan penting saat menyunting di Microsoft Word

1. **Jangan memecah placeholder menjadi beberapa run.** Word kadang memecah `{nomor_akta}` menjadi `{`, `nomor_akta`, `}` dengan format berbeda. Bila ini terjadi, Docxtemplater tidak menemukan tag. Solusi: ketik ulang placeholder dalam satu run (biasanya dengan menempel sebagai teks biasa), atau gunakan *Clear All Formatting* pada placeholder.
2. **Jangan mengubah nama placeholder.** Nama yang tidak dikenal akan menghasilkan error saat render.
3. **Loop harus seimbang.** Setiap `{#...}` memerlukan `{/...}`.
4. **Delimiter adalah `{` dan `}` tunggal**, bukan `{{ }}`. Untuk menampilkan kurung kurawal literal, hindari penggunaannya di teks biasa.
5. **Simpan sebagai `.docx`**, bukan `.doc` atau `.dotx`.
6. **Uji dengan data nyata** setelah mengunggah: buat akta uji, hasilkan draft, lalu periksa hasilnya. Template yang salah tidak akan merusak data akta, tetapi dokumen yang dihasilkan bisa tidak lengkap.

---

## 6. Batasan yang disengaja

- Template tidak melakukan validasi hukum atas isi akta. Isi tetap tanggung jawab notaris/PPAT.
- Aplikasi tidak menandatangani dokumen secara digital dan tidak menetapkan status autentik. Status akta berubah hanya melalui tindakan pengguna yang tercatat.
- Template invoice DOCX bersifat cadangan; PDF invoice memakai tata letak bawaan.
- Format DOCX tidak dipakai untuk laporan; laporan diekspor ke PDF dan XLSX.
