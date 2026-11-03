export class AppError extends Error {
  code: string
  constructor(message: string, code = 'ERROR') {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

export class ValidationError extends AppError {
  details?: unknown
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION')
    this.details = details
  }
}

export class PermissionError extends AppError {
  constructor(message = 'Anda tidak memiliki hak akses untuk tindakan ini.') {
    super(message, 'FORBIDDEN')
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Data tidak ditemukan.') {
    super(message, 'NOT_FOUND')
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT')
  }
}

export function toErrorMessage(err: unknown): string {
  if (err instanceof AppError) return err.message
  if (err instanceof Error) {
    if (err.message.includes('Unique constraint')) return 'Data yang sama sudah ada.'
    if (err.message.includes('Foreign key constraint')) return 'Data masih terhubung dengan data lain.'
    return err.message
  }
  return 'Terjadi kesalahan yang tidak diketahui.'
}
