import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Banknote, Ban, CalendarClock, CreditCard, Pencil, Plus, Receipt, Trash2, TrendingDown,
  TrendingUp, Wallet,
} from 'lucide-react'
import { call, useDebounced, useQuery } from '@/api'
import type { SessionInfo } from '@/types'
import {
  Alert, Button, Card, ConfirmDialog, CurrencyInput, DataTable, Field, IconButton, Input, Modal,
  PageHeader, Pagination, SearchInput, SectionTitle, Select, StatCard, StatusBadge, Tabs, Textarea,
  useToast,
} from '@/components/ui'
import {
  EXPENSE_CATEGORIES, INVOICE_ITEM_KINDS, INVOICE_STATUSES, PAYMENT_METHODS, labelOf,
} from '@shared/constants'
import { formatDate, formatDateTime, formatRupiah, toDateInput } from '@shared/format'

type TabKey = 'invoices' | 'payments' | 'expenses' | 'receivables'

interface InvoiceItemForm {
  kind: string
  description: string
  quantity: number
  unitPrice: number
}

function todayInput(): string {
  return toDateInput(new Date())
}

function emptyItem(): InvoiceItemForm {
  return { kind: 'JASA_NOTARIS', description: '', quantity: 1, unitPrice: 0 }
}

function emptyInvoice(taxPercent: number) {
  return {
    clientId: '',
    transactionId: '',
    issueDate: todayInput(),
    dueDate: '',
    status: 'DRAFT',
    notes: '',
    discount: 0,
    taxPercent,
    items: [emptyItem()] as InvoiceItemForm[],
  }
}

function emptyExpense() {
  return {
    category: 'OPERASIONAL',
    description: '',
    amount: 0,
    expenseDate: todayInput(),
    paidTo: '',
    method: 'TUNAI',
  }
}

