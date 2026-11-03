import { GOVERNMENT_OFFICIAL_PORTALS } from '../../../../shared/government'
import type { GovernmentAdapter } from '../types'

const COMMON_BPN = [
  'Data objek tanah (nomor sertifikat, luas, letak)',
  'Identitas dan NPWP para pihak',
  'Dokumen PPAT yang menjadi dasar permohonan',
]

const CHECKLISTS: Record<string, string[]> = {
  BPN_PENGECEKAN_SERTIFIKAT: [...COMMON_BPN, 'Surat kuasa pemeriksaan bila diperlukan', 'Bukti pembayaran PNBP pengecekan'],
  BPN_SKPT: [...COMMON_BPN, 'Formulir permohonan SKPT', 'Identitas pemohon'],
  BPN_BALIK_NAMA: [
    ...COMMON_BPN,
    'Akta peralihan (AJB/APHB/Hibah/Wasiat)',
    'Sertifikat asli atas nama pemegang hak lama',
    'Bukti pembayaran BPHTB dan PPh final',
    'Izin perubahan penggunaan tanah bila diperlukan',
  ],
  BPN_APHT: [...COMMON_BPN, 'Akta APHT dan SKMHT', 'Sertifikat hak asal', 'Identitas pemberi dan pemegang hak tanggungan'],
  BPN_ROYA: [...COMMON_BPN, 'Surat keterangan Roya/lunas dari pemegang hak tanggungan', 'Sertifikat hak tanggungan'],
  BPN_HGB_PERPANJANGAN: [...COMMON_BPN, 'SK penetapan dan penghitungan ulang HGB', 'Izin lokasi atau dokumen yang mendasari perpanjangan'],
  BPN_PEMECAHAN: [...COMMON_BPN, 'Peta bidang dan ukur tanah', 'Setuju pemegang hak dan SPPT/PBB'],
  BPN_PENGGABUNGAN: [...COMMON_BPN, 'Sertifikat-sertifikat yang digabung', 'Peta bidang gabungan'],
}

export const bpnAdapter: GovernmentAdapter = {
  agency: 'BPN',
  label: 'Aplikasi Mitra — Kementerian ATR/BPN',
  portalUrl: GOVERNMENT_OFFICIAL_PORTALS.BPN,
  officialApiAvailable: false,
  automatedSubmission: false,
  checklist(serviceCode) {
    return CHECKLISTS[serviceCode] ?? [...COMMON_BPN, 'Sesuai persyaratan layanan ATR/BPN yang dipilih']
  },
  note() {
    return 'Layanan pertanahan elektronik diajukan PPAT terdaftar pada Aplikasi Mitra ATR/BPN. NOTARIS PRO menyimpan nomor berkas, status, tanda terima, dan hasil layanan; tidak mengambil data sendiri dari portal.'
  },
}
