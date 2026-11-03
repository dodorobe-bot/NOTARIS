import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isStreamContainer,
  listContainerEntries,
  readContainer,
  verifyContainer,
  writeContainer,
  type StreamEntrySpec,
  type StreamHeader,
} from '../src/main/lib/backup-stream'

const KEY = crypto.createHash('sha256').update('kunci-uji-wadah-cadangan').digest()

function header(codec: 'gzip' | 'raw' = 'gzip'): StreamHeader {
  return {
    format: 'NPBACKUP2',
    createdAt: '2026-11-02T00:00:00.000Z',
    appVersion: '1.0.0',
    keySource: 'passphrase',
    cipher: 'aes-256-gcm',
    codec,
  }
}

function tempDir(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `notaris-wadah-${label}-`))
}

function makeSource(dir: string, name: string, bytes: Buffer): string {
  const full = path.join(dir, name)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, bytes)
  return full
}

/** Isi acak supaya jalur multi-blok teruji; sebagian kompresibel supaya gzip terlihat bekerja. */
function noisyBuffer(size: number, seed: string): Buffer {
  const out = Buffer.alloc(size)
  let state = 0x9e3779b9
  for (let i = 0; i < size; i++) {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    out[i] = (state ^ (seed.charCodeAt(i % seed.length) * 2654435761)) & 0xff
  }
  return out
}

function compressibleBuffer(size: number, seed: string): Buffer {
  const block = Buffer.from(`${seed}-akta-notaris-`.repeat(8), 'utf8')
  const out = Buffer.alloc(size)
  for (let i = 0; i < size; i++) out[i] = block[i % block.length]
  return out
}