export function Finance({ session }: { session: SessionInfo }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const canManage = session.permissions.includes('finance.manage')

  const [tab, setTab] = useState<TabKey>('invoices')
  const summary = useQuery<any>('finance.summary')
  const settings = useQuery<any>('settings.get')
  const clients = useQuery<any[]>('clients.options')

  const [invPage, setInvPage] = useState(1)
  const [invSearch, setInvSearch] = useState('')
  const [invStatus, setInvStatus] = useState('')
  const invDebounced = useDebounced(invSearch)
  const invoices = useQuery<any>('invoices.list', {
    page: invPage, pageSize: 20, search: invDebounced, status: invStatus || undefined,
  }, { enabled: tab === 'invoices' })

  const [payPage, setPayPage] = useState(1)
  const [paySearch, setPaySearch] = useState('')
  const payDebounced = useDebounced(paySearch)
  const payments = useQuery<any>('payments.list', {
    page: payPage, pageSize: 20, search: payDebounced,
  }, { enabled: tab === 'payments' })

  const [expPage, setExpPage] = useState(1)
  const [expSearch, setExpSearch] = useState('')
  const expDebounced = useDebounced(expSearch)
  const expenses = useQuery<any>('expenses.list', {
    page: expPage, pageSize: 20, search: expDebounced,
  }, { enabled: tab === 'expenses' })

  const [recPage, setRecPage] = useState(1)
  const [recSearch, setRecSearch] = useState('')
  const recDebounced = useDebounced(recSearch)
  const receivables = useQuery<any>('finance.outstanding', {
    page: recPage, pageSize: 20, search: recDebounced,
  }, { enabled: tab === 'receivables' })

  const transactions = useQuery<any[]>('transactions.options', {}, { enabled: canManage })

  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState<any | null>(null)
  const [invoiceForm, setInvoiceForm] = useState<any>(emptyInvoice(0))
  const [invoiceError, setInvoiceError] = useState<string | null>(null)
  const [invoiceBusy, setInvoiceBusy] = useState(false)

  const [voiding, setVoiding] = useState<any | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidBusy, setVoidBusy] = useState(false)

  const [expenseOpen, setExpenseOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<any | null>(null)
  const [expenseForm, setExpenseForm] = useState<any>(emptyExpense())
  const [expenseError, setExpenseError] = useState<string | null>(null)
  const [expenseBusy, setExpenseBusy] = useState(false)
  const [deletingExpense, setDeletingExpense] = useState<any | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const defaultTax = Number(settings.data?.map?.['finance.defaultTaxPercent'] ?? 0)
  const dueDays = Number(settings.data?.map?.['finance.invoiceDueDays'] ?? 14)

  const totals = useMemo(() => {
    const subtotal = Math.round(
      (invoiceForm.items as InvoiceItemForm[]).reduce(
        (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
        0,
      ),
    )
    const taxable = Math.max(0, subtotal - (Number(invoiceForm.discount) || 0))
    const taxAmount = Math.round((taxable * (Number(invoiceForm.taxPercent) || 0)) / 100)
    return { subtotal, taxAmount, total: taxable + taxAmount }
  }, [invoiceForm.items, invoiceForm.discount, invoiceForm.taxPercent])

  useEffect(() => {
    const editId = params.get('edit')
    if (editId && canManage) {
      void openInvoiceEdit(editId)
      params.delete('edit')
      setParams(params, { replace: true })
      return
    }
    if (params.get('new') === '1' && canManage) {
      openInvoiceCreate(params.get('clientId') ?? '', params.get('transactionId') ?? '')
      params.delete('new')
      params.delete('clientId')
      params.delete('transactionId')
      setParams(params, { replace: true })
      return
    }
    if (params.get('tab')) {
      const t = params.get('tab') as TabKey
      if (['invoices', 'payments', 'expenses', 'receivables'].includes(t)) setTab(t)
      params.delete('tab')
      setParams(params, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openInvoiceCreate(clientId = '', transactionId = '') {
    setEditingInvoice(null)
    setInvoiceForm({ ...emptyInvoice(defaultTax), clientId, transactionId })
    setInvoiceError(null)
    setInvoiceOpen(true)
  }

  async function openInvoiceEdit(id: string) {
    try {
      const inv = await call<any>('invoices.get', { id })
      if (inv.status === 'VOID') return toast.error('Invoice yang dibatalkan tidak dapat diubah.')
      if ((inv.payments ?? []).length > 0) return toast.error('Invoice sudah memiliki pembayaran; rincian tidak dapat diubah.')
      setEditingInvoice(inv)
      setInvoiceForm({
        clientId: inv.clientId,
        transactionId: inv.transactionId ?? '',
        issueDate: toDateInput(inv.issueDate),
        dueDate: toDateInput(inv.dueDate),
        status: inv.status === 'DRAFT' ? 'DRAFT' : 'UNPAID',
        notes: inv.notes ?? '',
        discount: inv.discount ?? 0,
        taxPercent: inv.taxPercent ?? 0,
        items: (inv.items ?? []).map((it: any) => ({
          kind: it.kind, description: it.description, quantity: it.quantity, unitPrice: it.unitPrice,
        })),
      })
      setInvoiceError(null)
      setInvoiceOpen(true)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  function patchInvoice(patch: Record<string, unknown>) {
    setInvoiceForm((prev: any) => ({ ...prev, ...patch }))
  }

  function patchItem(index: number, patch: Record<string, unknown>) {
    setInvoiceForm((prev: any) => ({
      ...prev,
      items: prev.items.map((it: InvoiceItemForm, i: number) => (i === index ? { ...it, ...patch } : it)),
    }))
  }

  async function saveInvoice() {
    if (!invoiceForm.clientId) return setInvoiceError('Klien wajib dipilih.')
    if (!invoiceForm.issueDate) return setInvoiceError('Tanggal terbit wajib diisi.')
    if (invoiceForm.dueDate && invoiceForm.dueDate < invoiceForm.issueDate) {
      return setInvoiceError('Jatuh tempo tidak boleh sebelum tanggal terbit.')
    }
    const items = (invoiceForm.items as InvoiceItemForm[]).filter(
      (it) => it.description.trim() && Number(it.quantity) > 0,
    )
    if (items.length === 0) return setInvoiceError('Minimal satu item dengan deskripsi dan jumlah lebih dari nol.')
    setInvoiceBusy(true)
    setInvoiceError(null)
    const payload: any = {
      clientId: invoiceForm.clientId,
      transactionId: invoiceForm.transactionId || null,
      deedId: null,
      issueDate: invoiceForm.issueDate,
      dueDate: invoiceForm.dueDate || null,
      discount: Number(invoiceForm.discount) || 0,
      taxPercent: Number(invoiceForm.taxPercent) || 0,
      notes: invoiceForm.notes?.trim() || null,
      status: invoiceForm.status,
      items: items.map((it) => ({
        kind: it.kind,
        description: it.description.trim(),
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice) || 0,
      })),
    }
    try {
      if (editingInvoice) {
        await call('invoices.update', { id: editingInvoice.id, ...payload })
        toast.success(`Invoice ${editingInvoice.number} diperbarui.`)
      } else {
        const created = await call<any>('invoices.create', payload)
        toast.success(`Invoice ${created.number} dibuat.`)
      }
      setInvoiceOpen(false)
      await Promise.all([invoices.reload(true), summary.reload(true)])
    } catch (err) {
      setInvoiceError((err as Error).message)
    } finally {
      setInvoiceBusy(false)
    }
  }

  async function confirmVoid() {
    if (!voiding) return
    if (voidReason.trim().length < 3) return toast.error('Alasan pembatalan minimal 3 karakter.')
    setVoidBusy(true)
    try {
      await call('invoices.void', { id: voiding.id, reason: voidReason.trim() })
      toast.success(`Invoice ${voiding.number} dibatalkan.`)
      setVoiding(null)
      setVoidReason('')
      await Promise.all([invoices.reload(true), summary.reload(true)])
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setVoidBusy(false)
    }
  }

  function openExpenseCreate() {
    setEditingExpense(null)
    setExpenseForm(emptyExpense())
    setExpenseError(null)
    setExpenseOpen(true)
  }

  function openExpenseEdit(row: any) {
    setEditingExpense(row)
    setExpenseForm({
      category: row.category,
      description: row.description,
      amount: row.amount,
      expenseDate: toDateInput(row.expenseDate),
      paidTo: row.paidTo ?? '',
      method: row.method,
    })
    setExpenseError(null)
    setExpenseOpen(true)
  }

  async function saveExpense() {
    if (expenseForm.description.trim().length < 2) return setExpenseError('Deskripsi minimal 2 karakter.')
    if (Number(expenseForm.amount) < 1) return setExpenseError('Jumlah pengeluaran wajib lebih dari nol.')
    if (!expenseForm.expenseDate) return setExpenseError('Tanggal pengeluaran wajib diisi.')
    setExpenseBusy(true)
    setExpenseError(null)
    const payload: any = {
      category: expenseForm.category,
      description: expenseForm.description.trim(),
      amount: Number(expenseForm.amount),
      expenseDate: expenseForm.expenseDate,
      paidTo: expenseForm.paidTo?.trim() || null,
      method: expenseForm.method,
      receiptDocumentId: null,
    }
    try {
      if (editingExpense) {
        await call('expenses.update', { id: editingExpense.id, ...payload })
        toast.success('Pengeluaran diperbarui.')
      } else {
        const created = await call<any>('expenses.create', payload)
        toast.success(`Pengeluaran ${created.number} dicatat.`)
      }
      setExpenseOpen(false)
      await Promise.all([expenses.reload(true), summary.reload(true)])
    } catch (err) {
      setExpenseError((err as Error).message)
    } finally {
      setExpenseBusy(false)
    }
  }

  async function confirmDeleteExpense() {
    if (!deletingExpense) return
    setDeleteBusy(true)
    try {
      await call('expenses.delete', { id: deletingExpense.id })
      toast.success(`Pengeluaran ${deletingExpense.number} dihapus.`)
      setDeletingExpense(null)
      await Promise.all([expenses.reload(true), summary.reload(true)])
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setDeleteBusy(false)
    }
  }

  const s = summary.data

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Administrasi"
        title="Keuangan"
        subtitle="Invoice, pembayaran, pengeluaran, dan piutang kantor."
        actions={
          canManage ? (
            tab === 'expenses' ? (
              <Button variant="gold" onClick={openExpenseCreate}><Plus className="h-4 w-4" /> Catat Pengeluaran</Button>
            ) : (
              <Button variant="gold" onClick={() => openInvoiceCreate()}><Plus className="h-4 w-4" /> Buat Invoice</Button>
            )
          ) : undefined
        }
      />

      {summary.error && <Alert tone="danger" title="Gagal memuat ringkasan keuangan">{summary.error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Pemasukan Bulan Ini" value={summary.loading ? '—' : formatRupiah(s?.incomeMonth ?? 0)} hint="Pembayaran diterima" icon={<TrendingUp />} tone="green" />
        <StatCard label="Pengeluaran Bulan Ini" value={summary.loading ? '—' : formatRupiah(s?.expenseMonth ?? 0)} hint="Biaya operasional tercatat" icon={<TrendingDown />} tone="red" />
        <StatCard label="Arus Kas Bersih" value={summary.loading ? '—' : formatRupiah(s?.netMonth ?? 0)} hint="Pemasukan dikurangi pengeluaran" icon={<Wallet />} tone="navy" />
        <StatCard label="Piutang Berjalan" value={summary.loading ? '—' : formatRupiah(s?.outstanding ?? 0)} hint="Invoice belum lunas" icon={<CalendarClock />} tone="gold" />
      </div>

      <Card className="overflow-hidden">
        <Tabs
          className="px-4 pt-2"
          active={tab}
          onChange={(k) => setTab(k as TabKey)}
          tabs={[
            { key: 'invoices', label: 'Invoice' },
            { key: 'payments', label: 'Pembayaran' },
            { key: 'expenses', label: 'Pengeluaran' },
            { key: 'receivables', label: 'Piutang' },
          ]}
        />

        {tab === 'invoices' && (
          <>
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <SearchInput value={invSearch} onChange={(v) => { setInvSearch(v); setInvPage(1) }} placeholder="Cari nomor invoice, klien, catatan…" className="w-full sm:w-72" />
              <Select value={invStatus} onChange={(e) => { setInvStatus(e.target.value); setInvPage(1) }} className="w-full sm:w-48">
                <option value="">Semua status</option>
                {INVOICE_STATUSES.map((st) => <option key={st.value} value={st.value}>{st.label}</option>)}
              </Select>
              <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                <Receipt className="mr-1 inline h-3.5 w-3.5" />{invoices.data?.total ?? 0} invoice
              </span>
            </div>
            <DataTable
              rows={invoices.data?.items ?? []}
              loading={invoices.loading}
              onRowClick={(row) => navigate(`/keuangan/invoice/${row.id}`)}
              columns={[
                { key: 'number', header: 'Nomor', render: (r) => <span className="font-semibold text-navy-900 dark:text-white">{r.number}</span> },
                { key: 'client', header: 'Klien', render: (r) => (
                  <div>
                    <p className="font-medium">{r.client?.fullName ?? '—'}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{r.client?.code ?? ''}</p>
                  </div>
                ) },
                { key: 'issueDate', header: 'Terbit', render: (r) => formatDate(r.issueDate) },
                { key: 'dueDate', header: 'Jatuh Tempo', render: (r) => formatDate(r.dueDate) },
                { key: 'total', header: 'Total', align: 'right', render: (r) => formatRupiah(r.total) },
                { key: 'paidAmount', header: 'Dibayar', align: 'right', render: (r) => formatRupiah(r.paidAmount) },
                { key: 'remaining', header: 'Sisa', align: 'right', render: (r) => formatRupiah(Math.max(0, r.total - r.paidAmount)) },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
                {
                  key: 'actions', header: '', align: 'right', render: (r) => canManage && r.status !== 'VOID' && (r._count?.payments ?? 0) === 0 ? (
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <IconButton label="Ubah invoice" onClick={() => void openInvoiceEdit(r.id)}>
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      <IconButton label="Batalkan invoice" onClick={() => { setVoiding(r); setVoidReason('') }}>
                        <Ban className="h-4 w-4" />
                      </IconButton>
                    </div>
                  ) : null,
                },
              ]}
            />
            {invoices.data && (
              <Pagination page={invoices.data.page} pageSize={invoices.data.pageSize} total={invoices.data.total} totalPages={invoices.data.totalPages} onPage={setInvPage} />
            )}
          </>
        )}

        {tab === 'payments' && (
          <>
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <SearchInput value={paySearch} onChange={(v) => { setPaySearch(v); setPayPage(1) }} placeholder="Cari nomor pembayaran, invoice, klien…" className="w-full sm:w-80" />
              <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                Total ditampilkan: <b className="text-navy-900 dark:text-slate-200">{formatRupiah(payments.data?.totalAmount ?? 0)}</b>
              </span>
            </div>
            <Alert tone="info" title="Pencatatan pembayaran">
              <span className="text-xs">Pembayaran dicatat dari halaman detail invoice agar sisa tagihan dihitung otomatis. Klik baris untuk membuka invoice.</span>
            </Alert>
            <div className="px-4 pt-3">
              <DataTable
                rows={payments.data?.items ?? []}
                loading={payments.loading}
                onRowClick={(row) => row.invoice?.id && navigate(`/keuangan/invoice/${row.invoice.id}`)}
                columns={[
                  { key: 'number', header: 'Nomor', render: (r) => <span className="font-semibold text-navy-900 dark:text-white">{r.number}</span> },
                  { key: 'invoice', header: 'Invoice', render: (r) => (
                    <div>
                      <p className="font-medium">{r.invoice?.number ?? '—'}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{r.invoice?.client?.fullName ?? ''}</p>
                    </div>
                  ) },
                  { key: 'paidAt', header: 'Tanggal', render: (r) => formatDateTime(r.paidAt) },
                  { key: 'method', header: 'Metode', render: (r) => labelOf(PAYMENT_METHODS, r.method) },
                  { key: 'reference', header: 'Referensi', render: (r) => r.reference || '—' },
                  { key: 'amount', header: 'Jumlah', align: 'right', render: (r) => <span className="font-semibold">{formatRupiah(r.amount)}</span> },
                  { key: 'receivedBy', header: 'Diterima Oleh', render: (r) => r.receivedBy?.fullName ?? '—' },
                ]}
              />
            </div>
            {payments.data && (
              <Pagination page={payments.data.page} pageSize={payments.data.pageSize} total={payments.data.total} totalPages={payments.data.totalPages} onPage={setPayPage} />
            )}
          </>
        )}

        {tab === 'expenses' && (
          <>
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <SearchInput value={expSearch} onChange={(v) => { setExpSearch(v); setExpPage(1) }} placeholder="Cari nomor, deskripsi, penerima…" className="w-full sm:w-72" />
              <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                Total ditampilkan: <b className="text-navy-900 dark:text-slate-200">{formatRupiah(expenses.data?.totalAmount ?? 0)}</b>
              </span>
            </div>
            <DataTable
              rows={expenses.data?.items ?? []}
              loading={expenses.loading}
              columns={[
                { key: 'number', header: 'Nomor', render: (r) => <span className="font-semibold text-navy-900 dark:text-white">{r.number}</span> },
                { key: 'expenseDate', header: 'Tanggal', render: (r) => formatDate(r.expenseDate) },
                { key: 'category', header: 'Kategori', render: (r) => labelOf(EXPENSE_CATEGORIES, r.category) },
                { key: 'description', header: 'Deskripsi', render: (r) => (
                  <div>
                    <p className="font-medium">{r.description}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{r.paidTo || '—'} · {labelOf(PAYMENT_METHODS, r.method)}</p>
                  </div>
                ) },
                { key: 'amount', header: 'Jumlah', align: 'right', render: (r) => <span className="font-semibold">{formatRupiah(r.amount)}</span> },
                { key: 'createdBy', header: 'Dicatat Oleh', render: (r) => r.createdBy?.fullName ?? '—' },
                {
                  key: 'actions', header: '', align: 'right', render: (r) => canManage ? (
                    <div className="flex justify-end gap-1">
                      <IconButton label="Ubah pengeluaran" onClick={() => openExpenseEdit(r)}><Pencil className="h-4 w-4" /></IconButton>
                      <IconButton label="Hapus pengeluaran" onClick={() => setDeletingExpense(r)}><Trash2 className="h-4 w-4" /></IconButton>
                    </div>
                  ) : null,
                },
              ]}
            />
            {expenses.data && (
              <Pagination page={expenses.data.page} pageSize={expenses.data.pageSize} total={expenses.data.total} totalPages={expenses.data.totalPages} onPage={setExpPage} />
            )}
          </>
        )}

        {tab === 'receivables' && (
          <>
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <SearchInput value={recSearch} onChange={(v) => { setRecSearch(v); setRecPage(1) }} placeholder="Cari nomor invoice atau klien…" className="w-full sm:w-72" />
              <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
                <Banknote className="mr-1 inline h-3.5 w-3.5" />{receivables.data?.total ?? 0} invoice belum lunas
              </span>
            </div>
            <DataTable
              rows={receivables.data?.items ?? []}
              loading={receivables.loading}
              onRowClick={(row) => navigate(`/keuangan/invoice/${row.id}`)}
              columns={[
                { key: 'number', header: 'Nomor', render: (r) => <span className="font-semibold text-navy-900 dark:text-white">{r.number}</span> },
                { key: 'client', header: 'Klien', render: (r) => (
                  <div>
                    <p className="font-medium">{r.client?.fullName ?? '—'}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{r.client?.code ?? ''}</p>
                  </div>
                ) },
                { key: 'dueDate', header: 'Jatuh Tempo', render: (r) => {
                  const overdue = r.dueDate && new Date(r.dueDate).getTime() < Date.now()
                  return <span className={overdue ? 'font-semibold text-red-600 dark:text-red-400' : ''}>{formatDate(r.dueDate)}{overdue ? ' · lewat' : ''}</span>
                } },
                { key: 'total', header: 'Total', align: 'right', render: (r) => formatRupiah(r.total) },
                { key: 'paidAmount', header: 'Dibayar', align: 'right', render: (r) => formatRupiah(r.paidAmount) },
                { key: 'remaining', header: 'Sisa Tagihan', align: 'right', render: (r) => <span className="font-semibold text-gold-700 dark:text-gold-400">{formatRupiah(Math.max(0, r.total - r.paidAmount))}</span> },
                { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              ]}
            />
            {receivables.data && (
              <Pagination page={receivables.data.page} pageSize={receivables.data.pageSize} total={receivables.data.total} totalPages={receivables.data.totalPages} onPage={setRecPage} />
            )}
          </>
        )}
      </Card>

      <Modal
        open={invoiceOpen}
        onClose={() => setInvoiceOpen(false)}
        title={editingInvoice ? `Ubah Invoice ${editingInvoice.number}` : 'Buat Invoice'}
        subtitle="Nomor invoice dibuat otomatis saat disimpan."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setInvoiceOpen(false)} disabled={invoiceBusy}>Batal</Button>
            <Button variant="gold" onClick={() => void saveInvoice()} loading={invoiceBusy}>
              {editingInvoice ? 'Simpan Perubahan' : 'Buat Invoice'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {invoiceError && <Alert tone="danger">{invoiceError}</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Klien" required>
              <Select value={invoiceForm.clientId} onChange={(e) => patchInvoice({ clientId: e.target.value })}>
                <option value="">Pilih klien…</option>
                {(clients.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.fullName} · {c.code}</option>
                ))}
              </Select>
            </Field>
            <Field label="Transaksi Terkait" hint="Opsional; hanya transaksi aktif.">
              <Select value={invoiceForm.transactionId} onChange={(e) => patchInvoice({ transactionId: e.target.value })}>
                <option value="">Tanpa transaksi</option>
                {(transactions.data ?? [])
                  .filter((t) => !invoiceForm.clientId || t.clientId === invoiceForm.clientId)
                  .map((t) => <option key={t.id} value={t.id}>{t.code} · {t.title}</option>)}
              </Select>
            </Field>
            <Field label="Tanggal Terbit" required>
              <Input type="date" value={invoiceForm.issueDate} onChange={(e) => patchInvoice({ issueDate: e.target.value })} />
            </Field>
            <Field label="Jatuh Tempo" hint={`Kosongkan untuk otomatis ${dueDays} hari dari tanggal terbit.`}>
              <Input type="date" value={invoiceForm.dueDate} onChange={(e) => patchInvoice({ dueDate: e.target.value })} />
            </Field>
            <Field label="Status Awal">
              <Select value={invoiceForm.status} onChange={(e) => patchInvoice({ status: e.target.value })}>
                <option value="DRAFT">Draft (belum diterbitkan)</option>
                <option value="UNPAID">Terbitkan langsung (belum dibayar)</option>
              </Select>
            </Field>
            <Field label="Catatan">
              <Input value={invoiceForm.notes} onChange={(e) => patchInvoice({ notes: e.target.value })} placeholder="Catatan untuk klien" />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <SectionTitle title="Rincian Tagihan" />
              <Button variant="secondary" className="!py-1.5 text-xs" onClick={() => patchInvoice({ items: [...invoiceForm.items, emptyItem()] })}>
                <Plus className="h-3.5 w-3.5" /> Tambah Item
              </Button>
            </div>
            <div className="space-y-2">
              {(invoiceForm.items as InvoiceItemForm[]).map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 items-end gap-2 rounded-lg border border-slate-200 p-2 dark:border-navy-800">
                  <Field label={idx === 0 ? 'Jenis' : undefined} className="col-span-12 sm:col-span-3">
                    <Select value={it.kind} onChange={(e) => patchItem(idx, { kind: e.target.value })}>
                      {INVOICE_ITEM_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                    </Select>
                  </Field>
                  <Field label={idx === 0 ? 'Deskripsi' : undefined} className="col-span-12 sm:col-span-4">
                    <Input value={it.description} onChange={(e) => patchItem(idx, { description: e.target.value })} placeholder="Uraian jasa / biaya" />
                  </Field>
                  <Field label={idx === 0 ? 'Qty' : undefined} className="col-span-3 sm:col-span-1">
                    <Input type="number" min={1} value={it.quantity} onChange={(e) => patchItem(idx, { quantity: Number(e.target.value) || 0 })} />
                  </Field>
                  <Field label={idx === 0 ? 'Harga Satuan' : undefined} className="col-span-5 sm:col-span-2">
                    <CurrencyInput value={it.unitPrice} onChange={(v) => patchItem(idx, { unitPrice: v })} />
                  </Field>
                  <div className="col-span-2 flex justify-end sm:col-span-1">
                    <IconButton
                      label="Hapus item"
                      disabled={(invoiceForm.items as InvoiceItemForm[]).length <= 1}
                      onClick={() => patchInvoice({ items: (invoiceForm.items as InvoiceItemForm[]).filter((_, i) => i !== idx) })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                  <div className="col-span-12 text-right text-[11px] text-slate-500 dark:text-slate-400">
                    Jumlah: {formatRupiah(Math.round((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-3">
              <Field label="Diskon (Rp)">
                <CurrencyInput value={invoiceForm.discount} onChange={(v) => patchInvoice({ discount: v })} />
              </Field>
              <Field label="Pajak (%)" hint="PPN atau pajak terkait transaksi.">
                <Input type="number" min={0} max={100} step="0.01" value={invoiceForm.taxPercent} onChange={(e) => patchInvoice({ taxPercent: Number(e.target.value) || 0 })} />
              </Field>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-navy-900/60">
              <div className="flex justify-between py-0.5"><span className="text-slate-500 dark:text-slate-400">Subtotal</span><span>{formatRupiah(totals.subtotal)}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-slate-500 dark:text-slate-400">Diskon</span><span>- {formatRupiah(Number(invoiceForm.discount) || 0)}</span></div>
              <div className="flex justify-between py-0.5"><span className="text-slate-500 dark:text-slate-400">Pajak ({Number(invoiceForm.taxPercent) || 0}%)</span><span>{formatRupiah(totals.taxAmount)}</span></div>
              <div className="mt-1 flex justify-between border-t border-slate-200 pt-1.5 font-bold text-navy-900 dark:border-navy-700 dark:text-white"><span>Total</span><span>{formatRupiah(totals.total)}</span></div>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!voiding}
        onClose={() => { setVoiding(null); setVoidReason('') }}
        title="Batalkan Invoice"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setVoiding(null); setVoidReason('') }} disabled={voidBusy}>Batal</Button>
            <Button variant="danger" onClick={() => void confirmVoid()} loading={voidBusy}>Batalkan Invoice</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Alert tone="warn">
            Invoice <b>{voiding?.number}</b> akan ditandai dibatalkan. Invoice dengan pembayaran tidak dapat dibatalkan. Tindakan ini tercatat di audit log.
          </Alert>
          <Field label="Alasan Pembatalan" required>
            <Textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} placeholder="Contoh: invoice dibuat ganda" />
          </Field>
        </div>
      </Modal>

      <Modal
        open={expenseOpen}
        onClose={() => setExpenseOpen(false)}
        title={editingExpense ? `Ubah Pengeluaran ${editingExpense.number}` : 'Catat Pengeluaran'}
        subtitle="Nomor pengeluaran dibuat otomatis saat disimpan."
        footer={
          <>
            <Button variant="secondary" onClick={() => setExpenseOpen(false)} disabled={expenseBusy}>Batal</Button>
            <Button variant="gold" onClick={() => void saveExpense()} loading={expenseBusy}>{editingExpense ? 'Simpan Perubahan' : 'Catat Pengeluaran'}</Button>
          </>
        }
      >
        <div className="space-y-3">
          {expenseError && <Alert tone="danger">{expenseError}</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kategori" required>
              <Select value={expenseForm.category} onChange={(e) => setExpenseForm((f: any) => ({ ...f, category: e.target.value }))}>
                {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label="Tanggal" required>
              <Input type="date" value={expenseForm.expenseDate} onChange={(e) => setExpenseForm((f: any) => ({ ...f, expenseDate: e.target.value }))} />
            </Field>
            <Field label="Deskripsi" required className="sm:col-span-2">
              <Input value={expenseForm.description} onChange={(e) => setExpenseForm((f: any) => ({ ...f, description: e.target.value }))} placeholder="Uraian pengeluaran" />
            </Field>
            <Field label="Jumlah (Rp)" required>
              <CurrencyInput value={expenseForm.amount} onChange={(v) => setExpenseForm((f: any) => ({ ...f, amount: v }))} />
            </Field>
            <Field label="Metode Pembayaran" required>
              <Select value={expenseForm.method} onChange={(e) => setExpenseForm((f: any) => ({ ...f, method: e.target.value }))}>
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            </Field>
            <Field label="Dibayarkan Kepada" className="sm:col-span-2">
              <Input value={expenseForm.paidTo} onChange={(e) => setExpenseForm((f: any) => ({ ...f, paidTo: e.target.value }))} placeholder="Nama penerima" />
            </Field>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deletingExpense}
        title="Hapus Pengeluaran"
        description={<>Pengeluaran <b>{deletingExpense?.number}</b> sebesar <b>{formatRupiah(deletingExpense?.amount ?? 0)}</b> akan dihapus permanen. Penghapusan tercatat di audit log.</>}
        confirmLabel="Hapus"
        danger
        loading={deleteBusy}
        onConfirm={() => void confirmDeleteExpense()}
        onClose={() => setDeletingExpense(null)}
      />

      {session.permissions.includes('finance.view') && (
        <p className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
          <CreditCard className="h-3.5 w-3.5" /> Semua angka dalam Rupiah. Pemasukan dihitung dari pembayaran yang diterima, bukan dari invoice terbit.
        </p>
      )}
    </div>
  )
}
