/** Konstanta domain bersama antara proses main, preload, dan renderer. */

export const APP_NAME = 'NOTARIS PRO'
export const APP_SUBTITLE = 'Integrated Notary & PPAT Management System'
export const APP_VERSION = '1.0.0'

export type RoleCode =
  | 'ADMINISTRATOR'
  | 'NOTARIS'
  | 'PPAT'
  | 'KEPALA_STAF'
  | 'STAFF_NOTARIS'
  | 'STAFF_PPAT'
  | 'FINANCE'
  | 'RECEPTIONIST'

export interface RoleDef {
  code: RoleCode
  name: string
  description: string
  permissions: string[]
}

export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',
  CLIENTS_VIEW: 'clients.view',
  CLIENTS_MANAGE: 'clients.manage',
  TRANSACTIONS_VIEW: 'transactions.view',
  TRANSACTIONS_MANAGE: 'transactions.manage',
  DEEDS_VIEW: 'deeds.view',
  DEEDS_MANAGE: 'deeds.manage',
  DEEDS_APPROVE: 'deeds.approve',
  PPAT_VIEW: 'ppat.view',
  PPAT_MANAGE: 'ppat.manage',
  DOCUMENTS_VIEW: 'documents.view',
  DOCUMENTS_MANAGE: 'documents.manage',
  REPERTORIUM_VIEW: 'repertorium.view',
  PROTOCOL_VIEW: 'protocol.view',
  PROTOCOL_MANAGE: 'protocol.manage',
  FINANCE_VIEW: 'finance.view',
  FINANCE_MANAGE: 'finance.manage',
  CALENDAR_VIEW: 'calendar.view',
  CALENDAR_MANAGE: 'calendar.manage',
  USERS_VIEW: 'users.view',
  USERS_MANAGE: 'users.manage',
  REPORTS_VIEW: 'reports.view',
  AUDIT_VIEW: 'audit.view',
  BACKUP_MANAGE: 'backup.manage',
  SETTINGS_MANAGE: 'settings.manage',
  TEMPLATES_MANAGE: 'templates.manage',
  GOVERNMENT_VIEW: 'government.view',
  GOVERNMENT_MANAGE: 'government.manage',
  GOVERNMENT_CONFIGURE: 'government.configure',
} as const

export const PERMISSION_CATALOG: { code: string; name: string; group: string }[] = [
  { code: 'dashboard.view', name: 'Lihat dashboard', group: 'Dashboard' },
  { code: 'clients.view', name: 'Lihat klien', group: 'Klien' },
  { code: 'clients.manage', name: 'Kelola klien', group: 'Klien' },
  { code: 'transactions.view', name: 'Lihat transaksi', group: 'Transaksi' },
  { code: 'transactions.manage', name: 'Kelola transaksi', group: 'Transaksi' },
  { code: 'deeds.view', name: 'Lihat akta', group: 'Akta' },
  { code: 'deeds.manage', name: 'Kelola draft akta', group: 'Akta' },
  { code: 'deeds.approve', name: 'Review & approval akta', group: 'Akta' },
  { code: 'ppat.view', name: 'Lihat layanan PPAT', group: 'PPAT' },
  { code: 'ppat.manage', name: 'Kelola layanan PPAT', group: 'PPAT' },
  { code: 'documents.view', name: 'Lihat dokumen', group: 'Dokumen' },
  { code: 'documents.manage', name: 'Kelola dokumen', group: 'Dokumen' },
  { code: 'repertorium.view', name: 'Lihat repertorium', group: 'Repertorium' },
  { code: 'protocol.view', name: 'Lihat protokol', group: 'Protokol' },
  { code: 'protocol.manage', name: 'Kelola protokol', group: 'Protokol' },
  { code: 'finance.view', name: 'Lihat keuangan', group: 'Keuangan' },
  { code: 'finance.manage', name: 'Kelola invoice & pembayaran', group: 'Keuangan' },
  { code: 'calendar.view', name: 'Lihat kalender', group: 'Kalender' },
  { code: 'calendar.manage', name: 'Kelola jadwal', group: 'Kalender' },
  { code: 'users.view', name: 'Lihat pengguna', group: 'Pengguna' },
  { code: 'users.manage', name: 'Kelola pengguna & role', group: 'Pengguna' },
  { code: 'reports.view', name: 'Lihat & ekspor laporan', group: 'Laporan' },
  { code: 'audit.view', name: 'Lihat audit log', group: 'Audit' },
  { code: 'backup.manage', name: 'Backup & restore', group: 'Sistem' },
  { code: 'settings.manage', name: 'Pengaturan sistem', group: 'Sistem' },
  { code: 'templates.manage', name: 'Kelola template dokumen', group: 'Sistem' },
  { code: 'government.view', name: 'Lihat integrasi pemerintah', group: 'Integrasi Pemerintah' },
  { code: 'government.manage', name: 'Kelola pengajuan pemerintah', group: 'Integrasi Pemerintah' },
  { code: 'government.configure', name: 'Konfigurasi integrasi & kredensial', group: 'Integrasi Pemerintah' },
]

