import { describe, expect, it } from 'vitest'
import { computeAuditHash, createChainVerifier, verifyAuditChain, type AuditChainRow } from '../src/main/lib/audit'

function base(overrides: Partial<Omit<AuditChainRow, 'id' | 'hash'>> = {}) {
  return {
    prevHash: null,
    userId: 'user-1',
    username: 'admin',
    action: 'CREATE',
    entity: 'Client',
    entityId: 'client-1',
    createdAt: '2026-11-02T10:00:00.000Z',
    before: null,
    after: '{"code":"KLN-00001"}',
    meta: null,
    ...overrides,
  }
}

function chain(count = 5): AuditChainRow[] {
  const rows: AuditChainRow[] = []
  let prevHash: string | null = null
  for (let i = 0; i < count; i++) {
    const data = base({
      prevHash,
      entityId: `client-${i + 1}`,
      createdAt: new Date(Date.UTC(2026, 10, 2, 10, i)).toISOString(),
      after: JSON.stringify({ index: i }),
    })
    const hash = computeAuditHash(data)
    rows.push({ id: i + 1, hash, ...data })
    prevHash = hash
  }
  return rows
}

describe('rantai hash audit', () => {
  it('hash deterministik dan sensitif terhadap perubahan data', () => {
    expect(computeAuditHash(base())).toBe(computeAuditHash(base()))
    expect(computeAuditHash(base({ action: 'DELETE' }))).not.toBe(computeAuditHash(base()))
    expect(computeAuditHash(base({ prevHash: 'abc' }))).not.toBe(computeAuditHash(base()))
  })

  it('menerima rantai utuh', () => {
    const rows = chain()
    const result = verifyAuditChain(rows)
    expect(result.ok).toBe(true)
    expect(result.checked).toBe(rows.length)
    expect(result.brokenAt).toBeNull()
  })

  it('mendeteksi isi entri yang diubah', () => {
    const rows = chain()
    rows[2] = { ...rows[2], after: '{"index":999}' }
    const result = verifyAuditChain(rows)
    expect(result.ok).toBe(false)
    expect(result.brokenAt).toBe(3)
    expect(result.checked).toBe(2)
  })

  it('mendeteksi penghapusan entri di tengah', () => {
    const rows = chain()
    const withoutMiddle = rows.filter((r) => r.id !== 3)
    const result = verifyAuditChain(withoutMiddle)
    expect(result.ok).toBe(false)
  })

  it('mendeteksi prevHash yang tidak cocok', () => {
    const rows = chain()
    const broken = rows.map((r, i) => (i === 3 ? { ...r, prevHash: 'bukan-hash-sebelumnya' } : r))
    const result = verifyAuditChain(broken)
    expect(result.ok).toBe(false)
    expect(result.brokenAt).toBe(4)
  })

  it('rantai kosong dianggap utuh dengan 0 entri', () => {
    expect(verifyAuditChain([])).toEqual({ ok: true, brokenAt: null, checked: 0 })
  })

  it('verifikasi bertahap memberi hasil sama dengan verifikasi sekaligus', () => {
    const rows = chain(11)
    const broken = rows.map((r, i) => (i === 7 ? { ...r, prevHash: 'dirusak' } : r))
    for (const source of [rows, broken]) {
      const verifier = createChainVerifier()
      for (let i = 0; i < source.length; i += 3) {
        for (const row of source.slice(i, i + 3)) verifier.push(row)
      }
      expect(verifier.state()).toEqual(verifyAuditChain(source))
    }
  })

  it('entri sesudah titik putus tidak mengubah hasil verifikasi', () => {
    const rows = chain()
    rows[1] = { ...rows[1], after: '{"index":999}' }
    const verifier = createChainVerifier()
    for (const row of rows) verifier.push(row)
    expect(verifier.state()).toEqual({ ok: false, brokenAt: 2, checked: 1 })
  })
})
