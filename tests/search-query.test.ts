import { describe, expect, it } from 'vitest'
import { ftsMatch, searchTokens } from '../src/shared/search-query'

describe('penyusun kueri FTS5', () => {
  it('satu kata menjadi kueri awalan', () => {
    expect(ftsMatch('budi')).toBe('"budi"*')
  })

  it('beberapa kata digabung dengan AND', () => {
    expect(ftsMatch('budi santoso')).toBe('"budi"* AND "santoso"*')
  })

  it('nomor akta dipecah menurut tanda baca dan semua token wajib ada', () => {
    expect(ftsMatch('001/11/2026')).toBe('"001"* AND "11"* AND "2026"*')
    expect(ftsMatch('KLN-00001')).toBe('"KLN"* AND "00001"*')
  })

  it('tanda kutip dan operator FTS dari masukan tidak diteruskan', () => {
    expect(ftsMatch('"budi" OR x*')).toBe('"budi"* AND "OR"* AND "x"*')
    expect(ftsMatch('a:b(c)')).toBe('"a"* AND "b"* AND "c"*')
  })

  it('token ganda dibuang', () => {
    expect(searchTokens('budi budi BUDI')).toEqual(['budi', 'BUDI'])
  })

  it('masukan tanpa huruf atau angka menghasilkan kueri kosong', () => {
    expect(ftsMatch('   /--  ')).toBe('')
    expect(ftsMatch('')).toBe('')
  })

  it('jumlah token dibatasi agar kueri tetap ringan', () => {
    expect(searchTokens('a b c d e f g h').length).toBe(6)
  })
})
