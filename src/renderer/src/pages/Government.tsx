import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader, Tabs } from '@/components/ui'
import type { SessionInfo } from '@/types'
import { DashboardTab } from './government/DashboardTab'
import { SubmissionsTab } from './government/SubmissionsTab'
import { DocumentsTab } from './government/DocumentsTab'
import { SyncLogsTab } from './government/SyncLogsTab'
import { ConfigTab } from './government/ConfigTab'

type GovTab =
  | 'dashboard'
  | 'ahu-pengajuan'
  | 'ahu-monitoring'
  | 'bpn-pengajuan'
  | 'bpn-monitoring'
  | 'dokumen'
  | 'sinkronisasi'
  | 'konfigurasi'

const TAB_KEYS: GovTab[] = [
  'dashboard', 'ahu-pengajuan', 'ahu-monitoring', 'bpn-pengajuan', 'bpn-monitoring',
  'dokumen', 'sinkronisasi', 'konfigurasi',
]

const TAB_SUBTITLES: Record<GovTab, string> = {
  dashboard: 'Kondisi keseluruhan pengajuan ke AHU Online dan ATR/BPN dalam satu layar.',
  'ahu-pengajuan': 'Siapkan data, lampirkan berkas, lalu buka portal AHU Online untuk pengisian oleh petugas.',
  'ahu-monitoring': 'Pantau pengajuan AHU yang sudah berada di portal dan catat kembali nomor serta status resminya.',
  'bpn-pengajuan': 'Siapkan data layanan pertanahan, lampirkan berkas, lalu buka Aplikasi Mitra ATR/BPN.',
  'bpn-monitoring': 'Pantau pengajuan ATR/BPN yang berjalan dan catat hasil resmi dari portal.',
  dokumen: 'Seluruh berkas pengajuan pemerintah beserta checksum dan jejak pencatatannya.',
  sinkronisasi: 'Log append-only untuk setiap tindakan gateway: portal dibuka, nomor dicatat, status berubah.',
  konfigurasi: 'Mode integrasi, kredensial terenkripsi, dan status ketersediaan API resmi per instansi.',
}

export function Government({ session }: { session: SessionInfo }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const canManage = session.permissions.includes('government.manage')
  const canConfigure = session.permissions.includes('government.configure')

  const requested = params.get('tab') as GovTab | null
  const tab: GovTab = requested && TAB_KEYS.includes(requested) ? requested : 'dashboard'

  const tabs = useMemo(
    () => [
      { key: 'dashboard', label: 'Dashboard Integrasi' },
      { key: 'ahu-pengajuan', label: 'Pengajuan AHU' },
      { key: 'ahu-monitoring', label: 'Monitoring AHU' },
      { key: 'bpn-pengajuan', label: 'Pengajuan BPN' },
      { key: 'bpn-monitoring', label: 'Monitoring BPN' },
      { key: 'dokumen', label: 'Dokumen Pemerintah' },
      { key: 'sinkronisasi', label: 'Riwayat Sinkronisasi' },
      ...(canConfigure ? [{ key: 'konfigurasi', label: 'Konfigurasi Integrasi' }] : []),
    ],
    [canConfigure],
  )

  function openSubmission(id: string) {
    navigate(`/integrasi/${id}`)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Integrasi"
        title="Integrasi Pemerintah"
        subtitle={TAB_SUBTITLES[tab]}
      />

      <div className="card overflow-hidden">
        <Tabs
          className="px-4 pt-2"
          active={tab}
          onChange={(k) => {
            params.set('tab', k)
            setParams(params, { replace: true })
          }}
          tabs={tabs}
        />
        <div className="p-4">
          {tab === 'dashboard' && <DashboardTab onOpenSubmission={openSubmission} />}
          {tab === 'ahu-pengajuan' && <SubmissionsTab agency="AHU" view="PERSIAPAN" canManage={canManage} onOpen={openSubmission} />}
          {tab === 'ahu-monitoring' && <SubmissionsTab agency="AHU" view="BERJALAN" canManage={false} onOpen={openSubmission} />}
          {tab === 'bpn-pengajuan' && <SubmissionsTab agency="BPN" view="PERSIAPAN" canManage={canManage} onOpen={openSubmission} />}
          {tab === 'bpn-monitoring' && <SubmissionsTab agency="BPN" view="BERJALAN" canManage={false} onOpen={openSubmission} />}
          {tab === 'dokumen' && <DocumentsTab />}
          {tab === 'sinkronisasi' && <SyncLogsTab />}
          {tab === 'konfigurasi' && canConfigure && <ConfigTab session={session} />}
        </div>
      </div>
    </div>
  )
}
