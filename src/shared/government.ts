/** Domain Government Integration Gateway — dipakai main, preload, dan renderer. */

export const GOVERNMENT_AGENCIES = [
  { value: 'AHU', label: 'AHU Online', agency: 'Kementerian Hukum' },
  { value: 'BPN', label: 'ATR/BPN', agency: 'Kementerian Agraria dan Tata Ruang' },
] as const

export type GovernmentAgency = (typeof GOVERNMENT_AGENCIES)[number]['value']

/** Kode agen untuk validasi Zod. */
export const GOVERNMENT_AGENCY_CODES = ['AHU', 'BPN'] as const

/** Portal resmi yang dibuka pengguna secara manual. Tidak ada scraping/otomasi. */
export const GOVERNMENT_OFFICIAL_PORTALS: Record<GovernmentAgency, string> = {
  AHU: 'https://layanan.ahu.go.id/',
  BPN: 'https://mitra.atrbpn.go.id/',
}

export const GOVERNMENT_INTEGRATION_MODES = [
  { value: 'SEMI_OTOMATIS', label: 'Semi-otomatis' },
  { value: 'API_RESMI', label: 'API resmi (belum tersedia)' },
] as const

export const GOVERNMENT_STATUSES = [
  'DRAFT',
  'SIAP_DIAJUKAN',
  'MENUNGGU_PORTAL',
  'DIAJUKAN',
  'DIPROSES',
  'SELESAI',
  'DITOLAK',
  'DIBATALKAN',
] as const
export type GovernmentStatus = (typeof GOVERNMENT_STATUSES)[number]

export const GOVERNMENT_STATUS_LABELS: Record<GovernmentStatus, string> = {
  DRAFT: 'Draft',
  SIAP_DIAJUKAN: 'Siap Diajukan',
  MENUNGGU_PORTAL: 'Menunggu Portal',
  DIAJUKAN: 'Diajukan',
  DIPROSES: 'Diproses',
  SELESAI: 'Selesai',
  DITOLAK: 'Ditolak',
  DIBATALKAN: 'Dibatalkan',
}

/** Transisi status internal. Status resmi pemerintah dicatat terpisah. */
export const GOVERNMENT_STATUS_TRANSITIONS: Record<GovernmentStatus, GovernmentStatus[]> = {
  DRAFT: ['SIAP_DIAJUKAN', 'DIBATALKAN'],
  SIAP_DIAJUKAN: ['MENUNGGU_PORTAL', 'DRAFT', 'DIBATALKAN'],
  MENUNGGU_PORTAL: ['DIAJUKAN', 'SIAP_DIAJUKAN', 'DIBATALKAN'],
  DIAJUKAN: ['DIPROSES', 'SELESAI', 'DITOLAK', 'DIBATALKAN'],
  DIPROSES: ['SELESAI', 'DITOLAK'],
  SELESAI: [],
  DITOLAK: [],
  DIBATALKAN: [],
}

export const GOVERNMENT_FINAL_STATUSES: GovernmentStatus[] = ['SELESAI', 'DITOLAK', 'DIBATALKAN']

/** Kelompok penyaringan daftar pengajuan. */
export const GOVERNMENT_PREPARATION_STATUSES: GovernmentStatus[] = ['DRAFT', 'SIAP_DIAJUKAN']
export const GOVERNMENT_RUNNING_STATUSES: GovernmentStatus[] = ['MENUNGGU_PORTAL', 'DIAJUKAN', 'DIPROSES']
export const GOVERNMENT_VIEW_CODES = ['PERSIAPAN', 'BERJALAN', 'FINAL', 'SEMUA'] as const
export type GovernmentView = (typeof GOVERNMENT_VIEW_CODES)[number]
export const GOVERNMENT_VIEW_GROUPS: Record<GovernmentView, { label: string; statuses: GovernmentStatus[] }> = {
  PERSIAPAN: { label: 'Persiapan', statuses: GOVERNMENT_PREPARATION_STATUSES },
  BERJALAN: { label: 'Berjalan di portal', statuses: GOVERNMENT_RUNNING_STATUSES },
  FINAL: { label: 'Sudah final', statuses: GOVERNMENT_FINAL_STATUSES },
  SEMUA: { label: 'Semua status', statuses: [...GOVERNMENT_STATUSES] },
}

