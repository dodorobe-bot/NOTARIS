import { z } from 'zod'
import { WORKFLOW_STATUSES } from './constants'
import {
  GOVERNMENT_AGENCY_CODES,
  GOVERNMENT_FILE_KIND_CODES,
  GOVERNMENT_OFFICIAL_SOURCE_CODES,
  GOVERNMENT_REFERENCE_TYPE_CODES,
  GOVERNMENT_STATUSES,
  GOVERNMENT_SYNC_STATUS_CODES,
  GOVERNMENT_VIEW_CODES,
} from './government'

/** String opsional: '' dianggap null. */
const optText = (max = 500) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v === '' ? null : v ?? null))
const reqText = (min = 1, max = 500) => z.string().trim().min(min).max(max)
const optDate = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((v) => (v ? new Date(v) : null))
  .refine((v) => v === null || !Number.isNaN(v.getTime()), 'Tanggal tidak valid')
const reqDate = z
  .union([z.string(), z.date()])
  .transform((v) => new Date(v))
  .refine((v) => !Number.isNaN(v.getTime()), 'Tanggal tidak valid')
const money = z.number().int().min(0).max(9_000_000_000_000)
const optMoney = z.number().int().min(0).max(9_000_000_000_000).optional().nullable()
const optNum = z.number().min(0).optional().nullable()

export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(25),
  search: z.string().trim().max(200).optional().default(''),
  sortBy: z.string().max(50).optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
})

export const idSchema = z.object({ id: z.string().uuid() })

// ---------- AUTH / SETUP ----------
export const loginSchema = z.object({
  username: reqText(1, 100),
  password: z.string().min(1).max(200),
})
export const unlockSchema = z.object({
  password: z.string().min(1).max(300),
  useRecovery: z.boolean().optional(),
})
export const setupSchema = z.object({
  officeName: reqText(2, 150),
  notaryName: reqText(2, 150),
  adminFullName: reqText(2, 150),
  username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/, 'Username hanya huruf, angka, titik, garis bawah, strip'),
  email: z.string().trim().email().max(150).optional().or(z.literal('')),
  password: z.string().min(10, 'Minimal 10 karakter').max(200),
  masterPassword: z.string().min(12, 'Minimal 12 karakter').max(300),
  confirmMasterPassword: z.string().min(12).max(300),
}).refine((d) => d.masterPassword === d.confirmMasterPassword, {
  message: 'Konfirmasi master password tidak sama',
  path: ['confirmMasterPassword'],
})
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10, 'Minimal 10 karakter').max(200),
})
export const changeMasterPasswordSchema = z.object({
  currentMaster: z.string().min(1),
  newMaster: z.string().min(12, 'Minimal 12 karakter').max(300),
})

// ---------- USERS ----------
export const userCreateSchema = z.object({
  username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/),
  fullName: reqText(2, 150),
  email: z.string().trim().email().max(150).optional().or(z.literal('')).transform((v) => v || null),
  roleId: z.string().uuid(),
  password: z.string().min(10, 'Minimal 10 karakter').max(200),
  isActive: z.boolean().default(true),
})
export const userUpdateSchema = z.object({
  id: z.string().uuid(),
  fullName: reqText(2, 150),
  email: z.string().trim().email().max(150).optional().or(z.literal('')).transform((v) => v || null),
  roleId: z.string().uuid(),
  isActive: z.boolean(),
  password: z.string().min(10).max(200).optional().or(z.literal('')).transform((v) => v || null),
})
export const rolePermissionsSchema = z.object({
  roleId: z.string().uuid(),
  permissionCodes: z.array(z.string()).max(200),
})

