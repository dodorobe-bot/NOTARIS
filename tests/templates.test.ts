import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import { isTemplateFileName } from '../src/main/lib/template-name'

const root = path.resolve(__dirname, '..')

const samples: Record<string, Record<string, unknown>> = {
  'templates/notary/akta-umum.docx': {
    kantor: 'Kantor Notaris Uji', alamat_kantor: 'Jl. Uji No. 1', kota: 'Bandung',
    nomor_akta: '001/11/2026', tanggal_akta: '2 November 2026', judul: 'Akta Pendirian PT Uji',
    jenis_akta: 'Akta Notaris', klien: 'PT Uji Sejahtera', kode_klien: 'KLN-00001',
    penghadap: 'Budi Santoso', komparisi: 'Komparisi uji.', premis: 'Premis uji.',
    isi: 'Isi akta uji.', penutup: 'Penutup uji.',
    pihak_list: [{ role: 'Direktur', nama: 'Budi Santoso', nik: '3273010101010001', alamat: 'Bandung' }],
    saksi: 'Saksi Satu, Saksi Dua', saksi_list: [{ nama: 'Saksi Satu' }, { nama: 'Saksi Dua' }],
    notaris: 'Notaris Uji, S.H.', status_akta: 'Draft', tanggal_cetak: '2 November 2026',
  },
  'templates/ppat/akta-ppat.docx': {
    kantor: 'Kantor PPAT Uji', alamat_kantor: 'Jl. PPAT No. 2', kota: 'Jakarta',
    nomor_akta: 'AJB-001/2026', tanggal_akta: '2 November 2026', judul: 'Akta Jual Beli',
    jenis_akta: 'Akta PPAT', klien: 'Siti Aminah', kode_klien: 'KLN-00002',
    penghadap: 'Siti Aminah', komparisi: 'Komparisi PPAT.', premis: 'Premis PPAT.',
    isi: 'Isi PPAT.', penutup: 'Penutup PPAT.',
    pihak_list: [{ role: 'Penjual', nama: 'Siti Aminah', nik: '3171010101010002', alamat: 'Jakarta' }],
    saksi: 'Saksi PPAT', saksi_list: [{ nama: 'Saksi PPAT' }],
    notaris: 'PPAT Uji, S.H.', status_akta: 'Draft', tanggal_cetak: '2 November 2026',
  },
  'templates/invoices/invoice.docx': {
    kantor: 'Kantor Notaris Uji', alamat_kantor: 'Jl. Uji No. 1', kota: 'Bandung',
    nomor_invoice: 'INV/2026/0001', tanggal_invoice: '2 November 2026', klien: 'PT Uji Sejahtera',
    jatuh_tempo: '16 November 2026', item_list: [{ deskripsi: 'Jasa Notaris', jumlah: '1', harga: 'Rp 1.000.000', total: 'Rp 1.000.000' }],
    subtotal: 'Rp 1.000.000', diskon: 'Rp 0', pajak: 'Rp 110.000', total: 'Rp 1.110.000',
    catatan: 'Terima kasih.', notaris: 'Notaris Uji, S.H.',
  },
}

describe('template DOCX bawaan', () => {
  for (const [relative, data] of Object.entries(samples)) {
    it(`${relative} ada dan dapat dirender Docxtemplater`, () => {
      const file = path.join(root, relative)
      expect(fs.existsSync(file)).toBe(true)
      const zip = new PizZip(fs.readFileSync(file))
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: '{', end: '}' },
      })
      expect(() => doc.render(data)).not.toThrow()
      const xml = doc.getZip().files['word/document.xml'].asText()
      expect(xml).not.toMatch(/\{(nomor_akta|klien|total|notaris)\}/)
      expect(xml.length).toBeGreaterThan(500)
    })
  }

  it('hanya berkas DOCX aktif yang dianggap template (cadangan .bak dikecualikan)', () => {
    expect(isTemplateFileName('akta-umum.docx')).toBe(true)
    expect(isTemplateFileName('AKTA.DOCX')).toBe(true)
    expect(isTemplateFileName('akta-umum.docx.2026-11-02T10-00-00-000Z.bak')).toBe(false)
    expect(isTemplateFileName('akta-umum.bak.docx')).toBe(false)
    expect(isTemplateFileName('catatan.txt')).toBe(false)
  })

  it('template akta notaris memuat nama klien dan nomor akta hasil render', () => {
    const file = path.join(root, 'templates/notary/akta-umum.docx')
    const doc = new Docxtemplater(new PizZip(fs.readFileSync(file)), {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{', end: '}' },
    })
    doc.render(samples['templates/notary/akta-umum.docx'])
    const xml = doc.getZip().files['word/document.xml'].asText()
    expect(xml).toContain('001/11/2026')
    expect(xml).toContain('PT Uji Sejahtera')
    expect(xml).toContain('Budi Santoso')
  })
})