function digest(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function sampleEntries(dir: string): { entries: StreamEntrySpec[]; contents: Map<string, Buffer> } {
  const contents = new Map<string, Buffer>()
  contents.set('manifest.json', Buffer.from(JSON.stringify({ appVersion: '1.0.0', counts: { Client: 3 } }), 'utf8'))
  contents.set('database/notaris_pro.db', compressibleBuffer(2_600_000, 'basis'))
  contents.set('documents/2026/surat-a.pdf', noisyBuffer(120_000, 'dokumen-a'))
  contents.set('documents/kosong.bin', Buffer.alloc(0))
  const entries: StreamEntrySpec[] = []
  for (const [name, bytes] of contents) entries.push({ name, sourcePath: makeSource(dir, `src/${name}`, bytes) })
  return { entries, contents }
}

describe('wadah cadangan streaming NPBACKUP2', () => {
  it('membaca kembali isi yang identik dengan sumber', async () => {
    const work = tempDir('putar-balik')
    try {
      const { entries, contents } = sampleEntries(work)
      const dest = path.join(work, 'bentuk.npbackup')
      const written = await writeContainer(dest, header(), entries, KEY)
      expect(isStreamContainer(dest)).toBe(true)
      expect(written.entries.map((e) => e.name)).toEqual(entries.map((e) => e.name))
      expect(written.bytesWritten).toBe(fs.statSync(dest).size)

      const out = path.join(work, 'dibuka')
      const report = await readContainer(dest, KEY, out)
      expect(report.totalBytes).toBe([...contents.values()].reduce((s, b) => s + b.length, 0))
      for (const [name, bytes] of contents) {
        expect(digest(fs.readFileSync(path.join(out, name)))).toBe(digest(bytes))
      }
    } finally {
      fs.rmSync(work, { recursive: true, force: true })
    }
  })

  it('tetap bulat untuk codec raw', async () => {
    const work = tempDir('tanpa-kompresi')
    try {
      const { entries, contents } = sampleEntries(work)
      const dest = path.join(work, 'mentah.npbackup')
      await writeContainer(dest, header('raw'), entries, KEY)
      const out = path.join(work, 'dibuka')
      await readContainer(dest, KEY, out)
      for (const [name, bytes] of contents) expect(digest(fs.readFileSync(path.join(out, name)))).toBe(digest(bytes))
    } finally {
      fs.rmSync(work, { recursive: true, force: true })
    }
  })

  it('verifikasi tanpa menulis ke disk', async () => {
    const work = tempDir('verifikasi')
    try {
      const { entries } = sampleEntries(work)
      const dest = path.join(work, 'sah.npbackup')
      await writeContainer(dest, header(), entries, KEY)
      const report = await verifyContainer(dest, KEY)
      expect(report.entries).toHaveLength(entries.length)
      expect(fs.readdirSync(work).sort()).toEqual(['sah.npbackup', 'src'])
    } finally {
      fs.rmSync(work, { recursive: true, force: true })
    }
  })

  it('penulisan terputus dikenali dan menolak dianggap sah', async () => {
    const work = tempDir('terputus')
    try {
      const { entries } = sampleEntries(work)
      const dest = path.join(work, 'potong.npbackup')
      await writeContainer(dest, header(), entries, KEY)
      const full = fs.statSync(dest).size
      const buf = fs.readFileSync(dest)
      const trunc = buf.subarray(0, Math.floor(full * 0.8))
      fs.writeFileSync(dest, trunc)

      expect(() => listContainerEntries(dest)).toThrow(/tidak lengkap/)
      await expect(verifyContainer(dest, KEY)).rejects.toThrow(/penanda akhir tidak ditemukan/)
      await expect(readContainer(dest, KEY, path.join(work, 'dibuka'))).rejects.toThrow(/penanda akhir tidak ditemukan/)
    } finally {
      fs.rmSync(work, { recursive: true, force: true })
    }
  })

  it('byte isi yang diubah tertangkap oleh tag GCM', async () => {
    const work = tempDir('ubah-isi')
    try {
      const { entries } = sampleEntries(work)
      const dest = path.join(work, 'geser.npbackup')
      await writeContainer(dest, header(), entries, KEY)
      const buf = fs.readFileSync(dest)
      const at = Math.floor(buf.length / 2)
      buf[at] ^= 0xff
      fs.writeFileSync(dest, buf)
      await expect(verifyContainer(dest, KEY)).rejects.toThrow(/rusak|tidak cocok|terpotong|kunci/i)
    } finally {
      fs.rmSync(work, { recursive: true, force: true })
    }
  })

  it('footer yang dikutak-atik tidak lolos checksum', async () => {
    const work = tempDir('ubah-footer')
    try {
      const { entries } = sampleEntries(work)
      const dest = path.join(work, 'footer.npbackup')
      await writeContainer(dest, header(), entries, KEY)
      const buf = fs.readFileSync(dest)
      const jsonStart = buf.lastIndexOf(Buffer.from('"sha256"'))
      expect(jsonStart).toBeGreaterThan(0)
      // Ganti satu heksadesimal pada sha pertama tanpa menyentuh struktur JSON.
      const idx = jsonStart + Buffer.from('"sha256":"').length + 3
      buf[idx] = buf[idx] === 0x30 ? 0x31 : 0x30
      fs.writeFileSync(dest, buf)
      await expect(verifyContainer(dest, KEY)).rejects.toThrow(/Checksum entri/)
    } finally {
      fs.rmSync(work, { recursive: true, force: true })
    }
  })

  it('kunci lain tidak dapat membuka cadangan', async () => {
    const work = tempDir('kunci-salah')
    try {
      const { entries } = sampleEntries(work)
      const dest = path.join(work, 'terkunci.npbackup')
      await writeContainer(dest, header(), entries, KEY)
      const salah = crypto.createHash('sha256').update('kunci-lain').digest()
      await expect(readContainer(dest, salah, path.join(work, 'dibuka'))).rejects.toThrow(/Kunci salah/)
      expect(fs.existsSync(path.join(work, 'dibuka', 'manifest.json'))).toBe(false)
    } finally {
      fs.rmSync(work, { recursive: true, force: true })
    }
  })

  it('menolak nama berkas yang keluar dari direktori tujuan', async () => {
    const work = tempDir('nama-bahaya')
    try {
      const seed = makeSource(work, 'src/luar.bin', Buffer.from('isi'))
      await expect(
        writeContainer(path.join(work, 'jahat.npbackup'), header(), [{ name: '../../luar-bin', sourcePath: seed }], KEY),
      ).rejects.toThrow(/tidak aman/)
      await expect(
        writeContainer(path.join(work, 'mutlak.npbackup'), header(), [{ name: '/etc/passwd', sourcePath: seed }], KEY),
      ).rejects.toThrow(/tidak aman/)
    } finally {
      fs.rmSync(work, { recursive: true, force: true })
    }
  })

  it('hanya menulis entri yang diminta, sisanya tetap diverifikasi', async () => {
    const work = tempDir('sebagian')
    try {
      const { entries, contents } = sampleEntries(work)
      const dest = path.join(work, 'sebagian.npbackup')
      await writeContainer(dest, header(), entries, KEY)
      const out = path.join(work, 'dibuka')
      const report = await readContainer(dest, KEY, out, undefined, {
        include: (name) => name === 'manifest.json',
      })
      expect(report.entries).toHaveLength(entries.length)
      expect(fs.existsSync(path.join(out, 'manifest.json'))).toBe(true)
      expect(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8')).toBe(contents.get('manifest.json')!.toString('utf8'))
      expect(fs.existsSync(path.join(out, 'database', 'notaris_pro.db'))).toBe(false)
    } finally {
      fs.rmSync(work, { recursive: true, force: true })
    }
  })

  it('mendaftar isi tanpa kunci dan ukuran per entri cocok dengan sumber', async () => {
    const work = tempDir('daftar')
    try {
      const { entries } = sampleEntries(work)
      const dest = path.join(work, 'daftar.npbackup')
      await writeContainer(dest, header(), entries, KEY)
      const listed = listContainerEntries(dest)
      expect(listed.map((e) => e.name)).toEqual(entries.map((e) => e.name))
      for (const e of listed) {
        const source = entries.find((x) => x.name === e.name)!
        expect(e.plainSize).toBe(fs.statSync(source.sourcePath).size)
      }
      const dbEntry = listed.find((e) => e.name === 'database/notaris_pro.db')!
      expect(dbEntry.storedSize).toBeLessThan(dbEntry.plainSize)
    } finally {
      fs.rmSync(work, { recursive: true, force: true })
    }
  })

  it('menolak wadah kosong dan header asing', async () => {
    const work = tempDir('tolak')
    try {
      const seed = makeSource(work, 'src/a.bin', Buffer.from('a'))
      await expect(writeContainer(path.join(work, 'kosong.npbackup'), header(), [], KEY)).rejects.toThrow(/Cadangan kosong/)
      const dest = path.join(work, 'baik.npbackup')
      await writeContainer(dest, header(), [{ name: 'a.bin', sourcePath: seed }], KEY)
      const buf = fs.readFileSync(dest)
      buf.write('XXXXXXX', 0)
      fs.writeFileSync(dest, buf)
      expect(isStreamContainer(dest)).toBe(false)
      await expect(verifyContainer(dest, KEY)).rejects.toThrow(/bukan cadangan NOTARIS PRO format 2/)
    } finally {
      fs.rmSync(work, { recursive: true, force: true })
    }
  })

  it('progres dilaporkan per entri sehingga pembaruan dapat ditampilkan', async () => {
    const work = tempDir('progres')
    try {
      const { entries } = sampleEntries(work)
      const dest = path.join(work, 'progres.npbackup')
      const seen: string[] = []
      await writeContainer(dest, header(), entries, KEY, (done, total, name) => {
        seen.push(`${done}/${total}:${name}`)
      })
      const opened: number[] = []
      await readContainer(dest, KEY, path.join(work, 'dibuka'), (done) => opened.push(done))
      expect(seen).toHaveLength(entries.length)
      expect(opened).toEqual([1, 2, 3, 4])
    } finally {
      fs.rmSync(work, { recursive: true, force: true })
    }
  })
})