// ---------- CLIENTS ----------
export const identitySchema = z.object({
  id: z.string().uuid().optional(),
  docType: reqText(1, 30),
  number: optText(80),
  issuedAt: optDate,
  expiresAt: optDate,
  documentId: z.string().uuid().optional().nullable(),
  notes: optText(500),
})
export const companySchema = z.object({
  companyName: reqText(1, 200),
  legalType: reqText(1, 30),
  establishmentDeedNumber: optText(100),
  establishmentDeedDate: optDate,
  establishmentNotary: optText(150),
  domicile: optText(500),
  companyNpwp: optText(40),
  nib: optText(50),
  pengurusJson: optText(5000),
  shareholdersJson: optText(5000),
  legalityNotes: optText(1000),
  legalityDocumentId: z.string().uuid().optional().nullable(),
})
export const clientSchema = z.object({
  type: z.enum(['PERORANGAN', 'BADAN_HUKUM']),
  fullName: reqText(2, 200),
  nik: optText(40),
  npwp: optText(40),
  birthPlace: optText(100),
  birthDate: optDate,
  gender: z.enum(['LAKI_LAKI', 'PEREMPUAN']).optional().nullable(),
  occupation: optText(100),
  address: optText(1000),
  kelurahan: optText(100),
  kecamatan: optText(100),
  kabupaten: optText(100),
  provinsi: optText(100),
  postalCode: optText(10),
  phone: optText(30),
  email: z.string().trim().email('Email tidak valid').max(150).optional().nullable().or(z.literal('')).transform((v) => v || null),
  status: z.enum(['AKTIF', 'NONAKTIF', 'BLACKLIST']).default('AKTIF'),
  internalNotes: optText(3000),
  identities: z.array(identitySchema).max(20).optional().default([]),
  company: companySchema.optional().nullable(),
})
export const clientUpdateSchema = clientSchema.extend({ id: z.string().uuid() })
export const clientListSchema = paginationSchema.extend({
  type: z.string().optional(),
  status: z.string().optional(),
})

// ---------- TRANSACTIONS ----------
export const partySchema = z.object({
  id: z.string().uuid().optional(),
  role: reqText(1, 30),
  name: reqText(1, 200),
  nik: optText(40),
  address: optText(1000),
  phone: optText(30),
  clientId: z.string().uuid().optional().nullable(),
  notes: optText(500),
})
export const transactionSchema = z.object({
  clientId: z.string().uuid(),
  type: z.enum(['NOTARIS', 'PPAT']),
  serviceType: optText(50),
  title: reqText(2, 250),
  description: optText(3000),
  priority: z.enum(['RENDAH', 'NORMAL', 'TINGGI']).default('NORMAL'),
  assignedToId: z.string().uuid().optional().nullable(),
  parties: z.array(partySchema).max(50).optional().default([]),
})
export const transactionUpdateSchema = transactionSchema.extend({ id: z.string().uuid() })
export const transactionStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(WORKFLOW_STATUSES),
  note: optText(1000),
})
export const transactionListSchema = paginationSchema.extend({
  type: z.string().optional(),
  status: z.string().optional(),
  clientId: z.string().uuid().optional(),
})

// ---------- DEEDS ----------
export const deedPartySchema = partySchema
export const deedSchema = z.object({
  deedTypeId: z.string().uuid(),
  deedDate: reqDate,
  clientId: z.string().uuid(),
  transactionId: z.string().uuid().optional().nullable(),
  title: optText(300),
  penghadap: optText(5000),
  komparisi: optText(20000),
  premis: optText(20000),
  isi: optText(50000),
  penutup: optText(10000),
  witnessesJson: optText(5000),
  draftMakerId: z.string().uuid().optional().nullable(),
  notaryId: z.string().uuid().optional().nullable(),
  notes: optText(2000),
  parties: z.array(deedPartySchema).max(50).optional().default([]),
})
export const deedUpdateSchema = deedSchema.extend({ id: z.string().uuid() })
export const deedStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['DRAFT', 'REVIEW', 'APPROVED', 'SIGNED', 'REGISTERED', 'ARCHIVED', 'CANCELLED']),
  note: optText(1000),
})
export const deedListSchema = paginationSchema.extend({
  status: z.string().optional(),
  deedTypeId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  year: z.number().int().optional(),
})
export const repertoriumSchema = z.object({
  deedId: z.string().uuid(),
  notes: optText(1000),
})
export const protocolSchema = z.object({
  deedId: z.string().uuid().optional().nullable(),
  registerNumber: z.number().int().min(1).optional(),
  year: z.number().int().min(1900).max(2200),
  sequenceNo: z.number().int().min(1).optional(),
  protocolType: z.enum(['MINUTA', 'SALINAN', 'ARSIP']),
  location: optText(200),
  notes: optText(1000),
})

