import { AppError } from '../../lib/errors'
import { ahuAdapter } from './ahu/ahu-adapter'
import { bpnAdapter } from './atr-bpn/bpn-adapter'
import { assertOfficialPortalUrl } from './portal'
import type { GovernmentAdapter } from './types'

const ADAPTERS: ReadonlyMap<string, GovernmentAdapter> = new Map([
  ['AHU', ahuAdapter],
  ['BPN', bpnAdapter],
])

export function adapterFor(agency: string): GovernmentAdapter {
  const adapter = ADAPTERS.get(agency)
  if (!adapter) throw new AppError(`Gateway integrasi untuk "${agency}" belum tersedia.`, 'VALIDATION')
  assertOfficialPortalUrl(adapter.portalUrl)
  return adapter
}

export function portalUrlFor(agency: string): string {
  return adapterFor(agency).portalUrl
}

export function checklistFor(agency: string, serviceCode: string): string[] {
  return adapterFor(agency).checklist(serviceCode)
}

/** Deskripsi kapabilitas yang jujur: mode semi-otomatis, tanpa API resmi aktif. */
export function integrationCapabilities() {
  return [...ADAPTERS.values()].map((adapter) => ({
    agency: adapter.agency,
    label: adapter.label,
    portalUrl: adapter.portalUrl,
    mode: 'SEMI_OTOMATIS',
    officialApiAvailable: adapter.officialApiAvailable,
    automatedSubmission: adapter.automatedSubmission,
    note: adapter.note(),
  }))
}
