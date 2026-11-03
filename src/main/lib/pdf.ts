import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow } from 'electron'
import { dirs } from './paths'
import { log } from './logger'

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Render HTML menjadi PDF melalui Chromium (offline, tanpa layanan eksternal). */
export async function htmlToPdf(html: string, outPath: string, opts: { landscape?: boolean } = {}): Promise<string> {
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  const tmpHtml = path.join(dirs.tmp(), `render-${Date.now()}-${Math.random().toString(36).slice(2)}.html`)
  fs.mkdirSync(dirs.tmp(), { recursive: true })
  fs.writeFileSync(tmpHtml, html, 'utf8')
  const win = new BrowserWindow({
    show: false,
    width: 1000,
    height: 1400,
    webPreferences: { sandbox: true, javascript: false, contextIsolation: true },
  })
  try {
    await win.loadFile(tmpHtml)
    const pdf = await win.webContents.printToPDF({
      pageSize: 'A4',
      landscape: !!opts.landscape,
      printBackground: true,
      margins: { top: 0.5, bottom: 0.5, left: 0.45, right: 0.45 },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate:
        '<div style="width:100%;font-size:8px;color:#6b7280;padding:0 12mm;display:flex;justify-content:space-between;">' +
        '<span>NOTARIS PRO</span><span>Halaman <span class="pageNumber"></span> dari <span class="totalPages"></span></span></div>',
    })
    fs.writeFileSync(outPath, pdf)
    return outPath
  } finally {
    win.destroy()
    fs.rmSync(tmpHtml, { force: true })
  }
}

export function exportTimestamp(): string {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`
}

export function safeExportName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-')
}

export function logExport(filePath: string): void {
  log.info(`Ekspor dibuat: ${filePath}`)
}