export const GOVERNMENT_FILE_KIND_CODES = ['DOKUMEN_PENDUKUNG', 'BUKTI_PENGAJUAN', 'HASIL_LAYANAN'] as const
export type GovernmentFileKind = (typeof GOVERNMENT_FILE_KIND_CODES)[number]
export const GOVERNMENT_FILE_KINDS: { value: GovernmentFileKind; label: string }[] = [
  { value: 'DOKUMEN_PENDUKUNG', label: 'Dokumen Pendukung' },
  { value: 'BUKTI_PENGAJUAN', label: 'Bukti Pengajuan' },
  { value: 'HASIL_LAYANAN', label: 'Hasil Layanan' },
]

export const GOVERNMENT_REFERENCE_TYPE_CODES = [
  'NOMOR_PERMOHONAN',
  'NOMOR_BERKAS',
  'NOMOR_VOUCHER',
  'NOMOR_SERTIFIKAT',
  'NOMOR_SK',
  'LAINNYA',
] as const
export type GovernmentReferenceType = (typeof GOVERNMENT_REFERENCE_TYPE_CODES)[number]
export const GOVERNMENT_REFERENCE_TYPES: { value: GovernmentReferenceType; label: string }[] = [
  { value: 'NOMOR_PERMOHONAN', label: 'Nomor Permohonan' },
  { value: 'NOMOR_BERKAS', label: 'Nomor Berkas' },
  { value: 'NOMOR_VOUCHER', label: 'Nomor Voucher' },
  { value: 'NOMOR_SERTIFIKAT', label: 'Nomor Sertifikat' },
  { value: 'NOMOR_SK', label: 'Nomor SK / Keputusan' },
  { value: 'LAINNYA', label: 'Lainnya' },
]

export const GOVERNMENT_OFFICIAL_SOURCE_CODES = ['PORTAL', 'SURAT_RESMI', 'PETUGAS', 'MANUAL'] as const
export type GovernmentOfficialSource = (typeof GOVERNMENT_OFFICIAL_SOURCE_CODES)[number]
export const GOVERNMENT_OFFICIAL_SOURCES: { value: GovernmentOfficialSource; label: string }[] = [
  { value: 'PORTAL', label: 'Portal resmi (dicatat manual)' },
  { value: 'SURAT_RESMI', label: 'Surat/keputusan resmi' },
  { value: 'PETUGAS', label: 'Keterangan petugas' },
  { value: 'MANUAL', label: 'Catatan manual' },
]

export const GOVERNMENT_SYNC_DIRECTIONS = [
  { value: 'PERSIAPAN', label: 'Persiapan data' },
  { value: 'PORTAL', label: 'Portal dibuka' },
  { value: 'PENGAJUAN', label: 'Nomor pengajuan dicatat' },
  { value: 'STATUS', label: 'Status diperbarui' },
  { value: 'BERKAS', label: 'Berkas ditambahkan' },
  { value: 'KREDENSIAL', label: 'Kredensial diperbarui' },
] as const

export const GOVERNMENT_SYNC_STATUS_CODES = ['PENDING', 'SUCCESS', 'FAILED'] as const
export const GOVERNMENT_SYNC_STATUSES: { value: (typeof GOVERNMENT_SYNC_STATUS_CODES)[number]; label: string }[] = [
  { value: 'PENDING', label: 'Menunggu tindakan manual' },
  { value: 'SUCCESS', label: 'Tercatat' },
  { value: 'FAILED', label: 'Gagal' },
]

export const GOVERNMENT_SERVICE_CATEGORIES = [
  { value: 'BADAN_USAHA', label: 'Badan Usaha' },
  { value: 'NOTARIAT', label: 'Notariat' },
  { value: 'PERTANAHAN', label: 'Pertanahan' },
] as const

export interface GovernmentServiceSeed {
  code: string
  agency: GovernmentAgency
  name: string
  description: string
  category: 'BADAN_USAHA' | 'NOTARIAT' | 'PERTANAHAN'
  sortOrder: number
}