const ALL = PERMISSION_CATALOG.map((p) => p.code)

export const ROLES: RoleDef[] = [
  {
    code: 'ADMINISTRATOR',
    name: 'Administrator',
    description: 'Akses penuh terhadap seluruh modul dan konfigurasi sistem.',
    permissions: ALL,
  },
  {
    code: 'NOTARIS',
    name: 'Notaris',
    description: 'Kewenangan akta notaris, review dan approval akta.',
    permissions: [
      'dashboard.view', 'clients.view', 'clients.manage', 'transactions.view', 'transactions.manage',
      'deeds.view', 'deeds.manage', 'deeds.approve', 'ppat.view', 'documents.view', 'documents.manage',
      'repertorium.view', 'protocol.view', 'protocol.manage', 'finance.view', 'calendar.view',
      'calendar.manage', 'reports.view', 'audit.view', 'users.view',
      'government.view', 'government.manage',
    ],
  },
  {
    code: 'PPAT',
    name: 'PPAT',
    description: 'Kewenangan akta PPAT dan proses pertanahan.',
    permissions: [
      'dashboard.view', 'clients.view', 'clients.manage', 'transactions.view', 'transactions.manage',
      'deeds.view', 'deeds.manage', 'ppat.view', 'ppat.manage', 'documents.view', 'documents.manage',
      'repertorium.view', 'protocol.view', 'finance.view', 'calendar.view', 'calendar.manage',
      'reports.view', 'users.view', 'government.view', 'government.manage',
    ],
  },
  {
    code: 'KEPALA_STAF',
    name: 'Kepala Staf',
    description: 'Mengawasi operasional harian kantor.',
    permissions: [
      'dashboard.view', 'clients.view', 'clients.manage', 'transactions.view', 'transactions.manage',
      'deeds.view', 'deeds.manage', 'ppat.view', 'ppat.manage', 'documents.view', 'documents.manage',
      'repertorium.view', 'protocol.view', 'protocol.manage', 'finance.view', 'calendar.view',
      'calendar.manage', 'users.view', 'reports.view', 'audit.view',
      'government.view', 'government.manage',
    ],
  },
  {
    code: 'STAFF_NOTARIS',
    name: 'Staff Notaris',
    description: 'Administrasi klien, transaksi, dan draft akta notaris.',
    permissions: [
      'dashboard.view', 'clients.view', 'clients.manage', 'transactions.view', 'transactions.manage',
      'deeds.view', 'deeds.manage', 'documents.view', 'documents.manage', 'repertorium.view',
      'protocol.view', 'calendar.view', 'calendar.manage', 'reports.view',
      'government.view', 'government.manage',
    ],
  },
  {
    code: 'STAFF_PPAT',
    name: 'Staff PPAT',
    description: 'Administrasi klien, transaksi, dan layanan PPAT.',
    permissions: [
      'dashboard.view', 'clients.view', 'clients.manage', 'transactions.view', 'transactions.manage',
      'ppat.view', 'ppat.manage', 'documents.view', 'documents.manage', 'repertorium.view',
      'protocol.view', 'calendar.view', 'calendar.manage', 'reports.view',
      'government.view', 'government.manage',
    ],
  },
  {
    code: 'FINANCE',
    name: 'Finance',
    description: 'Invoice, pembayaran, pengeluaran, dan laporan keuangan.',
    permissions: [
      'dashboard.view', 'clients.view', 'transactions.view', 'finance.view', 'finance.manage',
      'documents.view', 'calendar.view', 'reports.view',
    ],
  },
  {
    code: 'RECEPTIONIST',
    name: 'Receptionist',
    description: 'Pendaftaran klien, jadwal, dan informasi transaksi.',
    permissions: [
      'dashboard.view', 'clients.view', 'clients.manage', 'transactions.view', 'documents.view',
      'calendar.view', 'calendar.manage', 'reports.view',
    ],
  },
]

