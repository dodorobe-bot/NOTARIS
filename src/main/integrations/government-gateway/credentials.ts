import { safeStorage } from 'electron'
import { AppError } from '../../lib/errors'
import { CIPHER_PREFIX, isEncryptedCredential } from './rules'

export type CredentialAlgorithm = 'DPAPI_SAFE_STORAGE'

export function credentialEncryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function encryptionAlgorithmLabel(): string {
  return 'DPAPI (safeStorage Windows)'
}

/** Rahasia portal disandikan OS sebelum disimpan; basis data tidak pernah memuat plaintext. */
export function encryptCredential(secret: string): string {
  if (!secret) throw new AppError('Kata sandi tidak boleh kosong.', 'VALIDATION')
  if (!credentialEncryptionAvailable()) {
    throw new AppError(
      'Penyimpanan terenkripsi sistem operasi tidak tersedia pada perangkat ini. Kredensial portal tidak disimpan agar tidak tersimpan sebagai teks terbuka.',
      'CONFLICT',
    )
  }
  const cipher = safeStorage.encryptString(secret)
  return `${CIPHER_PREFIX}${cipher.toString('base64')}`
}

export function decryptCredential(cipherText: string): string {
  if (!isEncryptedCredential(cipherText)) {
    throw new AppError('Kredensial tersimpan tidak memiliki format terenkripsi yang sah.', 'CONFLICT')
  }
  if (!credentialEncryptionAvailable()) {
    throw new AppError('Mesin dekripsi DPAPI tidak tersedia pada sesi ini.', 'CONFLICT')
  }
  try {
    return safeStorage.decryptString(Buffer.from(cipherText.slice(CIPHER_PREFIX.length), 'base64'))
  } catch {
    throw new AppError('Kredensial tidak dapat dibaca; simpan ulang melalui Konfigurasi Integrasi.', 'CONFLICT')
  }
}
