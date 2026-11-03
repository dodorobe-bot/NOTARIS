import { describe, expect, it } from 'vitest'
import {
  shouldVirtualize,
  virtualWindow,
  VIRTUAL_OVERSCAN,
  VIRTUAL_ROW_PX,
  VIRTUAL_THRESHOLD,
  VIRTUAL_VIEWPORT_PX,
} from '../src/shared/virtual'

describe('virtual scrolling: jendela baris', () => {
  it('tidak merender apa pun untuk data kosong', () => {
    expect(virtualWindow(0, 500, 40, 0)).toEqual({ start: 0, end: 0, topPad: 0, bottomPad: 0 })
  })

  it('di posisi teratas hanya merender sebagian awal dengan overscan', () => {
    const w = virtualWindow(0, 400, 40, 1000)
    expect(w.start).toBe(0)
    expect(w.topPad).toBe(0)
    expect(w.end).toBe(Math.ceil(400 / 40) + 1 + VIRTUAL_OVERSCAN)
    expect(w.end).toBeLessThan(1000)
  })

  it('menggeser jendela sesuai posisi scroll', () => {
    const w = virtualWindow(4000, 400, 40, 1000)
    expect(w.start).toBe(100 - VIRTUAL_OVERSCAN)
    expect(w.topPad).toBe(w.start * 40)
    expect(w.end).toBe(Math.min(1000, 100 + Math.ceil(400 / 40) + 1 + VIRTUAL_OVERSCAN))
  })

  it('menjepit jendela di ujung bawah', () => {
    const w = virtualWindow(1_000_000, 400, 40, 50)
    expect(w.start).toBeLessThanOrEqual(50)
    expect(w.end).toBe(50)
    expect(w.bottomPad).toBe(0)
  })

  it('spacer atas + baris terlihat + spacer bawah menutup tinggi total', () => {
    const total = 1234
    const row = 37
    const w = virtualWindow(9000, 520, row, total)
    expect(w.topPad + (w.end - w.start) * row + w.bottomPad).toBe(total * row)
  })

  it('menjaga nilai scroll dan tinggi yang tidak masuk akal', () => {
    const w = virtualWindow(Number.NaN, 0, 0, -5)
    expect(w).toEqual({ start: 0, end: 0, topPad: 0, bottomPad: 0 })
    const fallback = virtualWindow(-10, 0, 0, 100)
    expect(fallback.start).toBe(0)
    expect(fallback.end).toBeLessThan(100)
    expect(fallback.topPad).toBe(0)
    const usable = virtualWindow(0, VIRTUAL_VIEWPORT_PX, VIRTUAL_ROW_PX, 100)
    expect(usable.end).toBeGreaterThan(0)
  })

  it('hanya mengaktifkan jendela di atas ambang dan bila diminta', () => {
    expect(shouldVirtualize(VIRTUAL_THRESHOLD, true)).toBe(false)
    expect(shouldVirtualize(VIRTUAL_THRESHOLD + 1, true)).toBe(true)
    expect(shouldVirtualize(VIRTUAL_THRESHOLD + 1, false)).toBe(false)
  })
})