export const CLIENT_TYPES = [
  { value: 'PERORANGAN', label: 'Perorangan' },
  { value: 'BADAN_HUKUM', label: 'Badan Hukum' },
]
export const CLIENT_STATUSES = [
  { value: 'AKTIF', label: 'Aktif' },
  { value: 'NONAKTIF', label: 'Nonaktif' },
  { value: 'BLACKLIST', label: 'Daftar Hitam' },
]
export const GENDERS = [
  { value: 'LAKI_LAKI', label: 'Laki-laki' },
  { value: 'PEREMPUAN', label: 'Perempuan' },
]
export const LEGAL_TYPES = ['PT', 'CV', 'FIRMA', 'KOPERASI', 'YAYASAN', 'PERKUMPULAN', 'LAINNYA']
export const IDENTITY_TYPES = [
  { value: 'KTP', label: 'KTP' },
  { value: 'NPWP', label: 'NPWP' },
  { value: 'PASPOR', label: 'Paspor' },
  { value: 'KITAS', label: 'KITAS/KITAP' },
  { value: 'SIM', label: 'SIM' },
  { value: 'KK', label: 'Kartu Keluarga' },
  { value: 'LAINNYA', label: 'Lainnya' },
]

export const TRANSACTION_TYPES = [
  { value: 'NOTARIS', label: 'Notaris' },
  { value: 'PPAT', label: 'PPAT' },
]

export const PPAT_SERVICE_TYPES = [
  { value: 'AJB', label: 'Akta Jual Beli (AJB)' },
  { value: 'APHT', label: 'Akta Pemberian Hak Tanggungan (APHT)' },
  { value: 'SKMHT', label: 'Surat Kuasa Membebankan Hak Tanggungan (SKMHT)' },
  { value: 'HIBAH', label: 'Hibah' },
  { value: 'APHB', label: 'Akta Pembagian Hak Bersama (APHB)' },
  { value: 'TUKAR_MENUKAR', label: 'Tukar Menukar' },
  { value: 'PEMASUKAN_PERUSAHAAN', label: 'Pemasukan ke dalam Perusahaan' },
  { value: 'LAINNYA', label: 'Layanan Lainnya' },
]

export const WORKFLOW_STATUSES = [
  'REGISTRASI_KLIEN',
  'REGISTRASI_TRANSAKSI',
  'UPLOAD_DOKUMEN',
  'VERIFIKASI',
  'DRAFT',
  'REVIEW',
  'APPROVAL',
  'PENJADWALAN',
  'PENANDATANGANAN',
  'PENCATATAN_AKTA',
  'PENGARSIPAN',
  'PEMBAYARAN',
  'SERAH_TERIMA',
  'SELESAI',
  'BATAL',
] as const
export type WorkflowStatus = (typeof WORKFLOW_STATUSES)[number]

export const WORKFLOW_LABELS: Record<string, string> = {
  REGISTRASI_KLIEN: 'Registrasi Klien',
  REGISTRASI_TRANSAKSI: 'Registrasi Transaksi',
  UPLOAD_DOKUMEN: 'Upload Dokumen',
  VERIFIKASI: 'Verifikasi',
  DRAFT: 'Pembuatan Draft',
  REVIEW: 'Review Notaris/PPAT',
  APPROVAL: 'Approval',
  PENJADWALAN: 'Penjadwalan',
  PENANDATANGANAN: 'Penandatanganan',
  PENCATATAN_AKTA: 'Pencatatan Akta',
  PENGARSIPAN: 'Pengarsipan',
  PEMBAYARAN: 'Pembayaran',
  SERAH_TERIMA: 'Serah Terima',
  SELESAI: 'Selesai',
  BATAL: 'Dibatalkan',
}

