import path from 'node:path'
import { app, BrowserWindow, dialog, shell } from 'electron'
import { ensureDirs } from './lib/paths'
import { log } from './lib/logger'
import { initVault, lockVault, vaultStatus } from './lib/vault'
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
let quitting = false

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
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
  if (app.isReady()) {
    void dialog.showMessageBox({
      type: 'error',
      title: 'Kesalahan tidak terduga',
      message: 'NOTARIS PRO mengalami kesalahan tidak terduga.',
      detail: err.message,
      buttons: ['Tutup'],
    })
  }
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

app.on('before-quit', (event) => {
  if (quitting) return
  if (vaultStatus().status !== 'UNLOCKED') return
  event.preventDefault()
  quitting = true
  void lockVault()
    .catch((err) => log.error('Gagal mengunci vault saat keluar', String(err)))
    .finally(() => app.quit())
})
