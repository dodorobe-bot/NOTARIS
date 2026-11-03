import path from 'node:path'
import { app, BrowserWindow, dialog, shell } from 'electron'
import { ensureDirs } from './lib/paths'
import { log } from './lib/logger'
import { initVault, lockVault, vaultStatus } from './lib/vault'
import { maintenanceReason } from './lib/maintenance'
import { registerIpc } from './ipc/router'
import { prepareDatabase, scheduleIdleMaintenance } from './lifecycle'

import './ipc/system'
import './ipc/clients'
import './ipc/transactions'
import './ipc/documents'
import './ipc/deeds'
import './ipc/ppat'
import './ipc/finance'
import './ipc/calendar'
import './ipc/dashboard'
import './ipc/users'
import './ipc/reports'
import './ipc/audit'
import './ipc/settings'
import './ipc/backup'
import './ipc/government'

let mainWindow: BrowserWindow | null = null
let quitReady = false
let lockInProgress = false
let crashHandled = false

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  // Instance kedua tidak boleh melanjutkan bootstrap: bila hanya app.quit() dipanggil, proses tetap
  // menjalankan sisa modul dan dapat membuka jendela kedua di atas database yang sama.
  app.exit(0)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    backgroundColor: '#0B1D3A',
    title: 'NOTARIS PRO — Integrated Notary & PPAT Management System',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl && url.startsWith(devUrl)) return
    event.preventDefault()
    log.warn('Navigasi keluar diblokir', { url })
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log.error('Proses renderer berhenti', { reason: details.reason, exitCode: details.exitCode })
    if (!mainWindow || mainWindow.isDestroyed()) return
    void dialog
      .showMessageBox(mainWindow, {
        type: 'error',
        title: 'Tampilan aplikasi berhenti',
        message: 'Tampilan NOTARIS PRO berhenti karena kesalahan.',
        detail: `Alasan: ${details.reason}. Data tetap tersimpan; muat ulang untuk melanjutkan.`,
        buttons: ['Muat ulang', 'Tutup aplikasi'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      })
      .then(({ response }) => {
        if (response === 0) mainWindow?.reload()
        else app.quit()
      })
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

async function bootstrap(): Promise<void> {
  ensureDirs()
  initVault()
  registerIpc()

  if (vaultStatus().status === 'DISABLED') {
    try {
      await prepareDatabase()
    } catch (err) {
      log.error('Gagal menyiapkan database mode pengembangan', String(err))
    }
  }

  createWindow()
  scheduleIdleMaintenance()
  log.info('Aplikasi dimulai', { version: app.getVersion(), vault: vaultStatus().status })
}

process.on('uncaughtException', (err) => {
  log.error('Uncaught exception', { message: err.message, stack: err.stack })
  if (crashHandled) return
  crashHandled = true
  if (!app.isReady()) {
    app.exit(1)
    return
  }
  // Melanjutkan setelah exception di proses utama tidak aman: tutup lewat jalur normal agar
  // database tetap dienkripsi (before-quit) dan pengguna tidak bekerja di atas state yang rusak.
  void dialog
    .showMessageBox({
      type: 'error',
      title: 'Kesalahan tidak terduga',
      message: 'NOTARIS PRO mengalami kesalahan tidak terduga dan akan ditutup.',
      detail: `${err.message}\n\nDatabase akan dikunci sebelum aplikasi keluar.`,
      buttons: ['Tutup aplikasi'],
      defaultId: 0,
      noLink: true,
    })
    .finally(() => app.quit())
})

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection', String(reason))
})

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

if (gotLock) {
  app.whenReady().then(bootstrap).catch((err) => {
    log.error('Bootstrap gagal', String(err))
    void dialog.showMessageBoxSync({
      type: 'error',
      title: 'Gagal memulai NOTARIS PRO',
      message: 'Aplikasi tidak dapat dimulai.',
      detail: (err as Error).message,
      buttons: ['Tutup'],
    })
    app.quit()
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('before-quit', (event) => {
  if (quitReady) return
  event.preventDefault()
  if (lockInProgress) return
  if (vaultStatus().status !== 'UNLOCKED') {
    quitReady = true
    app.quit()
    return
  }
  lockInProgress = true
  void lockVault()
    .then(() => {
      quitReady = true
      app.quit()
    })
    .catch((err) => {
      lockInProgress = false
      const detail = err instanceof Error ? err.message : String(err)
      log.error('Gagal mengunci vault saat keluar', detail)
      // Saat restore/kunci lain sedang berjalan, keluar paksa dapat merusak database. Dalam kondisi
      // itu hanya keluar setelah operasi selesai yang boleh ditawarkan.
      const busy = maintenanceReason()
      const forceAllowed = !busy
      // Keluar tanpa enkripsi hanya atas pilihan eksplisit pengguna; aplikasi tidak boleh
      // mengakhiri proses secara diam-diam sementara database plaintext masih di disk.
      void dialog
        .showMessageBox({
          type: 'error',
          title: 'Database belum berhasil dikunci',
          message: busy
            ? `Operasi "${busy}" masih berjalan.`
            : 'NOTARIS PRO belum dapat mengenkripsi database sebelum keluar.',
          detail: busy
            ? 'Tunggu hingga operasi selesai, lalu tutup kembali aplikasi.'
            : `${detail}\n\nJika tetap keluar, berkas database plaintext dapat tertinggal di disk.`,
          buttons: forceAllowed ? ['Batal keluar', 'Tetap keluar'] : ['Batal keluar'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        })
        .then(({ response }) => {
          if (forceAllowed && response === 1) {
            quitReady = true
            app.quit()
          } else if (!mainWindow || mainWindow.isDestroyed()) {
            createWindow()
          }
        })
    })
})
