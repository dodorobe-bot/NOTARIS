import { isValidTimeZone } from './time'

export type SettingsValues = Record<string, string>

const INTEGER_RULES: Record<string, { min: number; max: number; label: string }> = {
  'system.sessionTimeoutMinutes': { min: 1, max: 1440, label: 'Batas idle sesi' },
  'system.backupRetention': { min: 1, max: 365, label: 'Jumlah backup otomatis' },
  'finance.defaultTaxPercent': { min: 0, max: 100, label: 'Persentase pajak' },
  'finance.invoiceDueDays': { min: 0, max: 365, label: 'Jatuh tempo invoice' },
  'security.maxLoginAttempts': { min: 1, max: 100, label: 'Percobaan login' },
  'security.passwordMinLength': { min: 8, max: 128, label: 'Panjang minimal password' },
}

/** Validasi nilai pengaturan agar otomatisasi tidak berjalan dengan konfigurasi rusak. */
export function validateSettings(values: SettingsValues): string | null {
  for (const [key, raw] of Object.entries(values)) {
    if (key === 'system.timezone' && !isValidTimeZone(raw)) {
      return `Zona waktu tidak valid: ${raw || '(kosong)'}`
    }
    if (key === 'system.dateFormat' && !/^DD-MM-YYYY$/.test(raw)) {
      return 'Format tanggal harus DD-MM-YYYY.'
    }
    if ((key === 'system.autoBackupDaily' || key === 'system.preMigrationBackup') && raw !== 'true' && raw !== 'false') {
      return `Nilai ${key} harus true atau false.`
    }
    const rule = INTEGER_RULES[key]
    if (rule) {
      if (!/^\d+$/.test(raw.trim())) return `${rule.label} harus berupa angka bulat.`
      const n = Number(raw)
      if (n < rule.min || n > rule.max) return `${rule.label} harus antara ${rule.min} dan ${rule.max}.`
    }
  }
  return null
}
