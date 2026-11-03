import { inTransaction } from '../db'
import { audit } from './audit'
import { log } from './logger'
import { startOfToday } from './util'
import { formatDate } from '../../shared/format'

export interface AutomationActor {
  userId?: string | null
  username: string
}

/**
 * Menandai tenggat yang sudah melewati hari ini sebagai TERLAMBAT dan membuat
 * notifikasi. Idempoten: hanya tenggat berstatus AKTIF yang diproses, sehingga
 * pemanggilan berulang tidak menghasilkan notifikasi ganda.
 */
export async function refreshOverdueDeadlines(actor: AutomationActor, now = new Date()): Promise<number> {
  try {
    const cutoff = startOfToday(now)
    return await inTransaction(async (tx) => {
      const overdue = await tx.legalDeadline.findMany({
        where: { status: 'AKTIF', dueDate: { lt: cutoff } },
        select: { id: true, title: true, dueDate: true },
        orderBy: { dueDate: 'asc' },
      })
      for (const deadline of overdue) {
        await tx.legalDeadline.update({ where: { id: deadline.id }, data: { status: 'TERLAMBAT' } })
        await audit(tx, {
          userId: actor.userId ?? null,
          username: actor.username,
          action: 'AUTO_OVERDUE',
          entity: 'LegalDeadline',
          entityId: deadline.id,
          before: { status: 'AKTIF' },
          after: { status: 'TERLAMBAT' },
          meta: { dueDate: deadline.dueDate.toISOString() },
        })
        await tx.notification.create({
          data: {
            type: 'DEADLINE',
            title: 'Tenggat terlambat',
            message: `"${deadline.title}" jatuh tempo ${formatDate(deadline.dueDate)} dan belum diselesaikan.`,
            link: '/kalender',
          },
        })
      }
      return overdue.length
    })
  } catch (err) {
    log.warn('Otomatisasi tenggat gagal dijalankan', String(err))
    return 0
  }
}