export const GOVERNMENT_SERVICE_SEEDS: GovernmentServiceSeed[] = [
  {
    code: 'AHU_PENDIRIAN_PT', agency: 'AHU', name: 'Pendirian Perseroan Terbatas',
    description: 'Pengesahan pendirian PT melalui AHU Online.', category: 'BADAN_USAHA', sortOrder: 10,
  },
  {
    code: 'AHU_PERUBAHAN_PT', agency: 'AHU', name: 'Perubahan Anggaran Dasar PT',
    description: 'Pengesahan perubahan anggaran dasar perseroan terbatas.', category: 'BADAN_USAHA', sortOrder: 20,
  },
  {
    code: 'AHU_PENDIRIAN_CV', agency: 'AHU', name: 'Pendirian CV',
    description: 'Pendaftaran pendirian persekutuan komanditer.', category: 'BADAN_USAHA', sortOrder: 30,
  },
  {
    code: 'AHU_PERUBAHAN_CV', agency: 'AHU', name: 'Perubahan CV',
    description: 'Pendaftaran perubahan persekutuan komanditer.', category: 'BADAN_USAHA', sortOrder: 40,
  },
  {
    code: 'AHU_PENDIRIAN_YAYASAN', agency: 'AHU', name: 'Pendirian Yayasan',
    description: 'Pengesahan pendirian yayasan.', category: 'BADAN_USAHA', sortOrder: 50,
  },
  {
    code: 'AHU_PERUBAHAN_YAYASAN', agency: 'AHU', name: 'Perubahan Yayasan',
    description: 'Pengesahan perubahan yayasan.', category: 'BADAN_USAHA', sortOrder: 60,
  },
  {
    code: 'AHU_PENDIRIAN_KOPERASI', agency: 'AHU', name: 'Pendirian Koperasi',
    description: 'Pengesahan pendirian koperasi.', category: 'BADAN_USAHA', sortOrder: 70,
  },
  {
    code: 'AHU_LEGALISASI', agency: 'AHU', name: 'Legalisasi Dokumen Notaris',
    description: 'Legalisasi dokumen notaris melalui layanan AHU.', category: 'NOTARIAT', sortOrder: 80,
  },
  {
    code: 'AHU_SALINAN_AKTA', agency: 'AHU', name: 'Permohonan Salinan Akta',
    description: 'Permohonan salinan akta/legalisasi salinan.', category: 'NOTARIAT', sortOrder: 90,
  },
  {
    code: 'BPN_PENGECEKAN_SERTIFIKAT', agency: 'BPN', name: 'Pengecekan Sertifikat',
    description: 'Pengecekan data sertifikat melalui Aplikasi Mitra ATR/BPN.', category: 'PERTANAHAN', sortOrder: 10,
  },
  {
    code: 'BPN_SKPT', agency: 'BPN', name: 'Surat Keterangan Pendaftaran Tanah (SKPT)',
    description: 'Permohonan SKPT untuk objek tanah.', category: 'PERTANAHAN', sortOrder: 20,
  },
  {
    code: 'BPN_BALIK_NAMA', agency: 'BPN', name: 'Balik Nama Sertifikat',
    description: 'Pendaftaran peralihan hak/balik nama sertifikat.', category: 'PERTANAHAN', sortOrder: 30,
  },
  {
    code: 'BPN_APHT', agency: 'BPN', name: 'Pendaftaran APHT',
    description: 'Pendaftaran Akta Pemberian Hak Tanggungan.', category: 'PERTANAHAN', sortOrder: 40,
  },
  {
    code: 'BPN_ROYA', agency: 'BPN', name: 'Roya / Hapus Hak Tanggungan',
    description: 'Permohonan roya atau hapus hak tanggungan.', category: 'PERTANAHAN', sortOrder: 50,
  },
  {
    code: 'BPN_HGB_PERPANJANGAN', agency: 'BPN', name: 'Perpanjangan HGB',
    description: 'Permohonan perpanjangan Hak Guna Bangunan.', category: 'PERTANAHAN', sortOrder: 60,
  },
  {
    code: 'BPN_PEMECAHAN', agency: 'BPN', name: 'Pemecahan Sertifikat',
    description: 'Permohonan pemecahan bidang tanah.', category: 'PERTANAHAN', sortOrder: 70,
  },
  {
    code: 'BPN_PENGGABUNGAN', agency: 'BPN', name: 'Penggabungan Sertifikat',
    description: 'Permohonan penggabungan bidang tanah.', category: 'PERTANAHAN', sortOrder: 80,
  },
]

