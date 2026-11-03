# Performa NOTARIS PRO — hasil pengukuran

Dokumen ini memuat angka **terukur** pada perangkat uji yang disebut di bawah. Angka ini bukan janji universal: mesin dengan CPU, RAM, atau disk berbeda dapat memberi hasil berbeda. Yang dapat diulang ialah prosedurnya (`scripts/perf-bench.mjs`), bukan angkanya.

## 1. Perangkat dan dataset uji

| Komponen | Nilai |
|---|---|
| Sistem | Windows x64 (10.0.26300) |
| CPU | Intel Core i3-1215U, 8 CPU logis |
| RAM | 3.746 MB (3,8 GB); RAM bebas 390–550 MB saat benchmark berjalan |
| Runtime | Electron 45.2.1 (Node 24.22.1 di dalam aplikasi), harness Node v26.7.0 |
| Build | `electron-vite build` produksi (renderer diminifikasi, rute dipecah per modul) |
| Vault | Dimatikan (`NOTARIS_VAULT=off`) — membuka vault membaca seluruh basis data ke memori dan pada host 3,8 GB proses berhenti sebelum pengukuran selesai |

Dataset dibuat oleh `scripts/perf-bench.mjs` (`--profile=full`) dan **tidak memakai data nyata**:

| Tabel | Baris |
|---|---:|
| Client | 100.000 |
| Transaction | 100.040 |
| Deed | 100.000 |
| Document | 1.000.000 |
| WorkflowHistory | 500.040 |
| AuditLog | 500.092 |
| DeedRepertorium | 30.000 |
| Ukuran berkas basis data | ±1,47 GB |

## 2. Metode

- Setiap skenario menjalankan satu panggilan pemanasan (tidak dihitung), lalu 2–20 ulangan; p50 dan p95 dihitung dari ulangan tersebut.
- Semua panggilan melewati jalur produksi: renderer → IPC `app:call` → router → Prisma/SQLite, dengan validasi Zod dan pemeriksaan izin yang sama seperti pemakaian nyata.
- Baseline diambil sebelum pekerjaan tuning (tanpa migrasi 004/005, tanpa pagar kedalaman halaman, tanpa FTS5). Hasil "sesudah" diambil pada dataset yang sama setelah semua perubahan, dengan `--skip-seed` agar isi tabel tidak berubah selain baris yang memang ditulis skenario tulis.
- Rincian mentah: `tmp/perf/baseline-full.json` dan `tmp/perf/after-full.json`.

## 3. Hasil per skenario

Nilai dalam milidetik. "Δ" ialah perubahan p50; angka negatif berarti lebih cepat.

