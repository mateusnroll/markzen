import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { flipFuses, FuseV1Options, FuseVersion } from '@electron/fuses'

const execFileAsync = promisify(execFile)

export default async function afterPack(context) {
  const productFilename = context.packager.appInfo.productFilename
  const executableName = context.packager.executableName
  const executable =
    context.electronPlatformName === 'darwin'
      ? path.join(context.appOutDir, `${productFilename}.app`, 'Contents', 'MacOS', productFilename)
      : context.electronPlatformName === 'win32'
        ? path.join(context.appOutDir, `${productFilename}.exe`)
        : path.join(context.appOutDir, executableName)

  await access(executable)
  await flipFuses(executable, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: true,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  })

  if (context.electronPlatformName === 'darwin') {
    const appBundle = path.join(context.appOutDir, `${productFilename}.app`)
    await execFileAsync('codesign', ['--force', '--deep', '--sign', '-', appBundle])
  }
}
