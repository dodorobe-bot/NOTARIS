import { GOVERNMENT_OFFICIAL_PORTALS } from '../../../../shared/government'
import type { GovernmentAdapter } from '../types'

const COMMON_AHU = [
  'Data pemohon dan identitas lengkap',
  'Akta notaris dan surat keputusan terkait',
  'Bukti pembayaran PNBP bila layanan dikenakan biaya',
]

const CHECKLISTS: Record<string, string[]> = {
  AHU_PENDIRIAN_PT: [
    ...COMMON_AHU,
    'Nama dan kedudukan perseroan',
    'Modal dasar, disetor, dan penanggung',
    'Data direksi dan dewan komisaris',
    'Data pemegang saham beserta besaran saham',
  ],
  AHU_PERUBAHAN_PT: [
    ...COMMON_AHU,
    'Nomor dan tanggal SK pengesahan sebelumnya',
    'Akta perubahan beserta ratione notaris',
    'Susunan pengurus dan pemodal setelah perubahan',
  ],
  AHU_PENDIRIAN_CV: [...COMMON_AHU, 'Nama dan alamat persekutuan', 'Data sekutu aktif dan sekutu pasif', 'Modal setor sekutu'],
  AHU_PERUBAHAN_CV: [...COMMON_AHU, 'Data pendaftaran sebelumnya', 'Akta perubahan persekutuan'],
  AHU_PENDIRIAN_YAYASAN: [...COMMON_AHU, 'Nama dan kedudukan yayasan', 'Pembina, pengurus, dan pengawas', 'Awak yayasan'],
  AHU_PERUBAHAN_YAYASAN: [...COMMON_AHU, 'Nomor SK pengesahan yayasan', 'Akta perubahan dan organ setelah perubahan'],
  AHU_PENDIRIAN_KOPERASI: [...COMMON_AHU, 'Nama dan alamat koperasi', 'Daftar anggota pendiri', 'Anggaran dasar dan RAT pembentukan'],
  AHU_LEGALISASI: [...COMMON_AHU, 'Salinan akta yang dilegalisasi', 'Lampiran dokumen pendukung'],
  AHU_SALINAN_AKTA: [...COMMON_AHU, 'Nomor, tanggal, dan jenis akta', 'Identitas pemohon salinan'],
}

export const ahuAdapter: GovernmentAdapter = {
  agency: 'AHU',
  label: 'AHU Online — Kementerian Hukum',
  portalUrl: GOVERNMENT_OFFICIAL_PORTALS.AHU,
  officialApiAvailable: false,
  automatedSubmission: false,
  checklist(serviceCode) {
    return CHECKLISTS[serviceCode] ?? [...COMMON_AHU, 'Sesuai persyaratan layanan AHU yang dipilih']
  },
  note() {
    return 'Pengajuan badan usaha dan layanan kenotariatan dilakukan notaris/PPAT pada portal resmi AHU. NOTARIS PRO hanya menyiapkan data, membuka portal, lalu menyimpan nomor dan bukti yang dicatat operator.'
  },
}