export const WORKFLOW_TRANSITIONS: Record<string, string[]> = {
  REGISTRASI_KLIEN: ['REGISTRASI_TRANSAKSI', 'BATAL'],
  REGISTRASI_TRANSAKSI: ['UPLOAD_DOKUMEN', 'BATAL'],
  UPLOAD_DOKUMEN: ['VERIFIKASI', 'BATAL'],
  VERIFIKASI: ['DRAFT', 'UPLOAD_DOKUMEN', 'BATAL'],
  DRAFT: ['REVIEW', 'BATAL'],
  REVIEW: ['APPROVAL', 'DRAFT', 'BATAL'],
  APPROVAL: ['PENJADWALAN', 'DRAFT', 'BATAL'],
  PENJADWALAN: ['PENANDATANGANAN', 'BATAL'],
  PENANDATANGANAN: ['PENCATATAN_AKTA', 'BATAL'],
  PENCATATAN_AKTA: ['PENGARSIPAN', 'BATAL'],
  PENGARSIPAN: ['PEMBAYARAN', 'BATAL'],
  PEMBAYARAN: ['SERAH_TERIMA', 'BATAL'],
  SERAH_TERIMA: ['SELESAI', 'BATAL'],
  SELESAI: [],
  BATAL: [],
}

export const DEED_STATUSES = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'REVIEW', label: 'Review' },
  { value: 'APPROVED', label: 'Disetujui' },
  { value: 'SIGNED', label: 'Ditandatangani' },
  { value: 'REGISTERED', label: 'Tercatat' },
  { value: 'ARCHIVED', label: 'Diarsipkan' },
  { value: 'CANCELLED', label: 'Dibatalkan' },
]
export const DEED_STATUS_LABELS: Record<string, string> = Object.fromEntries(
  DEED_STATUSES.map((s) => [s.value, s.label]),
)
export const DEED_STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['REVIEW', 'CANCELLED'],
  REVIEW: ['APPROVED', 'DRAFT', 'CANCELLED'],
  APPROVED: ['SIGNED', 'CANCELLED'],
  SIGNED: ['REGISTERED'],
  REGISTERED: ['ARCHIVED'],
  ARCHIVED: [],
  CANCELLED: [],
}
/** Status akta yang dikunci: tidak boleh diubah isinya secara diam-diam. */
export const DEED_LOCKED_STATUSES = ['SIGNED', 'REGISTERED', 'ARCHIVED']

export const DEED_PARTY_ROLES = [
  { value: 'PENGHADAP', label: 'Penghadap' },
  { value: 'PENJUAL', label: 'Penjual' },
  { value: 'PEMBELI', label: 'Pembeli' },
  { value: 'PEMBERI_HAK', label: 'Pemberi Hak' },
  { value: 'PENERIMA_HAK', label: 'Penerima Hak' },
  { value: 'SAKSI', label: 'Saksi' },
  { value: 'KUASA', label: 'Kuasa' },
  { value: 'LAINNYA', label: 'Lainnya' },
]

export const RIGHT_TYPES = [
  { value: 'HAK_MILIK', label: 'Hak Milik (HM)' },
  { value: 'HAK_GUNA_BANGUNAN', label: 'Hak Guna Bangunan (HGB)' },
  { value: 'HAK_GUNA_USAHA', label: 'Hak Guna Usaha (HGU)' },
  { value: 'HAK_PAKAI', label: 'Hak Pakai (HP)' },
  { value: 'HAK_PENGELOLAAN', label: 'Hak Pengelolaan (HPL)' },
  { value: 'HAK_ADAT', label: 'Hak Adat' },
  { value: 'LAINNYA', label: 'Lainnya' },
]

export const DOCUMENT_CATEGORIES = [
  { code: 'KTP', name: 'KTP', description: 'Kartu Tanda Penduduk' },
  { code: 'NPWP', name: 'NPWP', description: 'Nomor Pokok Wajib Pajak' },
  { code: 'PASPOR', name: 'Paspor', description: 'Dokumen perjalanan' },
  { code: 'KK', name: 'Kartu Keluarga', description: 'Kartu Keluarga' },
  { code: 'SERTIFIKAT', name: 'Sertifikat Tanah', description: 'Sertifikat hak atas tanah' },
  { code: 'BUKU_NIKAH', name: 'Buku Nikah', description: 'Akta perkawinan / buku nikah' },
  { code: 'AKTA_PENDIRIAN', name: 'Akta Pendirian', description: 'Akta pendirian badan hukum' },
  { code: 'LEGALITAS', name: 'Legalitas Perusahaan', description: 'NIB, SK Kemenkumham, izin usaha' },
  { code: 'DRAFT_AKTA', name: 'Draft Akta', description: 'Draft akta yang dihasilkan dari template' },
  { code: 'MINUTA', name: 'Minuta Akta', description: 'Minuta akta notaris' },
  { code: 'SALINAN', name: 'Salinan Akta', description: 'Salinan akta untuk klien' },
  { code: 'BUKTI_BAYAR', name: 'Bukti Pembayaran', description: 'Bukti transfer / kuitansi' },
  { code: 'INVOICE', name: 'Invoice', description: 'Dokumen tagihan' },
  { code: 'LAINNYA', name: 'Lainnya', description: 'Dokumen lain' },
]

