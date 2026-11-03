import fs from 'node:fs'
import path from 'node:path'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { dirs, templatesBundledDir } from './paths'
import { isTemplateFileName } from './template-name'

export { isTemplateFileName }

export function resolveTemplate(relative: string): string {
  const user = path.join(dirs.templates(), relative)
  if (fs.existsSync(user)) return user
  const bundled = path.join(templatesBundledDir(), relative)
  if (fs.existsSync(bundled)) return bundled
  throw new Error(`Template "${relative}" tidak ditemukan. Unggah template melalui Pengaturan.`)
}

export function renderDocx(templatePath: string, data: Record<string, unknown>, outPath: string): void {
  if (!fs.existsSync(templatePath)) throw new Error(`Template tidak ditemukan: ${path.basename(templatePath)}`)
  const zip = new PizZip(fs.readFileSync(templatePath))
  let doc: Docxtemplater
  try {
    doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{', end: '}' },
    })
    doc.render(data)
  } catch (err) {
    const e = err as { properties?: { errors?: { message: string }[] }; message?: string }
    const detail = e.properties?.errors?.map((x) => x.message).join('; ') ?? e.message ?? 'Kesalahan template'
    throw new Error(`Gagal mengisi template DOCX: ${detail}`)
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
  fs.writeFileSync(outPath, buf)
}

export function listTemplates(): { category: string; fileName: string; sizeBytes: number; modifiedAt: string }[] {
  const out: { category: string; fileName: string; sizeBytes: number; modifiedAt: string }[] = []
  for (const category of ['notary', 'ppat', 'invoices']) {
    const dir = path.join(dirs.templates(), category)
    if (!fs.existsSync(dir)) continue
    for (const fileName of fs.readdirSync(dir)) {
      if (!isTemplateFileName(fileName)) continue
      const st = fs.statSync(path.join(dir, fileName))
      out.push({ category, fileName, sizeBytes: st.size, modifiedAt: st.mtime.toISOString() })
    }
  }
  return out
}
