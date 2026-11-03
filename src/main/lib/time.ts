import { APP_TIMEZONE } from '../../shared/format'

export interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatters.get(timeZone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(timeZone, fmt)
  }
  return fmt
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date())
    return true
  } catch {
    return false
  }
}

/** Komponen tanggal/jam pada zona waktu tertentu (bukan zona waktu mesin). */
export function zonedParts(date: Date, timeZone = APP_TIMEZONE): ZonedParts {
  const values: Record<string, number> = {}
  for (const part of partsFormatter(timeZone).formatToParts(date)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value)
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  }
}

/** Kunci tanggal YYYY-MM-DD menurut zona kantor. */
export function zonedDateKey(date: Date, timeZone = APP_TIMEZONE): string {
  const p = zonedParts(date, timeZone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** Kunci bulan YYYY-MM menurut zona kantor. */
export function zonedMonthKey(date: Date, timeZone = APP_TIMEZONE): string {
  const p = zonedParts(date, timeZone)
  return `${p.year}-${String(p.month).padStart(2, '0')}`
}

function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, date.getMilliseconds())
  return asUtc - date.getTime()
}

/** Instant UTC untuk komponen waktu lokal kantor. */
export function fromZonedParts(
  parts: Pick<ZonedParts, 'year' | 'month' | 'day'> & Partial<Omit<ZonedParts, 'year' | 'month' | 'day'>>,
  timeZone = APP_TIMEZONE,
): Date {
  const { year, month, day } = parts
  const hour = parts.hour ?? 0
  const minute = parts.minute ?? 0
  const second = parts.second ?? 0
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, 0)
  let instant = guess - offsetMs(new Date(guess), timeZone)
  // Iterasi kedua menangani pergeseran DST di zona yang memakainya.
  instant = guess - offsetMs(new Date(instant), timeZone)
  return new Date(instant)
}

export function startOfZonedDay(date: Date, timeZone = APP_TIMEZONE): Date {
  const p = zonedParts(date, timeZone)
  return fromZonedParts({ year: p.year, month: p.month, day: p.day }, timeZone)
}

export function endOfZonedDay(date: Date, timeZone = APP_TIMEZONE): Date {
  const start = startOfZonedDay(date, timeZone)
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)
}

export function startOfZonedMonth(date: Date, timeZone = APP_TIMEZONE): Date {
  const p = zonedParts(date, timeZone)
  return fromZonedParts({ year: p.year, month: p.month, day: 1 }, timeZone)
}

/** Awal bulan yang digeser sejumlah bulan, tetap pada zona kantor. */
export function startOfZonedMonthOffset(date: Date, months: number, timeZone = APP_TIMEZONE): Date {
  const p = zonedParts(date, timeZone)
  const anchor = new Date(Date.UTC(p.year, p.month - 1 + months, 1, 12, 0, 0))
  const shifted = zonedParts(anchor, timeZone)
  return fromZonedParts({ year: shifted.year, month: shifted.month, day: 1 }, timeZone)
}

export function zonedMonthKeyOffset(date: Date, months: number, timeZone = APP_TIMEZONE): string {
  return zonedMonthKey(startOfZonedMonthOffset(date, months, timeZone), timeZone)
}