export const INVOICE_ITEM_KINDS = [
  { value: 'JASA_NOTARIS', label: 'Jasa Notaris' },
  { value: 'JASA_PPAT', label: 'Jasa PPAT' },
  { value: 'ADMINISTRASI', label: 'Biaya Administrasi' },
  { value: 'PAJAK', label: 'Pajak Terkait Transaksi' },
  { value: 'LAINNYA', label: 'Lainnya' },
]
export const INVOICE_STATUSES = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'UNPAID', label: 'Belum Dibayar' },
  { value: 'PARTIAL', label: 'Dibayar Sebagian' },
  { value: 'PAID', label: 'Lunas' },
  { value: 'VOID', label: 'Dibatalkan' },
]
export const PAYMENT_METHODS = [
  { value: 'TUNAI', label: 'Tunai' },
  { value: 'TRANSFER', label: 'Transfer Bank' },
  { value: 'QRIS', label: 'QRIS' },
  { value: 'CEK', label: 'Cek/Bilyet Giro' },
  { value: 'LAINNYA', label: 'Lainnya' },
]
export const EXPENSE_CATEGORIES = [
  { value: 'OPERASIONAL', label: 'Operasional' },
  { value: 'GAJI', label: 'Gaji & Honor' },
  { value: 'SEWA', label: 'Sewa' },
  { value: 'UTILITAS', label: 'Listrik, Air, Internet' },
  { value: 'PERLENGKAPAN', label: 'Perlengkapan' },
  { value: 'PERPAJAKAN', label: 'Perpajakan' },
  { value: 'LAINNYA', label: 'Lainnya' },
]
export const APPOINTMENT_TYPES = [
  { value: 'KONSULTASI', label: 'Konsultasi' },
  { value: 'VERIFIKASI', label: 'Verifikasi Dokumen' },
  { value: 'PENANDATANGANAN', label: 'Penandatanganan' },
  { value: 'LAINNYA', label: 'Lainnya' },
]
export const APPOINTMENT_STATUSES = [
  { value: 'TERJADWAL', label: 'Terjadwal' },
  { value: 'SELESAI', label: 'Selesai' },
  { value: 'DIBATALKAN', label: 'Dibatalkan' },
]
export const TASK_STATUSES = [
  { value: 'TODO', label: 'Belum Mulai' },
  { value: 'IN_PROGRESS', label: 'Dikerjakan' },
  { value: 'DONE', label: 'Selesai' },
  { value: 'CANCELLED', label: 'Dibatalkan' },
]
export const DEADLINE_TYPES = [
  { value: 'SKMHT', label: 'Jatuh Tempo SKMHT' },
  { value: 'PENDAFTARAN', label: 'Pendaftaran' },
  { value: 'PERPANJANGAN', label: 'Perpanjangan' },
  { value: 'PEMBAYARAN', label: 'Pembayaran' },
  { value: 'LAINNYA', label: 'Lainnya' },
]
export const DEADLINE_STATUSES = [
  { value: 'AKTIF', label: 'Aktif' },
  { value: 'SELESAI', label: 'Selesai' },
  { value: 'TERLAMBAT', label: 'Terlambat' },
  { value: 'DIBATALKAN', label: 'Dibatalkan' },
]

export const PRIORITIES = [
  { value: 'RENDAH', label: 'Rendah' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'TINGGI', label: 'Tinggi' },
]

export function labelOf(list: { value: string; label: string }[], value?: string | null): string {
  if (!value) return '—'
  return list.find((x) => x.value === value)?.label ?? value
}
