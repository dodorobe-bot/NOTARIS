import { describe, expect, it } from 'vitest'
import { validateSettings } from '../src/main/lib/settings-validation'

describe('validasi pengaturan sistem', () => {
  it('menerima nilai yang sah', () => {
    expect(validateSettings({
      'system.timezone': 'Asia/Jakarta',
      'system.dateFormat': 'DD-MM-YYYY',
      'system.autoBackupDaily': 'true',
      'system.preMigrationBackup': 'false',
      'system.backupRetention': '30',
      'finance.defaultTaxPercent': '11',
      'security.passwordMinLength': '10',
    })).toBeNull()
  })

  it('menolak zona waktu yang tidak dikenal', () => {
    expect(validateSettings({ 'system.timezone': 'Mars/Olympus' })).toMatch(/Zona waktu/)
  })

  it('menolak nilai boolean selain true/false', () => {
    expect(validateSettings({ 'system.autoBackupDaily': 'ya' })).toMatch(/true atau false/)
  })

  it('menolak angka di luar batas', () => {
    expect(validateSettings({ 'finance.defaultTaxPercent': '150' })).toMatch(/antara 0 dan 100/)
    expect(validateSettings({ 'system.backupRetention': '0' })).toMatch(/antara 1 dan 365/)
    expect(validateSettings({ 'security.maxLoginAttempts': 'lima' })).toMatch(/angka bulat/)
  })

  it('menolak format tanggal yang tidak didukung aplikasi', () => {
    expect(validateSettings({ 'system.dateFormat': 'MM/DD/YYYY' })).toMatch(/DD-MM-YYYY/)
  })
})
