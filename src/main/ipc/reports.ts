import { z } from 'zod'
import { db } from '../db'
import { route } from './router'
import { audit } from '../lib/audit'
import { buildReport, REPORT_DEFINITIONS, type ReportFilters } from '../lib/reports'
import { exportReportExcel, exportReportPdf, exportInvoicePdf } from '../lib/exporters'
import { getSettings } from '../lib/settings'
import { NotFoundError } from '../lib/errors'
import { idSchema } from '../../shared/schemas'

const reportRequestSchema = z.object({
  id: z.enum(REPORT_DEFINITIONS.map((r) => r.id) as [string, ...string[]]),
  from: z.string().optional(),
  to: z.string().optional(),
  year: z.number().int().min(1900).max(2200).optional(),
  status: z.string().optional(),
})

function filtersOf(input: { from?: string; to?: string; year?: number; status?: string }): ReportFilters {
  return { from: input.from, to: input.to, year: input.year, status: input.status }
}

route('reports.definitions', {
  auth: 'session',
  perm: 'reports.view',
  handler: () => REPORT_DEFINITIONS,
})

route('reports.generate', {
  auth: 'session',
  perm: 'reports.view',
  schema: reportRequestSchema,
  handler: async (input, ctx) => buildReport(input.id, filtersOf(input), ctx.session!.fullName),
})

route('reports.exportPdf', {
  auth: 'session',
  perm: 'reports.view',
  schema: reportRequestSchema,
  handler: async (input, ctx) => {
    const result = await buildReport(input.id, filtersOf(input), ctx.session!.fullName)
    const exported = await exportReportPdf(result)
    await audit(db(), {
      userId: ctx.session!.userId, username: ctx.username, action: 'EXPORT_PDF', entity: 'Report',
      entityId: input.id, after: { fileName: exported.fileName, rows: result.rows.length },
    })
    return exported
  },
})

route('reports.exportExcel', {
  auth: 'session',
  perm: 'reports.view',
  schema: reportRequestSchema,
  handler: async (input, ctx) => {
    const result = await buildReport(input.id, filtersOf(input), ctx.session!.fullName)
    const exported = exportReportExcel(result)
    await audit(db(), {
      userId: ctx.session!.userId, username: ctx.username, action: 'EXPORT_EXCEL', entity: 'Report',
      entityId: input.id, after: { fileName: exported.fileName, rows: result.rows.length },
    })
    return exported
  },
})

route('invoices.exportPdf', {
  auth: 'session',
  perm: 'finance.view',
  schema: idSchema,
  handler: async ({ id }, ctx) => {
    const invoice = await db().invoice.findUnique({
      where: { id },
      include: { client: true, items: { orderBy: { description: 'asc' } } },
    })
    if (!invoice) throw new NotFoundError('Invoice tidak ditemukan.')
    const settings = await getSettings()
    const exported = await exportInvoicePdf({
      number: invoice.number,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      status: invoice.status,
      client: {
        fullName: invoice.client.fullName,
        code: invoice.client.code,
        address: invoice.client.address,
        phone: invoice.client.phone,
      },
      items: invoice.items,
      subtotal: invoice.subtotal,
      discount: invoice.discount,
      taxPercent: invoice.taxPercent,
      taxAmount: invoice.taxAmount,
      total: invoice.total,
      paidAmount: invoice.paidAmount,
      notes: invoice.notes,
      office: settings,
    })
    await audit(db(), {
      userId: ctx.session!.userId, username: ctx.username, action: 'EXPORT_PDF', entity: 'Invoice',
      entityId: invoice.id, after: { fileName: exported.fileName },
    })
    return exported
  },
})
