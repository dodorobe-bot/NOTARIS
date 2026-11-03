/**
 * Perhitungan jendela baris untuk virtual scrolling.
 *
 * Dipisahkan dari komponen agar dapat diuji tanpa DOM. Tabel yang memuat ribuan baris
 * hanya merender baris yang terlihat (plus overscan), sehingga jumlah node DOM tetap
 * terbatas meskipun data di memori besar.
 */
export const VIRTUAL_THRESHOLD = 60
export const VIRTUAL_OVERSCAN = 6
export const VIRTUAL_VIEWPORT_PX = 520
export const VIRTUAL_ROW_PX = 41

export interface VirtualWindow {
  start: number
  end: number
  topPad: number
  bottomPad: number
}

export function virtualWindow(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  total: number,
  overscan = VIRTUAL_OVERSCAN,
): VirtualWindow {
  const count = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0
  if (count === 0) return { start: 0, end: 0, topPad: 0, bottomPad: 0 }
  const row = Number.isFinite(rowHeight) && rowHeight > 0 ? rowHeight : VIRTUAL_ROW_PX
  const view = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : VIRTUAL_VIEWPORT_PX

  const scrolled = Math.max(0, Number.isFinite(scrollTop) ? scrollTop : 0)
  const visible = Math.ceil(view / row) + 1
  const maxFirst = Math.max(0, count - visible)
  const first = Math.min(maxFirst, Math.floor(scrolled / row))
  const start = Math.max(0, first - overscan)
  const end = Math.min(count, first + visible + overscan)

  return { start, end, topPad: start * row, bottomPad: (count - end) * row }
}

export function shouldVirtualize(rowCount: number, enabled: boolean): boolean {
  return enabled && rowCount > VIRTUAL_THRESHOLD
}
