import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AttemptGuard } from '../src/main/lib/attempt-guard'

const tempDirs: string[] = []

function stateFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notaris-guard-'))
  tempDirs.push(dir)
  return path.join(dir, 'config', 'attempts.json')
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('AttemptGuard', () => {
  it('mengunci setelah lima kegagalan dan status bertahan setelah proses dibuat ulang', () => {
    const file = stateFile()
    let now = 1_700_000_000_000
    const guard = new AttemptGuard(file, { now: () => now })

    for (let i = 1; i <= 4; i++) {
      const result = guard.registerFailure('master')
      expect(result.locked).toBe(false)
      expect(result.count).toBe(i)
    }
    const fifth = guard.registerFailure('master')
    expect(fifth.locked).toBe(true)
    expect(fifth.retryAfterMs).toBe(60_000)
    expect(guard.status('master')).toMatchObject({ locked: true, retryAfterMs: 60_000, count: 5 })

    // Proses baru (mis. aplikasi ditutup lalu dibuka lagi) membaca status yang sama.
    const restarted = new AttemptGuard(file, { now: () => now })
    expect(restarted.status('master').locked).toBe(true)

    // Mode recovery tidak terpengaruh oleh kegagalan master.
    expect(restarted.status('recovery').locked).toBe(false)

    const raw = fs.readFileSync(file, 'utf8')
    expect(raw).not.toContain('password')
    expect(JSON.parse(raw)).toEqual({ master: { count: 5, until: now + 60_000 } })
  })

  it('gerbang terbuka setelah masa kunci habis dan satu kegagalan berikutnya mengunci lagi', () => {
    const file = stateFile()
    let now = 1_700_000_000_000
    let guard = new AttemptGuard(file, { now: () => now })
    for (let i = 0; i < 5; i++) guard.registerFailure('master')

    now += 59_000
    expect(guard.status('master').locked).toBe(true)

    now += 1_001
    expect(guard.status('master')).toMatchObject({ locked: false, count: 5 })

    guard = new AttemptGuard(file, { now: () => now })
    const again = guard.registerFailure('master')
    expect(again.locked).toBe(true)
    expect(again.count).toBe(6)
  })

  it('keberhasilan menghapus hitungan secara permanen', () => {
    const file = stateFile()
    let now = 1_700_000_000_000
    const guard = new AttemptGuard(file, { now: () => now })
    guard.registerFailure('master', 3)
    guard.registerFailure('master', 3)
    guard.clear('master')
    expect(guard.status('master').locked).toBe(false)

    now += 1
    const restarted = new AttemptGuard(file, { now: () => now })
    expect(restarted.status('master')).toMatchObject({ locked: false, count: 0 })
    const after = restarted.registerFailure('master', 3)
    expect(after.count).toBe(1)
    expect(after.locked).toBe(false)
  })

  it('menolak berkas status rusak, terlalu besar, atau waktu kunci yang tidak masuk akal', () => {
    const file = stateFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, '{rusak')
    expect(new AttemptGuard(file).status('master').locked).toBe(false)

    fs.writeFileSync(file, JSON.stringify({ master: { count: 'x', until: 1 } }))
    expect(new AttemptGuard(file).status('master').locked).toBe(false)

    fs.writeFileSync(file, 'x'.repeat(70 * 1024))
    expect(new AttemptGuard(file).status('master').locked).toBe(false)

    const now = 1_700_000_000_000
    fs.writeFileSync(file, JSON.stringify({ master: { count: 5, until: now + 10 * 60_000 } }))
    const clamped = new AttemptGuard(file, { now: () => now }).status('master')
    expect(clamped.locked).toBe(true)
    expect(clamped.retryAfterMs).toBeLessThanOrEqual(60_000)
  })

  it('membatasi jumlah maksimum percobaan yang dapat dikonfigurasi untuk login', () => {
    const file = stateFile()
    const guard = new AttemptGuard(file, { now: () => 1_700_000_000_000 })
    expect(guard.registerFailure('user-a', 3).locked).toBe(false)
    expect(guard.registerFailure('user-a', 3).locked).toBe(false)
    expect(guard.registerFailure('user-a', 3).locked).toBe(true)
    expect(guard.status('user-a').count).toBe(3)
  })
})
