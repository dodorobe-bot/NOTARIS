import React, {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle, Check, CheckCircle2, ChevronLeft, ChevronRight, Info, Inbox,
  Loader2, Search, X,
} from 'lucide-react'
import { shouldVirtualize, virtualWindow, VIRTUAL_ROW_PX, VIRTUAL_VIEWPORT_PX } from '@shared/virtual'

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <Loader2 className={cn('animate-spin', className)} aria-hidden />
}

// ---------- TOAST ----------
type ToastKind = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}
interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}
const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random()
    setItems((prev) => [...prev.slice(-3), { id, kind, message }])
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4600)
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'animate-in pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-pop',
              t.kind === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/80 dark:text-emerald-100',
              t.kind === 'error' && 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/80 dark:text-red-100',
              t.kind === 'info' && 'border-navy-200 bg-white text-navy-900 dark:border-navy-700 dark:bg-navy-900 dark:text-slate-100',
            )}
          >
            {t.kind === 'success' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
            {t.kind === 'error' && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
            {t.kind === 'info' && <Info className="mt-0.5 h-4 w-4 shrink-0" />}
            <span className="leading-snug">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast harus dipakai di dalam ToastProvider')
  return ctx
}

// ---------- BUTTONS ----------
type ButtonVariant = 'primary' | 'secondary' | 'gold' | 'ghost' | 'danger'
export function Button({
  variant = 'primary', loading, children, className, type = 'button', ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  return (
    <button
      type={type}
      className={cn(
        variant === 'primary' && 'btn-primary',
        variant === 'secondary' && 'btn-secondary',
        variant === 'gold' && 'btn-gold',
        variant === 'ghost' && 'btn-ghost',
        variant === 'danger' && 'btn-danger',
        className,
      )}
      disabled={rest.disabled || loading}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

export function IconButton({
  label, children, className, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn('btn-ghost !p-2', className)}
      {...rest}
    >
      {children}
    </button>
  )
}

// ---------- FORM ----------
export function Field({
  label, children, hint, error, required, className,
}: {
  label?: string
  children: React.ReactNode
  hint?: string
  error?: string | null
  required?: boolean
  className?: string
}) {
  return (
    <div className={className}>
      {label && (
        <label className="field-label">
          {label}
          {required && <span className="ml-1 text-red-500">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>}
      {error && <p className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn('input', className)} {...rest} />
  },
)

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn('input min-h-[96px] leading-relaxed', className)} {...rest} />
}

export function Select({
  className, children, ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn('input pr-8', className)} {...rest}>
      {children}
    </select>
  )
}

export function SearchInput({
  value, onChange, placeholder = 'Cari…', className,
}: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        className="input pl-9"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
          onClick={() => onChange('')}
          aria-label="Bersihkan pencarian"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

export function CurrencyInput({
  value, onChange, disabled, placeholder = '0', id,
}: { value: number | null | undefined; onChange: (v: number) => void; disabled?: boolean; placeholder?: string; id?: string }) {
  const [text, setText] = useState(() => (value ? new Intl.NumberFormat('id-ID').format(value) : ''))
  useEffect(() => {
    const formatted = value ? new Intl.NumberFormat('id-ID').format(value) : ''
    setText((prev) => {
      const prevNumber = Number(prev.replace(/[^\d]/g, ''))
      return prevNumber === (value ?? 0) ? prev : formatted
    })
  }, [value])
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">Rp</span>
      <input
        id={id}
        className="input pl-9 text-right font-medium tabular-nums"
        inputMode="numeric"
        disabled={disabled}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, '').slice(0, 15)
          const num = digits ? Number(digits) : 0
          setText(digits ? new Intl.NumberFormat('id-ID').format(num) : '')
          onChange(num)
        }}
      />
    </div>
  )
}

