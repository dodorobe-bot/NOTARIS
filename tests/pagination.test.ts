import { describe, expect, it } from 'vitest'
import { MAX_PAGING_OFFSET, pageOffset, pageTooDeep } from '../src/shared/pagination'

describe('offset paginasi', () => {
  it('halaman pertama selalu tanpa offset', () => {
    expect(pageOffset(1, 50)).toBe(0)
    expect(pageOffset(1, 200)).toBe(0)
  })

  it('menghitung offset dari nomor halaman dan ukuran halaman', () => {
    expect(pageOffset(2, 50)).toBe(50)
    expect(pageOffset(2000, 50)).toBe(99_950)
    expect(pageOffset(4001, 50)).toBe(200_000)
  })

  it('nomor halaman tidak masuk akal tidak menghasilkan offset negatif', () => {
    expect(pageOffset(0, 50)).toBe(0)
    expect(pageOffset(-3, 50)).toBe(0)
  })
})

describe('pagar kedalaman halaman', () => {
  it('offset tepat pada batas masih diterima', () => {
    expect(pageTooDeep(MAX_PAGING_OFFSET)).toBe(false)
  })

  it('offset melewati batas ditolak', () => {
    expect(pageTooDeep(MAX_PAGING_OFFSET + 1)).toBe(true)
    expect(pageTooDeep(1_000_000)).toBe(true)
  })

  it('batas dapat diperkecil untuk pengujian', () => {
    expect(pageTooDeep(101, 100)).toBe(true)
    expect(pageTooDeep(100, 100)).toBe(false)
  })
})
