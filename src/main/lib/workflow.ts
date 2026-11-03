import {
  DEED_LOCKED_STATUSES,
  DEED_STATUS_TRANSITIONS,
  WORKFLOW_LABELS,
  WORKFLOW_TRANSITIONS,
} from '../../shared/constants'
import { ConflictError } from './errors'

export function assertTransactionTransition(from: string, to: string): void {
  const allowed = WORKFLOW_TRANSITIONS[from] ?? []
  if (!allowed.includes(to)) {
    throw new ConflictError(
      `Status tidak dapat berpindah dari "${WORKFLOW_LABELS[from] ?? from}" ke "${WORKFLOW_LABELS[to] ?? to}".`,
    )
  }
}

export function assertDeedTransition(from: string, to: string): void {
  const allowed = DEED_STATUS_TRANSITIONS[from] ?? []
  if (!allowed.includes(to)) {
    throw new ConflictError(`Status akta tidak dapat berpindah dari "${from}" ke "${to}".`)
  }
}

export function assertDeedContentEditable(status: string): void {
  if (DEED_LOCKED_STATUSES.includes(status)) {
    throw new ConflictError('Akta yang sudah ditandatangani tidak dapat diubah isinya.')
  }
  if (status === 'CANCELLED') {
    throw new ConflictError('Akta yang dibatalkan tidak dapat diubah.')
  }
}

export function nextTransactionStatuses(from: string): string[] {
  return WORKFLOW_TRANSITIONS[from] ?? []
}

export function nextDeedStatuses(from: string): string[] {
  return DEED_STATUS_TRANSITIONS[from] ?? []
}