export function Toggle({
  checked, onChange, label, description, disabled,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div>
        <p className="text-sm font-medium text-navy-900 dark:text-slate-100">{label}</p>
        {description && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition',
          checked ? 'bg-gold-500' : 'bg-slate-300 dark:bg-navy-700',
          disabled && 'opacity-50',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  )
}

// ---------- DISPLAY ----------
export type BadgeTone = 'neutral' | 'gold' | 'green' | 'red' | 'blue' | 'amber' | 'purple' | 'gray'

export function Badge({ tone = 'neutral', children, className }: { tone?: BadgeTone; children: React.ReactNode; className?: string }) {
  const tones: Record<BadgeTone, string> = {
    neutral: 'bg-slate-100 text-slate-700 dark:bg-navy-800 dark:text-slate-300',
    gold: 'bg-gold-500/15 text-gold-700 dark:text-gold-300',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    red: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
    blue: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    purple: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
    gray: 'bg-slate-200 text-slate-600 dark:bg-navy-800 dark:text-slate-400',
  }
  return <span className={cn('chip', tones[tone], className)}>{children}</span>
}

const POSITIVE = new Set(['SELESAI', 'PAID', 'LUNAS', 'AKTIF', 'ACTIVE', 'DONE', 'APPROVED', 'DISETUJUI', 'REGISTERED', 'SIGNED', 'ARCHIVED', 'DIARSIPKAN', 'SUCCESS', 'SUDAH', 'TERVERIFIKASI'])
const WARNING = new Set(['DRAFT', 'REVIEW', 'UNPAID', 'PARTIAL', 'TERJADWAL', 'TODO', 'IN_PROGRESS', 'PENDING', 'PROSES', 'MENUNGGU', 'AKAN_JATUH_TEMPO', 'DIBUAT'])
const DANGER = new Set(['BATAL', 'CANCELLED', 'VOID', 'BLACKLIST', 'TERLAMBAT', 'FAILED', 'GAGAL', 'OVERDUE', 'EXPIRED', 'KEDALUWARSA', 'DIBATALKAN', 'NONAKTIF'])

export function StatusBadge({ status, label }: { status?: string | null; label?: string }) {
  if (!status) return <span className="text-slate-400">—</span>
  const tone: BadgeTone = POSITIVE.has(status) ? 'green' : DANGER.has(status) ? 'red' : WARNING.has(status) ? 'amber' : 'blue'
  return <Badge tone={tone}>{label ?? status}</Badge>
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('card', className)}>{children}</div>
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-bold text-navy-900 dark:text-slate-100">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function PageHeader({
  title, subtitle, actions, eyebrow,
}: { title: string; subtitle?: string; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-gold-600 dark:text-gold-400">{eyebrow}</p>}
        <h1 className="text-2xl font-bold tracking-tight text-navy-900 dark:text-white">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({
  label, value, hint, icon, tone = 'navy',
}: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; tone?: 'navy' | 'gold' | 'green' | 'red' | 'blue' }) {
  const tones = {
    navy: 'bg-navy-900 text-white',
    gold: 'bg-gold-500 text-navy-950',
    green: 'bg-emerald-600 text-white',
    red: 'bg-red-600 text-white',
    blue: 'bg-sky-600 text-white',
  }
  return (
    <Card className="flex items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-2 text-xl font-bold tracking-tight text-navy-900 dark:text-white">{value}</p>
        {hint && <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>}
      </div>
      {icon && <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg [&>svg]:h-5 [&>svg]:w-5', tones[tone])}>{icon}</div>}
    </Card>
  )
}

export function EmptyState({
  title = 'Belum ada data', description, action, compact,
}: { title?: string; description?: string; action?: React.ReactNode; compact?: boolean }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 text-center', compact ? 'py-8' : 'py-14')}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-navy-800 dark:text-slate-500">
        <Inbox className="h-6 w-6" />
      </div>
      <p className="text-sm font-semibold text-navy-900 dark:text-slate-200">{title}</p>
      {description && <p className="mt-1 max-w-md text-xs text-slate-500 dark:text-slate-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Alert({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'danger' | 'success'; title?: string; children: React.ReactNode }) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-200',
    warn: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200',
    danger: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200',
  }
  return (
    <div className={cn('rounded-lg border px-4 py-3 text-sm', tones[tone])}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={cn(title && 'mt-1', 'leading-relaxed')}>{children}</div>
    </div>
  )
}

// ---------- TABLE ----------
export interface Column<T = Record<string, any>> {
  key: string
  header: string
  render?: (row: T) => React.ReactNode
  className?: string
  align?: 'left' | 'right' | 'center'
  width?: string | number
}

export function DataTable<T extends Record<string, any>>({
  columns, rows, loading, empty, onRowClick, rowKey, virtualize = false, virtualHeight = VIRTUAL_VIEWPORT_PX,
}: {
  columns: Column<T>[]
  rows: T[]
  loading?: boolean
  empty?: React.ReactNode
  onRowClick?: (row: T) => void
  rowKey?: (row: T, index: number) => string | number
  /** Jendela baris untuk daftar panjang tanpa paginasi (mis. semua akta satu klien). */
  virtualize?: boolean
  virtualHeight?: number
}) {
  const virtual = shouldVirtualize(rows.length, virtualize) && !loading
  const scrollRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLTableSectionElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [rowHeight, setRowHeight] = useState(VIRTUAL_ROW_PX)

  useLayoutEffect(() => {
    if (!virtual) return
    const first = bodyRef.current?.querySelector<HTMLTableRowElement>('tr[data-virtual-row]')
    const measured = first?.getBoundingClientRect().height ?? 0
    if (measured > 0 && Math.abs(measured - rowHeight) > 1) setRowHeight(measured)
  }, [virtual, rows, rowHeight])

  const win = virtual ? virtualWindow(scrollTop, virtualHeight, rowHeight, rows.length) : null
  const visible = win ? rows.slice(win.start, win.end) : rows

  return (
    <div
      ref={scrollRef}
      onScroll={virtual ? (e) => setScrollTop(e.currentTarget.scrollTop) : undefined}
      style={virtual ? { maxHeight: virtualHeight } : undefined}
      className={cn(virtual ? 'overflow-auto' : 'overflow-x-auto')}
      data-virtualized={virtual ? 'true' : undefined}
    >
      <table className="w-full border-collapse text-sm">
        <thead className={cn(virtual && 'sticky top-0 z-10')}>
          <tr className="table-head">
            {columns.map((c) => (
              <th
                key={c.key}
                style={{ width: c.width }}
                className={cn(
                  'whitespace-nowrap px-3 py-2.5 text-left',
                  c.align === 'right' && 'text-right',
                  c.align === 'center' && 'text-center',
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={`sk-${i}`} className="border-t border-slate-100 dark:border-navy-800">
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-3">
                    <div className="h-3 w-full animate-pulse rounded bg-slate-100 dark:bg-navy-800" />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>{empty ?? <EmptyState compact />}</td>
            </tr>
          ) : (
            <>
              {win && win.topPad > 0 && (
                <tr aria-hidden="true" style={{ height: win.topPad }}>
                  <td colSpan={columns.length} className="p-0" />
                </tr>
              )}
              {visible.map((row, idx) => {
                const absolute = win ? win.start + idx : idx
                return (
                  <tr
                    key={rowKey ? rowKey(row, absolute) : row.id ?? absolute}
                    data-virtual-row={win ? 'true' : undefined}
                    className={cn(
                      'border-t border-slate-100 text-navy-800 transition dark:border-navy-800/80 dark:text-slate-200',
                      onRowClick && 'cursor-pointer hover:bg-slate-50 dark:hover:bg-navy-900/60',
                    )}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          'px-3 py-2.5 align-middle',
                          c.align === 'right' && 'text-right tabular-nums',
                          c.align === 'center' && 'text-center',
                          c.className,
                        )}
                      >
                        {c.render ? c.render(row) : (row[c.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                )
              })}
              {win && win.bottomPad > 0 && (
                <tr aria-hidden="true" style={{ height: win.bottomPad }}>
                  <td colSpan={columns.length} className="p-0" />
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>
    </div>
  )
}

export function Pagination({
  page, pageSize, total, totalPages, onPage,
}: { page: number; pageSize: number; total: number; totalPages: number; onPage: (p: number) => void }) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-navy-800 dark:text-slate-400">
      <span>
        Menampilkan <b className="text-navy-900 dark:text-slate-200">{from}-{to}</b> dari <b className="text-navy-900 dark:text-slate-200">{total}</b> data
      </span>
      <div className="flex items-center gap-1">
        <IconButton label="Halaman sebelumnya" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </IconButton>
        <span className="px-2">
          Halaman <b className="text-navy-900 dark:text-slate-200">{page}</b> / {Math.max(1, totalPages)}
        </span>
        <IconButton label="Halaman berikutnya" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </IconButton>
      </div>
    </div>
  )
}

// ---------- MODAL ----------
export function Modal({
  open, onClose, title, subtitle, children, footer, size = 'md', dismissable = true,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  dismissable?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, dismissable])

  if (!open) return null
  const widths = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl', full: 'max-w-[95vw]' }
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-navy-950/60 p-4 backdrop-blur-sm sm:p-8">
      <div className={cn('animate-in my-auto w-full rounded-xl border border-slate-200 bg-white shadow-pop dark:border-navy-700 dark:bg-[#0E1E35]', widths[size])}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-navy-800">
          <div>
            <h3 className="text-base font-bold text-navy-900 dark:text-white">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          <IconButton label="Tutup" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="max-h-[calc(100vh-16rem)] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-navy-800">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({
  open, title, description, confirmLabel = 'Ya, lanjutkan', danger, loading, onConfirm, onClose,
}: {
  open: boolean
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  danger?: boolean
  loading?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Batal</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', danger ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300')}>
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="leading-relaxed">{description}</div>
      </div>
    </Modal>
  )
}

// ---------- TABS ----------
export function Tabs({
  tabs, active, onChange, className,
}: { tabs: { key: string; label: string; count?: number }[]; active: string; onChange: (k: string) => void; className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-1 border-b border-slate-200 dark:border-navy-800', className)}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={cn(
            'relative px-3 py-2.5 text-sm font-medium transition',
            active === t.key
              ? 'text-navy-900 after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-gold-500 dark:text-white'
              : 'text-slate-500 hover:text-navy-800 dark:text-slate-400 dark:hover:text-slate-200',
          )}
        >
          {t.label}
          {typeof t.count === 'number' && (
            <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-navy-800 dark:text-slate-300">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}

// ---------- STEPPER ----------
export function Stepper({ steps, current }: { steps: { status: string; label: string }[]; current: string }) {
  const currentIndex = steps.findIndex((s) => s.status === current)
  return (
    <div className="flex w-full items-start gap-1 overflow-x-auto pb-1">
      {steps.map((s, i) => {
        const done = i < currentIndex
        const active = i === currentIndex
        return (
          <div key={s.status} className="flex min-w-[86px] flex-1 flex-col items-center gap-1.5 text-center">
            <div className="flex w-full items-center">
              <div className={cn('h-0.5 flex-1', i === 0 ? 'bg-transparent' : done || active ? 'bg-gold-500' : 'bg-slate-200 dark:bg-navy-800')} />
              <div className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold',
                done && 'border-gold-500 bg-gold-500 text-navy-950',
                active && 'border-gold-500 bg-white text-gold-600 ring-2 ring-gold-500/30 dark:bg-navy-900 dark:text-gold-300',
                !done && !active && 'border-slate-300 bg-white text-slate-400 dark:border-navy-700 dark:bg-navy-900 dark:text-slate-500',
              )}>
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <div className={cn('h-0.5 flex-1', i === steps.length - 1 ? 'bg-transparent' : done ? 'bg-gold-500' : 'bg-slate-200 dark:bg-navy-800')} />
            </div>
            <span className={cn('text-[10px] leading-tight', active ? 'font-bold text-navy-900 dark:text-white' : 'text-slate-500 dark:text-slate-400')}>{s.label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ---------- DESCRIPTION LIST ----------
export function DescriptionList({ items, columns = 2 }: { items: { label: string; value: React.ReactNode }[]; columns?: 1 | 2 | 3 }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3 text-sm', columns === 1 ? 'grid-cols-1' : columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{it.label}</dt>
          <dd className="mt-0.5 break-words font-medium text-navy-900 dark:text-slate-100">{it.value || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Money({ value, className }: { value: number | null | undefined; className?: string }) {
  const n = Number(value ?? 0)
  return <span className={cn('tabular-nums', className)}>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)}</span>
}
