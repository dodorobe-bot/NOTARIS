/**
 * Batas kedalaman halaman. Offset yang sangat dalam memaksa SQLite memindai dan membuang
 * ribuan baris sebelum mengambil satu halaman; batas ini menjaga biaya tetap terukur
 * sekaligus menyarankan pengguna mempersempit pencarian.
 */
export const MAX_PAGING_OFFSET = 200_000

export function pageOffset(page: number, pageSize: number): number {
  return Math.max(0, (page - 1) * pageSize)
}

export function pageTooDeep(offset: number, max = MAX_PAGING_OFFSET): boolean {
  return offset > max
}
