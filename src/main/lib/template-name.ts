/** Nama berkas yang dianggap template aktif; cadangan .bak tidak termasuk. */
export function isTemplateFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return lower.endsWith('.docx') && !lower.includes('.bak')
}
