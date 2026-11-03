import { describe, expect, it } from 'vitest'
import { truncationNotice } from '../src/shared/report-notice'

describe('peringatan pemotongan laporan', () => {
  it('diam ketika seluruh baris termuat', () => {
    expect(truncationNotice(5000, undefined)).toBe('')
    expect(truncationNotice(5000, 5000)).toBe('')
    expect(truncationNotice(120, 120)).toBe('')
  })

  it('menyebutkan jumlah yang dimuat dan jumlah yang ada', () => {
    const notice = truncationNotice(5000, 8250)
    expect(notice).toContain('5.000')
    expect(notice).toContain('8.250')
    expect(notice).toContain('dipotong')
  })

  it('tetap memperingatkan ketika hasil kosong namun datanya ada', () => {
    expect(truncationNotice(0, 10)).not.toBe('')
  })
})
