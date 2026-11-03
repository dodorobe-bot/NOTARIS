import { db } from '../db'

export type SettingsMap = Record<string, string>

export async function getSettings(): Promise<SettingsMap> {
  const rows = await db().setting.findMany()
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export async function getSetting(key: string, fallback: string): Promise<string> {
  const row = await db().setting.findUnique({ where: { key } })
  return row?.value ?? fallback
}

export async function saveSettings(values: SettingsMap, userId?: string | null): Promise<void> {
  for (const [key, value] of Object.entries(values)) {
    await db().setting.upsert({
      where: { key },
      create: { key, value, updatedById: userId ?? null },
      update: { value, updatedById: userId ?? null },
    })
  }
}
