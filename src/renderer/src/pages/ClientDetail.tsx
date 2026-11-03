import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Briefcase, Building2, FileSignature, FolderOpen, Pencil, Receipt, UserRound,
} from 'lucide-react'
import { useQuery } from '@/api'
import type { SessionInfo } from '@/types'
import {
  Alert, Badge, Button, Card, DataTable, DescriptionList, EmptyState, Money, PageHeader,
  SectionTitle, StatusBadge, Tabs,
} from '@/components/ui'
import {
  CLIENT_TYPES, IDENTITY_TYPES, labelOf,
} from '@shared/constants'
import { formatDate, formatDateTime, formatRupiah } from '@shared/format'

export function ClientDetail({ session }: { session: SessionInfo }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState('ringkasan')
  const { data, loading, error } = useQuery<any>('clients.get', { id })

  if (loading && !data) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-slate-500">Memuat data klien…</div>
    )
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => navigate('/klien')}><ArrowLeft className="h-4 w-4" /> Kembali</Button>
        <Alert tone="danger" title="Klien tidak dapat dimuat">{error ?? 'Data klien tidak ditemukan.'}</Alert>
      </div>
    )
  }

  const client = data
  const isCompany = client.type === 'BADAN_HUKUM'
  const canManage = session.permissions.includes('clients.manage')

  return (
    <div className="space-y-5">
      <Link to="/klien" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-navy-800 dark:text-slate-400 dark:hover:text-slate-200">
        <ArrowLeft className="h-3.5 w-3.5" /> Daftar Klien
      </Link>

      <PageHeader
        eyebrow={`${client.code} · Terdaftar ${formatDate(client.createdAt)}`}
        title={client.company?.companyName ?? client.fullName}
        subtitle={client.email ?? client.phone ?? undefined}
        actions={
          <>
            <StatusBadge status={client.status} label={client.status === 'AKTIF' ? 'Aktif' : client.status === 'NONAKTIF' ? 'Nonaktif' : 'Daftar Hitam'} />
            <Badge tone={isCompany ? 'blue' : 'neutral'}>
              {isCompany ? <Building2 className="mr-1 h-3 w-3" /> : <UserRound className="mr-1 h-3 w-3" />}
              {labelOf(CLIENT_TYPES, client.type)}
            </Badge>
            {canManage && (
              <Button variant="secondary" onClick={() => navigate(`/klien?edit=${client.id}`)}>
                <Pencil className="h-4 w-4" /> Ubah
              </Button>
            )}
            {canManage && session.permissions.includes('transactions.manage') && (
              <Button variant="gold" onClick={() => navigate(`/transaksi?new=1&clientId=${client.id}`)}>
                <Briefcase className="h-4 w-4" /> Transaksi Baru
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <SectionTitle title="Identitas Klien" subtitle="Data utama yang tercatat pada kantor" />
          <DescriptionList
            columns={2}
            items={[
              { label: isCompany ? 'Nama Badan Hukum' : 'Nama Lengkap', value: client.fullName },
              { label: 'Kode Klien', value: <span className="font-mono text-xs">{client.code}</span> },
              { label: 'NIK', value: client.nik ?? '—' },
              { label: 'NPWP', value: client.npwp ?? '—' },
              ...(isCompany
                ? [
                    { label: 'Bentuk Badan', value: client.company?.legalType ?? '—' },
                    { label: 'NIB', value: client.company?.nib ?? '—' },
                  ]
                : [
                    { label: 'Tempat / Tanggal Lahir', value: [client.birthPlace, client.birthDate ? formatDate(client.birthDate) : null].filter(Boolean).join(', ') || '—' },
                    { label: 'Jenis Kelamin', value: client.gender === 'LAKI_LAKI' ? 'Laki-laki' : client.gender === 'PEREMPUAN' ? 'Perempuan' : '—' },
                    { label: 'Pekerjaan', value: client.occupation ?? '—' },
                  ]),
              { label: 'Telepon', value: client.phone ?? '—' },
              { label: 'Email', value: client.email ?? '—' },
            ]}
          />
          <div className="mt-6">
            <SectionTitle title="Alamat" />
            <DescriptionList
              columns={2}
              items={[
                { label: 'Alamat', value: client.address ?? '—' },
                { label: 'Kelurahan / Desa', value: client.kelurahan ?? '—' },
                { label: 'Kecamatan', value: client.kecamatan ?? '—' },
                { label: 'Kabupaten / Kota', value: client.kabupaten ?? '—' },
                { label: 'Provinsi', value: client.provinsi ?? '—' },
                { label: 'Kode Pos', value: client.postalCode ?? '—' },
              ]}
            />
          </div>
          {client.internalNotes && (
            <div className="mt-6">
              <SectionTitle title="Catatan Internal" />
              <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-600 dark:bg-navy-900 dark:text-slate-300">{client.internalNotes}</p>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle title="Ringkasan Aktivitas" />
            <div className="space-y-3 text-sm">
              <SummaryRow icon={<Briefcase className="h-4 w-4" />} label="Transaksi" value={client.transactions?.length ?? 0} />
              <SummaryRow icon={<FileSignature className="h-4 w-4" />} label="Akta" value={client.deeds?.length ?? 0} />
              <SummaryRow icon={<Receipt className="h-4 w-4" />} label="Invoice" value={client.invoices?.length ?? 0} />
              <SummaryRow icon={<FolderOpen className="h-4 w-4" />} label="Dokumen" value={client.documents?.length ?? 0} />
            </div>
          </Card>
          <Card className="p-5">
            <SectionTitle title="Aksi Cepat" />
            <div className="grid gap-2">
              {session.permissions.includes('deeds.manage') && (
                <Button variant="secondary" onClick={() => navigate(`/akta?new=1&clientId=${client.id}`)}>
                  <FileSignature className="h-4 w-4" /> Buat Akta
                </Button>
              )}
              {session.permissions.includes('finance.manage') && (
                <Button variant="secondary" onClick={() => navigate(`/keuangan?new=1&clientId=${client.id}`)}>
                  <Receipt className="h-4 w-4" /> Buat Invoice
                </Button>
              )}
              {session.permissions.includes('documents.manage') && (
                <Button variant="secondary" onClick={() => navigate(`/dokumen?upload=1&clientId=${client.id}`)}>
                  <FolderOpen className="h-4 w-4" /> Unggah Dokumen
                </Button>
              )}
            </div>
          </Card>
          <Card className="p-5 text-xs text-slate-500 dark:text-slate-400">
            <p className="font-semibold text-navy-900 dark:text-slate-200">Jejak perubahan</p>
            <p className="mt-1 leading-relaxed">Setiap perubahan data klien dicatat pada Audit Log beserta pengguna, waktu, dan nilai sebelum/sesudah.</p>
            {session.permissions.includes('audit.view') && (
              <Link to="/audit" className="mt-2 inline-block font-semibold text-gold-600 hover:underline dark:text-gold-400">Buka Audit Log →</Link>
            )}
          </Card>
        </div>
      </div>

      {isCompany && (
        <Card className="p-5">
          <SectionTitle title="Data Badan Hukum & Legalitas" subtitle="Akta pendirian, pengurus, dan pemegang saham" />
          <DescriptionList
            columns={3}
            items={[
              { label: 'Nama Perusahaan', value: client.company?.companyName ?? '—' },
              { label: 'Bentuk Badan Hukum', value: client.company?.legalType ?? '—' },
              { label: 'NPWP Perusahaan', value: client.company?.companyNpwp ?? '—' },
              { label: 'Nomor Akta Pendirian', value: client.company?.establishmentDeedNumber ?? '—' },
              { label: 'Tanggal Akta Pendirian', value: client.company?.establishmentDeedDate ? formatDate(client.company.establishmentDeedDate) : '—' },
              { label: 'Notaris Pendiri', value: client.company?.establishmentNotary ?? '—' },
              { label: 'Kedudukan', value: client.company?.domicile ?? '—' },
              { label: 'NIB', value: client.company?.nib ?? '—' },
            ]}
          />
          {(client.company?.pengurusJson || client.company?.shareholdersJson) && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {client.company?.pengurusJson && (
                <div>
                  <p className="field-label">Pengurus</p>
                  <pre className="max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed dark:bg-navy-900">{client.company.pengurusJson}</pre>
                </div>
              )}
              {client.company?.shareholdersJson && (
                <div>
                  <p className="field-label">Pemegang Saham</p>
                  <pre className="max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed dark:bg-navy-900">{client.company.shareholdersJson}</pre>
                </div>
              )}
            </div>
          )}
          {client.company?.legalityNotes && (
            <p className="mt-4 whitespace-pre-wrap text-xs leading-relaxed text-slate-500 dark:text-slate-400">{client.company.legalityNotes}</p>
          )}
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="px-4 pt-3">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { key: 'ringkasan', label: 'Identitas Tambahan', count: client.identities?.length ?? 0 },
              { key: 'transaksi', label: 'Transaksi', count: client.transactions?.length ?? 0 },
              { key: 'akta', label: 'Akta', count: client.deeds?.length ?? 0 },
              { key: 'invoice', label: 'Invoice', count: client.invoices?.length ?? 0 },
              { key: 'dokumen', label: 'Dokumen', count: client.documents?.length ?? 0 },
            ]}
          />
        </div>

        {tab === 'ringkasan' && (
          <DataTable
            rows={client.identities ?? []}
            columns={[
              { key: 'docType', header: 'Jenis Identitas', render: (r) => labelOf(IDENTITY_TYPES, r.docType) },
              { key: 'number', header: 'Nomor', render: (r) => <span className="font-mono text-xs">{r.number ?? '—'}</span> },
              { key: 'issuedAt', header: 'Terbit', render: (r) => (r.issuedAt ? formatDate(r.issuedAt) : '—') },
              { key: 'expiresAt', header: 'Berlaku s.d.', render: (r) => (r.expiresAt ? formatDate(r.expiresAt) : '—') },
              { key: 'document', header: 'Dokumen', render: (r) => (r.document?.title ? <Badge tone="green">Terlampir</Badge> : <Badge tone="gray">Belum ada</Badge>) },
              { key: 'notes', header: 'Catatan', render: (r) => r.notes ?? '—' },
            ]}
            empty={<EmptyState compact title="Belum ada identitas tambahan" description="Tambahkan KTP, NPWP, paspor, atau identitas lain melalui menu Ubah." />}
          />
        )}

        {tab === 'transaksi' && (
          <DataTable
            rows={client.transactions ?? []}
            virtualize
            onRowClick={(r) => navigate(`/transaksi/${r.id}`)}
            columns={[
              { key: 'code', header: 'Kode', render: (r) => <span className="font-mono text-xs">{r.code}</span> },
              { key: 'title', header: 'Judul Transaksi' },
              { key: 'type', header: 'Jenis', render: (r) => <Badge tone={r.type === 'PPAT' ? 'blue' : 'gold'}>{r.type}</Badge> },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'createdAt', header: 'Dibuat', render: (r) => formatDate(r.createdAt) },
            ]}
            empty={<EmptyState compact title="Belum ada transaksi" />}
          />
        )}

        {tab === 'akta' && (
          <DataTable
            rows={client.deeds ?? []}
            virtualize
            onRowClick={(r) => navigate(`/akta/${r.id}`)}
            columns={[
              { key: 'deedNumber', header: 'Nomor Akta', render: (r) => <span className="font-mono text-xs">{r.deedNumber}</span> },
              { key: 'type', header: 'Jenis Akta', render: (r) => r.deedType?.name ?? '—' },
              { key: 'deedDate', header: 'Tanggal', render: (r) => formatDate(r.deedDate) },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            ]}
            empty={<EmptyState compact title="Belum ada akta" />}
          />
        )}

        {tab === 'invoice' && (
          <DataTable
            rows={client.invoices ?? []}
            virtualize
            onRowClick={(r) => navigate(`/keuangan/invoice/${r.id}`)}
            columns={[
              { key: 'number', header: 'Invoice', render: (r) => <span className="font-mono text-xs">{r.number}</span> },
              { key: 'issueDate', header: 'Tanggal Terbit', render: (r) => formatDate(r.issueDate) },
              { key: 'total', header: 'Total', align: 'right', render: (r) => <Money value={r.total} /> },
              { key: 'paidAmount', header: 'Dibayar', align: 'right', render: (r) => <Money value={r.paidAmount} /> },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            ]}
            empty={<EmptyState compact title="Belum ada invoice" />}
          />
        )}

        {tab === 'dokumen' && (
          <DataTable
            rows={client.documents ?? []}
            virtualize
            columns={[
              { key: 'title', header: 'Judul Dokumen' },
              { key: 'category', header: 'Kategori', render: (r) => r.category?.name ?? '—' },
              { key: 'fileName', header: 'Berkas', render: (r) => <span className="font-mono text-[11px]">{r.fileName}</span> },
              { key: 'createdAt', header: 'Diunggah', render: (r) => formatDateTime(r.createdAt) },
            ]}
            empty={<EmptyState compact title="Belum ada dokumen" />}
          />
        )}
      </Card>

      <p className="text-[11px] text-slate-400">Total nilai invoice: {formatRupiah((client.invoices ?? []).reduce((s: number, i: any) => s + (i.total ?? 0), 0))}</p>
    </div>
  )
}

function SummaryRow({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-slate-500 dark:text-slate-400">{icon}{label}</span>
      <b className="text-navy-900 dark:text-white">{value}</b>
    </div>
  )
}
