import { useEffect, useState } from 'react'
import { ExternalLink, Plus, X } from 'lucide-react'
import { Badge, Button, Field, Input, cn, type BadgeTone } from '@/components/ui'
import { GOVERNMENT_STATUS_LABELS, type GovernmentStatus } from '@shared/government'

export interface FieldTemplate {
  key: string
  label: string
  placeholder?: string
}

/** Alur utama pengajuan; status akhir (DITOLAK/DIBATALKAN) berada di luar baris ini. */
export const GOV_STEPS: { status: GovernmentStatus; label: string }[] = [
  { status: 'DRAFT', label: 'Draft' },
  { status: 'SIAP_DIAJUKAN', label: 'Siap Diajukan' },
  { status: 'MENUNGGU_PORTAL', label: 'Menunggu Portal' },
  { status: 'DIAJUKAN', label: 'Diajukan' },
  { status: 'DIPROSES', label: 'Diproses' },
  { status: 'SELESAI', label: 'Selesai' },
]

const STATUS_TONE: Record<GovernmentStatus, BadgeTone> = {
  DRAFT: 'gray',
  SIAP_DIAJUKAN: 'blue',
  MENUNGGU_PORTAL: 'amber',
  DIAJUKAN: 'blue',
  DIPROSES: 'amber',
  SELESAI: 'green',
  DITOLAK: 'red',
  DIBATALKAN: 'red',
}

export function GovStatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-slate-400">—</span>
  const key = status as GovernmentStatus
  return <Badge tone={STATUS_TONE[key] ?? 'neutral'}>{GOVERNMENT_STATUS_LABELS[key] ?? status}</Badge>
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}

export function OnlineBadge({ online }: { online: boolean }) {
  return (
    <Badge tone={online ? 'green' : 'amber'}>
      <span className={cn('mr-1.5 inline-block h-1.5 w-1.5 rounded-full', online ? 'bg-emerald-500' : 'bg-amber-500')} />
      {online ? 'Daring' : 'Luring — tindakan dicatat menunggu'}
    </Badge>
  )
}

/** Tautan asli ke portal resmi; Electron meneruskan tautan https ke browser sistem. */
export function PortalAnchor({
  url, label, onOpened, className,
}: { url: string; label: string; onOpened?: () => void; className?: string }) {
  return (
    <a
      className={cn('btn-gold inline-flex items-center gap-2', className)}
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={onOpened}
    >
      <ExternalLink className="h-4 w-4" />
      {label}
    </a>
  )
}

export function MissingList({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <ul className="mt-1 space-y-0.5 text-[11px] text-amber-800 dark:text-amber-300">
      {items.map((m) => (
        <li key={m} className="flex gap-1.5">
          <span className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-amber-500" />
          {m}
        </li>
      ))}
    </ul>
  )
}

export function DataFieldsEditor({
  fields, values, onChange, disabled,
}: {
  fields: FieldTemplate[]
  values: Record<string, string>
  onChange: (next: Record<string, string>) => void
  disabled?: boolean
}) {
  const [extraKey, setExtraKey] = useState('')
  const templateKeys = fields.map((f) => f.key)
  const extras = Object.keys(values).filter((k) => !templateKeys.includes(k))

  function addExtra() {
    const key = extraKey.trim()
    if (!key || templateKeys.includes(key) || values[key] !== undefined) return
    onChange({ ...values, [key]: '' })
    setExtraKey('')
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <Field key={f.key} label={f.label}>
            <Input
              value={values[f.key] ?? ''}
              placeholder={f.placeholder}
              disabled={disabled}
              maxLength={2000}
              onChange={(e) => onChange({ ...values, [f.key]: e.target.value })}
            />
          </Field>
        ))}
        {extras.map((key) => (
          <Field key={key} label={key}>
            <div className="flex gap-1.5">
              <Input
                value={values[key] ?? ''}
                disabled={disabled}
                maxLength={2000}
                onChange={(e) => onChange({ ...values, [key]: e.target.value })}
              />
              <IconButtonRemove disabled={disabled} onClick={() => {
                const next = { ...values }
                delete next[key]
                onChange(next)
              }} />
            </div>
          </Field>
        ))}
      </div>
      {!disabled && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Isian tambahan" className="min-w-[220px] flex-1">
            <Input
              value={extraKey}
              placeholder="mis. nomorSKDPP / namaPanitia"
              maxLength={60}
              onChange={(e) => setExtraKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addExtra()
                }
              }}
            />
          </Field>
          <Button variant="secondary" onClick={addExtra} disabled={!extraKey.trim()}>
            <Plus className="h-4 w-4" /> Tambah Isian
          </Button>
        </div>
      )}
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Isian ini adalah salinan data yang operator baca dari portal resmi; nilai kosong tidak disimpan.
      </p>
    </div>
  )
}

function IconButtonRemove({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      title="Hapus isian"
      aria-label="Hapus isian"
      disabled={disabled}
      onClick={onClick}
      className="btn-ghost !p-2 text-red-500 disabled:opacity-40"
    >
      <X className="h-4 w-4" />
    </button>
  )
}