// ---------- PPAT ----------
export const certificateSchema = z.object({
  id: z.string().uuid().optional(),
  number: reqText(1, 100),
  type: reqText(1, 30),
  issuedAt: optDate,
  expiryAt: optDate,
  ownerName: optText(200),
  documentId: z.string().uuid().optional().nullable(),
  notes: optText(500),
})
export const propertySchema = z.object({
  transactionId: z.string().uuid().optional().nullable(),
  certificateNumber: optText(100),
  rightType: optText(40),
  landArea: optNum,
  buildingArea: optNum,
  address: optText(1000),
  kelurahan: optText(100),
  kecamatan: optText(100),
  kabupaten: optText(100),
  provinsi: optText(100),
  ownerName: optText(200),
  nop: optText(50),
  njop: optMoney,
  transactionPrice: optMoney,
  notes: optText(1000),
  certificates: z.array(certificateSchema).max(20).optional().default([]),
})
export const propertyUpdateSchema = propertySchema.extend({ id: z.string().uuid() })

// ---------- DOCUMENTS ----------
export const documentUploadSchema = z.object({
  tempPath: z.string().min(1),
  originalName: reqText(1, 300),
  title: reqText(1, 300),
  categoryId: z.string().uuid(),
  clientId: z.string().uuid().optional().nullable(),
  transactionId: z.string().uuid().optional().nullable(),
  deedId: z.string().uuid().optional().nullable(),
  notes: optText(1000),
  isConfidential: z.boolean().default(false),
})
export const documentReplaceSchema = z.object({
  id: z.string().uuid(),
  tempPath: z.string().min(1),
  originalName: reqText(1, 300),
  notes: optText(1000),
})
export const documentUpdateSchema = z.object({
  id: z.string().uuid(),
  title: reqText(1, 300),
  categoryId: z.string().uuid(),
  notes: optText(1000),
  isConfidential: z.boolean(),
  clientId: z.string().uuid().optional().nullable(),
  transactionId: z.string().uuid().optional().nullable(),
  deedId: z.string().uuid().optional().nullable(),
})
export const documentListSchema = paginationSchema.extend({
  categoryId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  transactionId: z.string().uuid().optional(),
  deedId: z.string().uuid().optional(),
})

// ---------- FINANCE ----------
export const invoiceItemSchema = z.object({
  id: z.string().uuid().optional(),
  kind: reqText(1, 40),
  description: reqText(1, 300),
  quantity: z.number().positive().max(100000),
  unitPrice: money,
})
export const invoiceSchema = z.object({
  clientId: z.string().uuid(),
  transactionId: z.string().uuid().optional().nullable(),
  deedId: z.string().uuid().optional().nullable(),
  issueDate: reqDate,
  dueDate: optDate,
  discount: money.default(0),
  taxPercent: z.number().min(0).max(100).default(0),
  notes: optText(2000),
  status: z.enum(['DRAFT', 'UNPAID']).default('DRAFT'),
  items: z.array(invoiceItemSchema).min(1, 'Minimal satu item'),
})
export const invoiceUpdateSchema = invoiceSchema.extend({ id: z.string().uuid() })
export const invoiceListSchema = paginationSchema.extend({
  status: z.string().optional(),
  clientId: z.string().uuid().optional(),
})
export const paymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.number().int().min(1),
  method: reqText(1, 30),
  paidAt: reqDate,
  reference: optText(200),
  notes: optText(1000),
})
export const expenseSchema = z.object({
  category: reqText(1, 40),
  description: reqText(2, 300),
  amount: z.number().int().min(1),
  expenseDate: reqDate,
  paidTo: optText(200),
  method: reqText(1, 30),
  receiptDocumentId: z.string().uuid().optional().nullable(),
})
export const expenseListSchema = paginationSchema.extend({
  category: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
})
export const invoiceVoidSchema = z.object({ id: z.string().uuid(), reason: reqText(3, 500) })

