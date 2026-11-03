import type { Tx } from '../db'
import type { PrismaClient } from '@prisma/client'
import { APP_TIMEZONE } from '../../shared/format'
import { zonedParts } from './time'

type DbLike = Tx | PrismaClient

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

function periodKeyFor(resetPeriod: string, at: Date, timeZone: string): string {
  const p = zonedParts(at, timeZone)
  if (resetPeriod === 'YEAR') return String(p.year)
  if (resetPeriod === 'MONTH') return `${p.year}-${String(p.month).padStart(2, '0')}`
  return ''
}

export function formatSequence(
  pattern: string,
  lastNumber: number,
  at: Date,
  prefix: string,
  timeZone = APP_TIMEZONE,
): string {
  const p = zonedParts(at, timeZone)
  return pattern
    .replace(/\{PREFIX\}/g, prefix)
    .replace(/\{YYYY\}/g, String(p.year))
    .replace(/\{YY\}/g, String(p.year).slice(-2))
    .replace(/\{MM\}/g, String(p.month).padStart(2, '0'))
    .replace(/\{DD\}/g, String(p.day).padStart(2, '0'))
    .replace(/\{ROMAN\}/g, ROMAN[p.month])
    .replace(/\{SEQ:(\d+)\}/g, (_m, width: string) => String(lastNumber).padStart(Number(width), '0'))
}

/**
 * Ambil nomor urut berikutnya secara atomik di dalam transaksi database.
 * Penambahan dilakukan lewat satu UPDATE agar dua transaksi bersamaan tidak
 * memperoleh nomor yang sama.
 */
export async function nextNumber(tx: DbLike, key: string, at: Date = new Date()): Promise<string> {
  const seq = await tx.numberingSequence.findUnique({ where: { key } })
  if (!seq) throw new Error(`Urutan penomoran "${key}" belum dikonfigurasi`)
  const pk = periodKeyFor(seq.resetPeriod, at, APP_TIMEZONE)
  const affected = await tx.$executeRaw`
    UPDATE "NumberingSequence"
    SET "lastNumber" = CASE WHEN "periodKey" = ${pk} THEN "lastNumber" + 1 ELSE 1 END,
        "periodKey" = ${pk}
    WHERE "key" = ${key}
  `
  if (affected === 0) throw new Error(`Urutan penomoran "${key}" tidak dapat diperbarui`)
  const updated = await tx.numberingSequence.findUnique({ where: { key } })
  if (!updated) throw new Error(`Urutan penomoran "${key}" hilang saat diperbarui`)
  return formatSequence(updated.pattern, updated.lastNumber, at, updated.prefix, APP_TIMEZONE)
}

export async function previewNumber(tx: DbLike, key: string, at: Date = new Date()): Promise<string> {
  const seq = await tx.numberingSequence.findUnique({ where: { key } })
  if (!seq) return ''
  const pk = periodKeyFor(seq.resetPeriod, at, APP_TIMEZONE)
  const next = (seq.periodKey === pk ? seq.lastNumber : 0) + 1
  return formatSequence(seq.pattern, next, at, seq.prefix, APP_TIMEZONE)
}
