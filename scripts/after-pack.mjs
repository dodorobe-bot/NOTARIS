import fs from 'node:fs'
import path from 'node:path'

/** Menyalin klien Prisma yang dihasilkan (folder tersembunyi .prisma) ke aplikasi terpaket. */
export default async function afterPack(context) {
  const appDir = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources', 'app')
    : path.join(context.appOutDir, 'resources', 'app')

  const src = path.join(context.packager.projectDir, 'node_modules', '.prisma')
  const dest = path.join(appDir, 'node_modules', '.prisma')
  if (!fs.existsSync(src)) throw new Error('Klien Prisma belum digenerate; jalankan prisma generate.')
  fs.rmSync(dest, { recursive: true, force: true })
  fs.cpSync(src, dest, { recursive: true })
  console.log(`[afterPack] Klien Prisma disalin ke ${dest}`)
}