export interface GovernmentFieldTemplate {
  key: string
  label: string
  placeholder?: string
}

/** Isian standar per agen; operator yang menyalin nilai dari portal resmi. */
export const GOVERNMENT_FIELD_TEMPLATES: Record<GovernmentAgency, GovernmentFieldTemplate[]> = {
  AHU: [
    { key: 'namaBadanHukum', label: 'Nama Badan Hukum', placeholder: 'PT Contoh Mandiri' },
    { key: 'jenisBadanHukum', label: 'Jenis Badan Hukum', placeholder: 'PT / CV / Yayasan / Koperasi' },
    { key: 'nomorAkta', label: 'Nomor Akta', placeholder: '12' },
    { key: 'tanggalAkta', label: 'Tanggal Akta', placeholder: '2026-01-15' },
    { key: 'kedudukan', label: 'Kedudukan / Domisili' },
    { key: 'modalDasar', label: 'Modal Dasar', placeholder: 'Rp 50.000.000' },
    { key: 'direksi', label: 'Susunan Direksi' },
    { key: 'komisaris', label: 'Susunan Dewan Komisaris' },
    { key: 'pemegangSaham', label: 'Pemegang Saham' },
  ],
  BPN: [
    { key: 'nomorSertifikat', label: 'Nomor Sertifikat', placeholder: '13.04.04.1.0.1234' },
    { key: 'jenisHak', label: 'Jenis Hak', placeholder: 'SHM / HGB / HP' },
    { key: 'pemegangHak', label: 'Pemegang Hak' },
    { key: 'letakTanah', label: 'Letak Tanah' },
    { key: 'luasTanah', label: 'Luas Tanah', placeholder: '250 m2' },
    { key: 'penjual', label: 'Pihak Penjual / Pemohon' },
    { key: 'pembeli', label: 'Pihak Pembeli / Penerima Hak' },
    { key: 'nomorBerkas', label: 'Nomor Berkas Kantor Pertanahan' },
  ],
}

export function governmentFieldsFor(agency?: string | null): GovernmentFieldTemplate[] {
  return GOVERNMENT_FIELD_TEMPLATES[agency as GovernmentAgency] ?? []
}

export function governmentAgencyLabel(agency: string): string {
  return GOVERNMENT_AGENCIES.find((a) => a.value === agency)?.label ?? agency
}

export function governmentStatusLabel(status?: string | null): string {
  if (!status) return '—'
  return GOVERNMENT_STATUS_LABELS[status as GovernmentStatus] ?? status
}

export function governmentServiceCategoryLabel(category?: string | null): string {
  if (!category) return '—'
  return GOVERNMENT_SERVICE_CATEGORIES.find((c) => c.value === category)?.label ?? category
}

export function governmentFileKindLabel(kind?: string | null): string {
  if (!kind) return '—'
  return GOVERNMENT_FILE_KINDS.find((k) => k.value === kind)?.label ?? kind
}

export function governmentReferenceTypeLabel(type?: string | null): string {
  if (!type) return '—'
  return GOVERNMENT_REFERENCE_TYPES.find((t) => t.value === type)?.label ?? type
}

export function governmentOfficialSourceLabel(source?: string | null): string {
  if (!source) return '—'
  return GOVERNMENT_OFFICIAL_SOURCES.find((s) => s.value === source)?.label ?? source
}

export function governmentSyncDirectionLabel(direction?: string | null): string {
  if (!direction) return '—'
  return GOVERNMENT_SYNC_DIRECTIONS.find((d) => d.value === direction)?.label ?? direction
}

export function governmentSyncStatusLabel(status?: string | null): string {
  if (!status) return '—'
  return GOVERNMENT_SYNC_STATUSES.find((s) => s.value === status)?.label ?? status
}