// ---------- CALENDAR / TASKS / DEADLINES ----------
export const appointmentSchema = z.object({
  title: reqText(2, 250),
  clientId: z.string().uuid().optional().nullable(),
  transactionId: z.string().uuid().optional().nullable(),
  deedId: z.string().uuid().optional().nullable(),
  type: reqText(1, 40),
  startAt: reqDate,
  endAt: optDate,
  location: optText(300),
  assignedToId: z.string().uuid().optional().nullable(),
  status: z.enum(['TERJADWAL', 'SELESAI', 'DIBATALKAN']).default('TERJADWAL'),
  notes: optText(2000),
})
export const appointmentUpdateSchema = appointmentSchema.extend({ id: z.string().uuid() })
export const taskSchema = z.object({
  title: reqText(2, 250),
  description: optText(2000),
  transactionId: z.string().uuid().optional().nullable(),
  deedId: z.string().uuid().optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
  dueDate: optDate,
  priority: z.enum(['RENDAH', 'NORMAL', 'TINGGI']).default('NORMAL'),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']).default('TODO'),
})
export const deadlineSchema = z.object({
  title: reqText(2, 250),
  type: reqText(1, 40),
  dueDate: reqDate,
  transactionId: z.string().uuid().optional().nullable(),
  deedId: z.string().uuid().optional().nullable(),
  propertyId: z.string().uuid().optional().nullable(),
  status: z.enum(['AKTIF', 'SELESAI', 'TERLAMBAT', 'DIBATALKAN']).default('AKTIF'),
  notes: optText(1000),
})

// ---------- GOVERNMENT INTEGRATION GATEWAY ----------
const govAgency = z.enum(GOVERNMENT_AGENCY_CODES)
const govStatus = z.enum(GOVERNMENT_STATUSES)
const govFileKind = z.enum(GOVERNMENT_FILE_KIND_CODES)
const govReferenceType = z.enum(GOVERNMENT_REFERENCE_TYPE_CODES)
const govSource = z.enum(GOVERNMENT_OFFICIAL_SOURCE_CODES)
const govUuid = z.string().uuid()
/** Data isian pengajuan: kunci field → nilai teks. Nilai kosong dibuang di handler. */
export const governmentDataSchema = z
  .record(z.string().trim().min(1).max(60), z.string().trim().max(2000))
  .refine((v) => Object.keys(v).length <= 30, 'Data pengajuan maksimal 30 isian')

