import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Ban, Download, FileText, Pencil, Plus, Send, Wallet,
} from 'lucide-react'
import { call, useQuery } from '@/api'
import type { SessionInfo } from '@/types'
import {
  Alert, Badge, Button, Card, CurrencyInput, DataTable, Field, Input, Modal, PageHeader,
  SectionTitle, Select, StatusBadge, Textarea, useToast,
} from '@/components/ui'
import { INVOICE_STATUSES, PAYMENT_METHODS, labelOf } from '@shared/constants'
import { formatDate, formatDateTime, formatRupiah, toDateInput, toDateTimeInput } from '@shared/format'

export function InvoiceDetail({ session }: { session: SessionInfo }) {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const canManage = session.permissions.includes('finance.manage')
  const query = useQuery<any>('invoices.get', { id }, { enabled: !!id })
  const invoice = query.data

  const [payOpen, setPayOpen] = useState(false)
  const [payForm, setPayForm] = useState({ amount: 0, method: 'TRANSFER', paidAt: toDateTimeInput(new Date()), reference: '', notes: '' })
  const [payError, setPayError] = useState<string | null>(null)
  const [payBusy, setPayBusy] = useState(false)

  const [voidOpen, setVoidOpen] = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voidBusy, setVoidBusy] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)

  const remaining = invoice ? Math.max(0, invoice.total - invoice.paidAmount) : 0

  function openPayment() {
    setPayForm({ amount: remaining, method: 'TRANSFER', paidAt: toDateTimeInput(new Date()), reference: '', notes: '' })
    setPayError(null)
    setPayOpen(true)
  }

  async function savePayment() {
    if (!invoice) return
    if (Number(payForm.amount) < 1) return setPayError('Jumlah pembayaran wajib lebih dari nol.')
    if (Number(payForm.amount) > remaining) return setPayError(`Pembayaran melebihi sisa tagihan (${formatRupiah(remaining)}).`)
    if (!payForm.paidAt) return setPayError('Tanggal pembayaran wajib diisi.')
    setPayBusy(true)
    setPayError(null)
    try {
      await call('payments.create', {
        invoiceId: invoice.id,
        amount: Number(payForm.amount),
        method: payForm.method,
        paidAt: payForm.paidAt,
        reference: payForm.reference.trim() || null,
        notes: payForm.notes.trim() || null,
      })
      toast.success(`Pembayaran ${formatRupiah(Number(payForm.amount))} dicatat.`)
      setPayOpen(false)
      await query.reload(true)
    } catch (err) {
      setPayError((err as Error).message)
    } finally {
      setPayBusy(false)
    }
  }

  async function issueInvoice() {
    if (!invoice) return
    setActionBusy(true)
    try {
      await call('invoices.update', {
        id: invoice.id,
        clientId: invoice.clientId,
        transactionId: invoice.transactionId ?? null,
        deedId: invoice.deedId ?? null,
        issueDate: toDateInput(invoice.issueDate),
        dueDate: toDateInput(invoice.dueDate) || null,
        discount: invoice.discount,
        taxPercent: invoice.taxPercent,
        notes: invoice.notes ?? null,
        status: 'UNPAID',
        items: invoice.items.map((it: any) => ({
          kind: it.kind, description: it.description, quantity: it.quantity, unitPrice: it.unitPrice,
        })),
      })
      toast.success('Invoice diterbitkan.')
      await query.reload(true)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setActionBusy(false)
    }
  }

  async function confirmVoid() {
    if (!invoice) return
    if (voidReason.trim().length < 3) return toast.error('Alasan pembatalan minimal 3 karakter.')
    setVoidBusy(true)
    try {
      await call('invoices.void', { id: invoice.id, reason: voidReason.trim() })
      toast.success('Invoice dibatalkan.')
      setVoidOpen(false)
      setVoidReason('')
      await query.reload(true)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setVoidBusy(false)
    }
  }

  async function exportPdf() {
    if (!invoice) return
    setExportBusy(true)
    try {
      const res = await call<{ fileName: string }>('invoices.exportPdf', { id: invoice.id })
      toast.success(`PDF disimpan: ${res.fileName}`)
      await call('app.openFolder', { target: 'exports' }).catch(() => undefined)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setExportBusy(false)
    }
  }

  if (query.error) {
    return (
      <div className="space-y-4">
        <Button variant="secondary" onClick={() => navigate('/keuangan')}><ArrowLeft className="h-4 w-4" /> Kembali</Button>
        <Alert tone="danger" title="Gagal memuat invoice">{query.error}</Alert>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200 dark:bg-navy-800" />
        <Card className="h-40 animate-pulse"><div /></Card>
      </div>
    )
  }

  const paymentsCount = invoice.payments?.length ?? 0
  const canVoid = canManage && invoice.status !== 'VOID' && paymentsCount === 0
  const canPay = canManage && (invoice.status === 'UNPAID' || invoice.status === 'PARTIAL')
  const canEdit = canManage && invoice.status !== 'VOID' && paymentsCount === 0

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Keuangan · Invoice"
        title={invoice.number}
        subtitle={`${invoice.client?.fullName ?? '—'} · diterbitkan ${formatDate(invoice.issueDate)}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/keuangan')}><ArrowLeft className="h-4 w-4" /> Kembali</Button>
            <Button variant="secondary" onClick={() => void exportPdf()} loading={exportBusy}><Download className="h-4 w-4" /> Ekspor PDF</Button>
            {canEdit && (
              <Button variant="secondary" onClick={() => navigate(`/keuangan?edit=${invoice.id}`)}><Pencil className="h-4 w-4" /> Ubah</Button>
            )}
            {canManage && invoice.status === 'DRAFT' && (
              <Button variant="gold" onClick={() => void issueInvoice()} loading={actionBusy}><Send className="h-4 w-4" /> Terbitkan</Button>
            )}
            {canPay && (
              <Button variant="gold" onClick={openPayment}><Plus className="h-4 w-4" /> Catat Pembayaran</Button>
            )}
            {canVoid && (
              <Button variant="danger" onClick={() => { setVoidReason(''); setVoidOpen(true) }}><Ban className="h-4 w-4" /> Batalkan</Button>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={invoice.status} />
        {invoice.status === 'DRAFT' && <Badge tone="amber">Belum diterbitkan — pembayaran belum dapat dicatat</Badge>}
        {invoice.status === 'VOID' && <Badge tone="red">Invoice dibatalkan</Badge>}
        {invoice.status !== 'VOID' && remaining > 0 && (
          <Badge tone="gold">Sisa tagihan {formatRupiah(remaining)}</Badge>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <SectionTitle title="Rincian Tagihan" subtitle={`${invoice.items?.length ?? 0} item`} />
          <DataTable
            rows={invoice.items ?? []}
            virtualize
            columns={[
              { key: 'kind', header: 'Jenis', render: (r) => labelOf(
                [{ value: 'JASA_NOTARIS', label: 'Jasa Notaris' }, { value: 'JASA_PPAT', label: 'Jasa PPAT' }, { value: 'ADMINISTRASI', label: 'Administrasi' }, { value: 'PAJAK', label: 'Pajak' }, { value: 'LAINNYA', label: 'Lainnya' }],
                r.kind,
              ) },
              { key: 'description', header: 'Deskripsi', render: (r) => <span className="font-medium">{r.description}</span> },
              { key: 'quantity', header: 'Qty', align: 'right' },
              { key: 'unitPrice', header: 'Harga', align: 'right', render: (r) => formatRupiah(r.unitPrice) },
              { key: 'amount', header: 'Jumlah', align: 'right', render: (r) => <span className="font-semibold">{formatRupiah(r.amount)}</span> },
            ]}
          />
          <div className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Subtotal</span><span>{formatRupiah(invoice.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Diskon</span><span>- {formatRupiah(invoice.discount)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">Pajak ({invoice.taxPercent}%)</span><span>{formatRupiah(invoice.taxAmount)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold text-navy-900 dark:border-navy-700 dark:text-white"><span>Total</span><span>{formatRupiah(invoice.total)}</span></div>
            <div className="flex justify-between text-emerald-700 dark:text-emerald-400"><span>Dibayar</span><span>{formatRupiah(invoice.paidAmount)}</span></div>
            <div className="flex justify-between font-bold text-gold-700 dark:text-gold-400"><span>Sisa</span><span>{formatRupiah(remaining)}</span></div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <SectionTitle title="Informasi Invoice" />
            <dl className="space-y-2.5 text-sm">
              <Row label="Klien">
                <Link className="font-medium text-navy-900 underline-offset-2 hover:underline dark:text-white" to={`/klien/${invoice.clientId}`}>
                  {invoice.client?.fullName ?? '—'}
                </Link>
                {invoice.client?.code && <span className="ml-1 text-[11px] text-slate-500 dark:text-slate-400">({invoice.client.code})</span>}
              </Row>
              <Row label="Tanggal Terbit">{formatDate(invoice.issueDate)}</Row>
              <Row label="Jatuh Tempo">
                <span className={invoice.status !== 'PAID' && invoice.status !== 'VOID' && new Date(invoice.dueDate).getTime() < Date.now() ? 'font-semibold text-red-600 dark:text-red-400' : ''}>
                  {formatDate(invoice.dueDate)}
                </span>
              </Row>
              <Row label="Transaksi">
                {invoice.transaction ? (
                  <Link className="text-navy-900 underline-offset-2 hover:underline dark:text-white" to={`/transaksi/${invoice.transaction.id}`}>
                    {invoice.transaction.code}
                  </Link>
                ) : '—'}
              </Row>
              <Row label="Akta">
                {invoice.deed ? (
                  <Link className="text-navy-900 underline-offset-2 hover:underline dark:text-white" to={`/akta/${invoice.deed.id}`}>
                    {invoice.deed.deedNumber ?? invoice.deed.title}
                  </Link>
                ) : '—'}
              </Row>
              <Row label="Dibuat Oleh">{invoice.createdBy?.fullName ?? '—'}</Row>
              <Row label="Status">{labelOf(INVOICE_STATUSES, invoice.status)}</Row>
            </dl>
            {invoice.notes && (
              <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:bg-navy-900/60 dark:text-slate-300">{invoice.notes}</p>
            )}
          </Card>

          <Card className="p-5">
            <SectionTitle title="Pembayaran" subtitle={`${paymentsCount} transaksi`} />
            {paymentsCount === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                <Wallet className="mx-auto mb-2 h-6 w-6 text-slate-400" />
                Belum ada pembayaran tercatat.
                {canPay && (
                  <div className="mt-3">
                    <Button variant="secondary" className="!py-1.5 text-xs" onClick={openPayment}><Plus className="h-3.5 w-3.5" /> Catat Pembayaran</Button>
                  </div>
                )}
              </div>
            ) : (
              <ul className="space-y-2">
                {invoice.payments.map((p: any) => (
                  <li key={p.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-navy-800">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-navy-900 dark:text-white">{formatRupiah(p.amount)}</span>
                      <Badge tone="green">{labelOf(PAYMENT_METHODS, p.method)}</Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {p.number} · {formatDateTime(p.paidAt)}
                    </p>
                    {(p.reference || p.receivedBy?.fullName) && (
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {p.reference ? `Ref: ${p.reference}` : ''}{p.reference && p.receivedBy?.fullName ? ' · ' : ''}{p.receivedBy?.fullName ?? ''}
                      </p>
                    )}
                    {p.notes && <p className="mt-1 text-[11px] italic text-slate-500 dark:text-slate-400">{p.notes}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <SectionTitle title="Berkas" subtitle="Unduhan dokumen tagihan" />
            <Button variant="secondary" className="w-full" onClick={() => void exportPdf()} loading={exportBusy}>
              <FileText className="h-4 w-4" /> Unduh Invoice PDF
            </Button>
            <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">PDF dibuat dari data tersimpan dan disimpan di folder ekspor aplikasi.</p>
          </Card>
        </div>
      </div>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Catat Pembayaran"
        subtitle={`${invoice.number} · sisa ${formatRupiah(remaining)}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPayOpen(false)} disabled={payBusy}>Batal</Button>
            <Button variant="gold" onClick={() => void savePayment()} loading={payBusy}>Simpan Pembayaran</Button>
          </>
        }
      >
        <div className="space-y-3">
          {payError && <Alert tone="danger">{payError}</Alert>}
          <Field label="Jumlah (Rp)" required hint={`Maksimal ${formatRupiah(remaining)}`}>
            <CurrencyInput value={payForm.amount} onChange={(v) => setPayForm((f) => ({ ...f, amount: v }))} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Metode" required>
              <Select value={payForm.method} onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}>
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            </Field>
            <Field label="Tanggal & Waktu" required>
              <Input type="datetime-local" value={payForm.paidAt} onChange={(e) => setPayForm((f) => ({ ...f, paidAt: e.target.value }))} />
            </Field>
          </div>
          <Field label="Referensi">
            <Input value={payForm.reference} onChange={(e) => setPayForm((f) => ({ ...f, reference: e.target.value }))} placeholder="Nomor transfer / cek" />
          </Field>
          <Field label="Catatan">
            <Textarea value={payForm.notes} onChange={(e) => setPayForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Catatan pembayaran" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        title="Batalkan Invoice"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setVoidOpen(false)} disabled={voidBusy}>Batal</Button>
            <Button variant="danger" onClick={() => void confirmVoid()} loading={voidBusy}>Batalkan Invoice</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Alert tone="warn">Invoice akan ditandai dibatalkan dan tidak dapat menerima pembayaran. Tindakan tercatat di audit log.</Alert>
          <Field label="Alasan Pembatalan" required>
            <Textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Contoh: salah input klien" />
          </Field>
        </div>
      </Modal>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-right text-navy-900 dark:text-slate-200">{children}</dd>
    </div>
  )
}