| Skenario | Rute | Baseline p50 / p95 | Sesudah p50 / p95 | Δ p50 | Catatan |
|---|---|---:|---:|---:|---|
| cari-nama-klien | `clients.list` | 325,4 / 450,4 | 199,0 / 310,5 | −39% | indeks komposit + pagar kedalaman |
| cari-nomor-akta-global | `search.global` | 3.435,9 / 3.977,2 | 11,5 / 13,3 | −99,7% | FTS5 awalan, bukan `LIKE '%…%'` |
| filter-tanggal-akta | `deeds.list` | 4,7 / 14,1 | 4,7 / 5,9 | 0% | sudah memakai indeks |
| filter-status-transaksi | `transactions.list` | 269,9 / 288,6 | 201,2 / 214,9 | −25% | indeks komposit status |
| halaman-dalam-tabel-klien | `clients.list` | 694,3 / 760,7 | 316,9 / 406,1 | −54% | offset tetap dibayar; halaman >4.000 ditolak |
| halaman-1-klien | `clients.list` | 306,4 / 328,8 | 127,8 / 149,4 | −58% | |
| detail-klien | `clients.get` | 2,6 / 2,8 | 2,9 / 3,4 | +0,3 ms | derau pengukuran |
| detail-akta | `deeds.get` | 2,2 / 2,5 | 2,1 / 3,1 | −0,1 ms | lihat §5: sempat 1,9 s, diperbaiki migrasi 006 |
| daftar-dokumen | `documents.list` | 2,1 / 2,9 | 2,3 / 2,6 | +0,2 ms | derau pengukuran |
| daftar-repertorium | `deeds.repertorium.list` | 8,3 / 11,5 | 9,2 / 11,7 | +0,9 ms | derau pengukuran |
| dashboard | `dashboard.get` | 439,6 / 449,8 | 274,6 / 320,4 | −38% | agregasi di sisi basis data |
| daftar-audit | `audit.list` | 1.093,1 / 1.141,2 | 742,2 / 812,8 | −32% | indeks `AuditLog(action)` |
| verifikasi-rantai-audit | `audit.verify` | 5.599,7 | 5.465,0 | −2% | 500.092 entri diverifikasi utuh; linier terhadap jumlah entri |
| buat-transaksi | `transactions.create` | 5,0 / 20,2 | 7,5 / 14,6 | +2,5 ms | trigger FTS + rantai audit ikut menulis |
| ubah-klien | `clients.update` | 4,8 / 6,0 | 4,5 / 6,0 | −0,3 ms | derau pengukuran |
| laporan-akta | `reports.generate` | ditolak | ditolak | — | >20.000 baris: pagar meminta periode dipersempit |
| laporan-klien | `reports.generate` | ditolak | ditolak | — | >20.000 baris |
| laporan-akta-sempit | `reports.generate` | 54,0 / 57,7 | 55,7 / 60,9 | +1,7 ms | |
| ekspor-excel-akta-sempit | `reports.exportExcel` | 68,4 | 67,6 | 0% | |
| ekspor-pdf-akta-sempit | `reports.exportPdf` | 607,2 | 637,6 | +5% | pembuatan PDF, bukan basis data |
| ekspor-excel-akta | `reports.exportExcel` | ditolak | ditolak | — | >20.000 baris |
| ekspor-pdf-akta-per-tahun | `reports.exportPdf` | ditolak | ditolak | — | >20.000 baris |
| backup | `backup.create` | 180.191 | 244.819 | +36% | lihat §6 |
| validasi-backup | `backup.validate` | 82.527 | 91.302 | +11% | berkas cadangan 13% lebih besar |
| restore | `backup.restore` | 408.967 | 500.711 | +22% | lihat §6 |

Empat skenario laporan besar sengaja **ditolak** dengan `CONFLICT` dan pesan agar periode dipersempit. Baseline juga gagal pada skenario yang sama; penolakan ini bukan regresi performa, melainkan pagar agar satu permintaan tidak memuat ratusan ribu baris ke memori renderer. Laporan berjendela sempit tetap terukur dan selesai di bawah 1,2 detik.

## 4. Yang berubah dan dampaknya

| Perubahan | Dampak terukur |
|---|---|
| Indeks komposit `004_performance.sql` | daftar klien, transaksi, audit, dashboard turun 25–58% |
| Pagar kedalaman halaman | halaman ke-2.000 klien ~317 ms; permintaan yang offset-nya melewati 200.000 baris ditolak |
| FTS5 awalan tanpa kolom sensitif | pencarian nomor akta 3,4 s → 11,5 ms; indeks hanya memuat nama/kode/judul/nomor |
| Agregasi di sisi basis data | dashboard 440 ms → 275 ms |
| `PRAGMA` + `ANALYZE` saat idle | statistik pemilih indeks tersedia tanpa memblokir pengguna |

## 5. Temuan selama benchmark "sesudah" pertama

Run pertama menghasilkan `deeds.get` **1,9 detik** padahal baseline 2,2 ms. Penyebabnya bukan Prisma, melainkan rencana kueri: `WorkflowHistory` diambil dengan `WHERE deedId = ? ORDER BY createdAt`, dan SQLite memilih memindai indeks `createdAt` (500.000 baris) agar tidak perlu mengurutkan. Karena pada dataset uji seluruh baris riwayat terikat ke transaksi (kolom `deedId` bernilai NULL), pemilih indeks menilai indeks `deedId` tidak berguna.

Migrasi `006_workflow_index.sql` mengganti indeks satu kolom itu dengan komposit `WorkflowHistory(deedId, createdAt)`; indeks lama menjadi redundan karena merupakan prefiksnya. Setelah migrasi:

- `EXPLAIN QUERY PLAN` berubah dari `SCAN WorkflowHistory USING INDEX WorkflowHistory_createdAt_idx` menjadi `SEARCH WorkflowHistory USING INDEX WorkflowHistory_deedId_createdAt_idx (deedId=?)`;
- kueri riwayat pada dataset penuh turun dari 877–4.239 ms menjadi <1 ms;
- `deeds.get` kembali 2,1 ms pada run kedua.