export const governmentServiceListSchema = z.object({
  agency: govAgency.optional(),
  includeInactive: z.boolean().optional().default(false),
})
export const governmentSubmissionListSchema = paginationSchema.extend({
  agency: govAgency.optional(),
  internalStatus: govStatus.optional(),
  view: z.enum(GOVERNMENT_VIEW_CODES).optional().default('SEMUA'),
  serviceId: govUuid.optional(),
  clientId: govUuid.optional(),
  transactionId: govUuid.optional(),
})
export const governmentSubmissionSchema = z.object({
  agency: govAgency,
  serviceId: govUuid,
  clientId: govUuid.optional().nullable(),
  transactionId: govUuid.optional().nullable(),
  title: reqText(3, 300),
  description: optText(2000),
  data: governmentDataSchema.default({}),
})
/** Layanan dan agen tidak dapat diubah setelah pengajuan dibuat (dijaga trigger). */
export const governmentSubmissionUpdateSchema = z.object({
  id: govUuid,
  title: reqText(3, 300),
  description: optText(2000),
  clientId: govUuid.optional().nullable(),
  transactionId: govUuid.optional().nullable(),
  data: governmentDataSchema.default({}),
})
export const governmentStatusSchema = z.object({
  id: govUuid,
  toStatus: govStatus,
  officialStatus: optText(120),
  source: govSource.default('MANUAL'),
  note: optText(500),
})
export const governmentPortalOpenSchema = z.object({
  id: govUuid,
  /** Renderer mengirim kondisi jaringan perangkat saat portal dibuka. */
  online: z.boolean().default(true),
})
export const governmentOfficialStatusSchema = z.object({
  id: govUuid,
  officialStatus: reqText(2, 120),
  source: govSource.default('PORTAL'),
  note: optText(500),
})
export const governmentReferenceSchema = z.object({
  submissionId: govUuid,
  type: govReferenceType,
  value: reqText(1, 150),
  issuedAt: optDate,
  source: govSource.default('PORTAL'),
  notes: optText(500),
})
export const governmentFileAddSchema = z.object({
  submissionId: govUuid,
  kind: govFileKind,
  tempPath: z.string().min(1),
  originalName: reqText(1, 300),
  notes: optText(500),
})
export const governmentFileListSchema = paginationSchema.extend({
  agency: govAgency.optional(),
  kind: govFileKind.optional(),
  submissionId: govUuid.optional(),
})
export const governmentSyncLogListSchema = paginationSchema.extend({
  agency: govAgency.optional(),
  status: z.enum(GOVERNMENT_SYNC_STATUS_CODES).optional(),
  submissionId: govUuid.optional(),
})
export const governmentConfigUpdateSchema = z.object({
  agency: govAgency,
  notes: optText(1000),
  /** Tidak boleh diaktifkan: tidak ada API resmi yang terverifikasi. */
  apiEnabled: z.boolean().optional().default(false),
})
export const governmentCredentialSchema = z.object({
  agency: govAgency,
  label: reqText(2, 80),
  accountHint: optText(120),
  secret: z.string().min(4, 'Minimal 4 karakter').max(300),
})
export const governmentExportSummarySchema = z.object({
  id: govUuid,
  filePath: z.string().min(1).optional(),
})

// ---------- SETTINGS / BACKUP / TEMPLATES ----------
export const settingsUpdateSchema = z.object({
  values: z.record(z.string(), z.string().max(2000)),
})
export const backupCreateSchema = z.object({
  passphrase: z.string().min(8, 'Minimal 8 karakter').max(200).optional(),
  includeDocuments: z.boolean().default(true),
  note: optText(300),
})
export const backupRestoreSchema = z.object({
  filePath: z.string().min(1),
  passphrase: z.string().min(1).max(200),
})
export const templateSaveSchema = z.object({
  category: z.enum(['notary', 'ppat', 'invoices']),
  fileName: reqText(1, 200),
  tempPath: z.string().min(1),
})

export type LoginInput = z.infer<typeof loginSchema>
export type ClientInput = z.infer<typeof clientSchema>
export type TransactionInput = z.infer<typeof transactionSchema>
export type DeedInput = z.infer<typeof deedSchema>
export type InvoiceInput = z.infer<typeof invoiceSchema>
export type PaymentInput = z.infer<typeof paymentSchema>
export type ExpenseInput = z.infer<typeof expenseSchema>
export type PropertyInput = z.infer<typeof propertySchema>
export type AppointmentInput = z.infer<typeof appointmentSchema>
export type TaskInput = z.infer<typeof taskSchema>
export type DocumentUploadInput = z.infer<typeof documentUploadSchema>
export type SetupInput = z.infer<typeof setupSchema>
export type PaginationInput = z.infer<typeof paginationSchema>
