/**
 * Penyusun ekspresi MATCH FTS5 dari masukan pengguna.
 *
 * Setiap kata menjadi kueri awalan (`"kata"*`) dan digabung dengan AND, sehingga
 * "budi san" menemukan "Budi Santoso" dan "001/11/2026" terpecah menjadi tiga
 * token yang semuanya harus ada. Hanya huruf dan angka yang dipertahankan,
 * sehingga tanda kutip atau operator FTS dari masukan tidak pernah diteruskan.
 */
const MAX_TOKENS = 6

export function searchTokens(input: string): string[] {
  const tokens = input
    .normalize('NFKC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((t) => t.slice(0, 64))
  return [...new Set(tokens)].slice(0, MAX_TOKENS)
}

export function ftsMatch(input: string): string {
  return searchTokens(input)
    .map((t) => `"${t}"*`)
    .join(' AND ')
}