Migrasi ini idempoten (`DROP INDEX IF EXISTS` + `CREATE INDEX IF NOT EXISTS`) dan diuji di `tests/migrate.test.ts`.

## 6. Biaya verifikasi pada backup dan restore

Backup dan restore **memang lebih lambat** daripada baseline, dan itu disengaja:

- `backup.create` membuat salinan konsisten (`VACUUM INTO`; API backup SQLite dipakai bila tersedia), menjalankan `PRAGMA integrity_check` atas salinan, menghitung SHA-256 untuk manifes, lalu mengalirkan gzip + AES-256-GCM per entri tanpa memuat basis data ke memori. Cadangan lama tidak dihapus sebelum cadangan baru lolos verifikasi.
- `backup.restore` menjalankan `integrity_check` atas basis data hasil restore sebelum menukarnya dengan basis data aktif.
- Berkas cadangan tumbuh dari 365 MB menjadi 414 MB (+13%) karena basis data bertambah 6% dan tabel bayangan FTS5 ikut tersimpan.

Fase yang diukur terpisah pada dataset yang sama (Node di host, cache hangat):

| Fase | Waktu |
|---|---:|
| Salinan konsisten (`VACUUM INTO`) | 6,2 s |
| `PRAGMA integrity_check` | 73,2 s |
| SHA-256 | 2,6 s |
| gzip level 6 | 26,3 s |

Pemeriksaan integritas adalah bagian terbesar dari biaya itu. Menghapusnya akan mempercepat backup, tetapi melanggar syarat bahwa cadangan harus terverifikasi sebelum dianggap sah. Validasi backup bervariasi 91–105 s antar-run pada berkas yang sama (±13% derau I/O pada perangkat ini).

## 7. Pemuatan antarmuka dan memori

Bundle renderer diukur dari keluaran build (rincian di `docs/ARSITEKTUR.md` §9.10):

| Kondisi | Yang dimuat |
|---|---|
| Sebelum | satu chunk 2.382,62 kB tanpa minifikasi |
| Sesudah | ±383 kB saat awal (react 222,29 + index 69,68 + vendor 50,49 + router 38,74 + icons 28,88 + date 25,17 kB) + CSS 59,75 kB |
| Dashboard | tambahan `charts` 332,90 kB hanya ketika dashboard dibuka |
| Total aplikasi | ±1,19 MB (turun ±50%) |

Waktu siap jendela pertama: baseline 1.476 ms; build sesudah diukur 2.164 ms pada run benchmark, lalu 1.808 ms dan 986 ms pada dua peluncuran terpisah. Satu sampel 11.935 ms terjadi pada peluncuran pertama setelah build baru dan tidak dapat diulang; sampel itu dicatat sebagai anomali I/O, bukan angka yang diklaim. Tidak ada target startup yang ditetapkan, tetapi ketiga sampel normal berada di bawah 2,2 detik.

Memori proses Electron saat benchmark selesai: 92 MB RSS gabungan (4 proses). Virtual scrolling menjaga tabel tak berpaginasi tetap ringan: invoice dengan 90 item merender 20 baris DOM dan tetap dapat menggulir ke item ke-90.

## 8. Batas pengukuran

- Dataset sintetis tidak memuat isi akta sepanjang dokumen nyata; kolom teks besar tidak diuji untuk volume.
- Vault dimatikan; biaya enkripsi/dekripsi vault tidak termasuk.
- Angka I/O (backup, validasi, restore) paling sensitif terhadap kondisi disk dan antivirus; variasi antar-run sampai ±13% terlihat pada berkas yang sama.
- Pagar dan penolakan (halaman terlalu dalam, laporan >20.000 baris) adalah perilaku yang diinginkan, bukan kegagalan yang tersembunyi: pesannya menyebutkan tindakan yang harus dilakukan pengguna.

## 9. Cara mengulang

```bash
npm run build
node scripts/perf-bench.mjs --profile=smoke --label=baseline   # cepat, 5.000 baris per tabel
node scripts/perf-bench.mjs --profile=full  --label=baseline   # dataset penuh, seed ±10 menit
node scripts/perf-bench.mjs --profile=full  --label=after --skip-seed
```

Hasil ditulis ke `tmp/perf/<label>-<profil>.json` dan `.md`. Folder `tmp/perf-<profil>` hanya berisi data sintetis dan tidak pernah menyentuh folder data pengguna.
