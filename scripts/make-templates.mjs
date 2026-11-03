import fs from 'node:fs'
import path from 'node:path'
import PizZip from 'pizzip'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function run(text, opts = {}) {
  const { bold, size, italics, underline, color } = opts
  const props = [
    bold ? '<w:b/>' : '',
    italics ? '<w:i/>' : '',
    underline ? '<w:u w:val="single"/>' : '',
    size ? `<w:sz w:val="${size}"/>` : '',
    color ? `<w:color w:val="${color}"/>` : '',
    '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>',
  ].join('')
  return `<w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
}

function p(content, { align = 'both', spacing = 160, indent = 0 } = {}) {
  return `<w:p><w:pPr>${align ? `<w:jc w:val="${align}"/>` : ''}<w:spacing w:after="${spacing}" w:line="276" w:lineRule="auto"/>${indent ? `<w:ind w:firstLine="${indent}"/>` : ''}</w:pPr>${content}</w:p>`
}

function text(t, opts = {}, para = {}) {
  return p(run(t, opts), para)
}

function heading(t, size = 28) {
  return text(t, { bold: true, size }, { align: 'center', spacing: 200 })
}

function labelValue(label, value) {
  return p(`${run(label, { bold: true })}${run(value)}`)
}

function doc(bodyXml) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyXml}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1701" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>`
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`

const HEADER = [
  heading('{kantor}', 30),
  text('{alamat_kantor}', { size: 22 }, { align: 'center', spacing: 60 }),
  text('{kota}', { size: 22 }, { align: 'center', spacing: 400 }),
  text('_'.repeat(78), { size: 20 }, { align: 'center', spacing: 300 }),
]

function signature() {
  return [
    text('Dibuat dan disahkan di {kota} pada {tanggal_akta}.', {}, { align: 'right', spacing: 240 }),
    text('{jenis_akta}', { bold: true }, { align: 'right', spacing: 80 }),
    text('', {}, { align: 'right' }),
    text('', {}, { align: 'right' }),
    text('{notaris}', { bold: true, underline: true }, { align: 'right', spacing: 60 }),
    text('Notaris / PPAT', { size: 20 }, { align: 'right', spacing: 240 }),
    text('Status akta saat dicetak: {status_akta} · dicetak {tanggal_cetak}', { italics: true, size: 18, color: '555555' }, { align: 'center' }),
  ].join('')
}

function aktaBody({ ppat = false } = {}) {
  return [
    ...HEADER,
    heading(`AKTA ${ppat ? 'PPAT' : 'NOTARIS'}`, 32),
    text('Nomor: {nomor_akta}', { bold: true }, { align: 'center', spacing: 400 }),
    text('{judul}', { bold: true, italics: true }, { align: 'center', spacing: 360 }),
    labelValue('Jenis Akta: ', '{jenis_akta}'),
    labelValue('Tanggal Akta: ', '{tanggal_akta}'),
    labelValue('Klien: ', '{klien} ({kode_klien})'),
    labelValue('Penghadap: ', '{penghadap}'),
    text('', { size: 20 }, { spacing: 120 }),
    text('KOMPARISI', { bold: true }, { spacing: 120 }),
    text('{komparisi}', {}, { indent: 560 }),
    text('PREMIS', { bold: true }, { spacing: 120 }),
    text('{premis}', {}, { indent: 560 }),
    text('ISI AKTA', { bold: true }, { spacing: 120 }),
    text('{isi}', {}, { indent: 560 }),
    text('PIHAK-PIHAK', { bold: true }, { spacing: 120 }),
    p('{#pihak_list}<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">{role}</w:t></w:r><w:r><w:t xml:space="preserve"> — {nama} (NIK: {nik}) — {alamat}</w:t></w:r>{/pihak_list}'),
    text('PENUTUP', { bold: true }, { spacing: 120 }),
    text('{penutup}', {}, { indent: 560 }),
    text('SAKSI-SAKSI', { bold: true }, { spacing: 120 }),
    labelValue('Saksi: ', '{saksi}'),
    p('{#saksi_list}<w:r><w:t xml:space="preserve">- {nama}</w:t></w:r>{/saksi_list}'),
    signature(),
  ].join('')
}

const INVOICE_BODY = [
  heading('{kantor}', 30),
  text('{alamat_kantor} · {kota}', { size: 22 }, { align: 'center', spacing: 300 }),
  heading('INVOICE', 32),
  text('Nomor: {nomor_invoice}', { bold: true }, { align: 'center', spacing: 400 }),
  labelValue('Tanggal: ', '{tanggal_invoice}'),
  labelValue('Klien: ', '{klien}'),
  labelValue('Jatuh Tempo: ', '{jatuh_tempo}'),
  text('', { size: 20 }, { spacing: 120 }),
  p('{#item_list}<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">{deskripsi}</w:t></w:r><w:r><w:t xml:space="preserve"> — {jumlah} x {harga} = {total}</w:t></w:r>{/item_list}'),
  text('', { size: 20 }, { spacing: 120 }),
  labelValue('Subtotal: ', '{subtotal}'),
  labelValue('Diskon: ', '{diskon}'),
  labelValue('Pajak: ', '{pajak}'),
  labelValue('Total: ', '{total}'),
  text('Catatan: {catatan}', { italics: true, size: 20 }, { spacing: 300 }),
  text('{notaris}', { bold: true, underline: true }, { align: 'right', spacing: 60 }),
]

function build(documentXml, target) {
  const zip = new PizZip()
  zip.file('[Content_Types].xml', CONTENT_TYPES)
  zip.file('_rels/.rels', ROOT_RELS)
  zip.file('word/document.xml', doc(documentXml))
  zip.file('word/_rels/document.xml.rels', DOC_RELS)
  zip.file('word/styles.xml', STYLES)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }))
  console.log(`created ${path.relative(ROOT, target)} (${fs.statSync(target).size} bytes)`)
}

build(aktaBody(), path.join(ROOT, 'templates', 'notary', 'akta-umum.docx'))
build(aktaBody({ ppat: true }), path.join(ROOT, 'templates', 'ppat', 'akta-ppat.docx'))
build(INVOICE_BODY.join(''), path.join(ROOT, 'templates', 'invoices', 'invoice.docx'))
