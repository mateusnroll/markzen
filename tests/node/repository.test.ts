import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'vitest'

const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf8')) as T

describe('spec 0001 repository verification contract', () => {
  test('AC49: verify includes strict no-emit type checking', async () => {
    const packageJson = await readJson<{ scripts: Record<string, string> }>('package.json')
    expect(packageJson.scripts.typecheck).toBe('tsc --noEmit')
    expect(packageJson.scripts.verify).toContain('npm run typecheck')
    expect((await readJson<{ compilerOptions: { strict: boolean; noEmit: boolean } }>('tsconfig.json')).compilerOptions).toMatchObject({
      noEmit: true,
      strict: true,
    })
  })

  test('AC50: verify includes ESLint and fails on warnings', async () => {
    const packageJson = await readJson<{ scripts: Record<string, string> }>('package.json')
    expect(packageJson.scripts.lint).toContain('--max-warnings 0')
    expect(packageJson.scripts.verify).toContain('npm run lint')
  })

  test('AC51: verify includes the Vitest Node suite', async () => {
    const packageJson = await readJson<{ scripts: Record<string, string> }>('package.json')
    expect(packageJson.scripts.verify).toContain('npm run test:node')
  })

  test('AC52: verify includes Vitest Browser Mode in Chromium', async () => {
    const config = await readFile('vitest.browser.config.ts', 'utf8')
    expect(config).toContain("browser: 'chromium'")
    expect((await readJson<{ scripts: Record<string, string> }>('package.json')).scripts.verify).toContain('npm run test:browser')
  })

  test('AC53: verify includes Playwright against the Vite browser app', async () => {
    const packageJson = await readJson<{ scripts: Record<string, string> }>('package.json')
    expect(packageJson.scripts['test:e2e']).toContain('--project=browser')
    expect(packageJson.scripts.verify).toContain('npm run test:e2e')
  })

  test('AC54: verify is fail-fast shell composition with useful subprocess output', async () => {
    const script = (await readJson<{ scripts: Record<string, string> }>('package.json')).scripts.verify
    expect(script).toBe('npm run typecheck && npm run lint && npm run test:node && npm run test:browser && npm run test:e2e')
  })

  test('AC55: test:shell packages once and launches the Electron project', async () => {
    const scripts = (await readJson<{ scripts: Record<string, string> }>('package.json')).scripts
    expect(scripts['test:shell']).toBe('npm run package && playwright test --project=electron')
  })

  test('AC56: local verify:shell composes verify before test:shell', async () => {
    const scripts = (await readJson<{ scripts: Record<string, string> }>('package.json')).scripts
    expect(scripts['verify:shell']).toBe('npm run verify && npm run test:shell')
  })

  test('AC58: Playwright retains only failure screenshots and traces', async () => {
    const config = await readFile('playwright.config.ts', 'utf8')
    expect(config).toContain("screenshot: 'only-on-failure'")
    expect(config).toContain("trace: 'retain-on-failure'")
  })

  test('AC60: CI runs verify once on pinned Ubuntu and Node', async () => {
    const workflow = await readFile('.github/workflows/verify.yml', 'utf8')
    expect(workflow).toContain('runs-on: ubuntu-24.04')
    expect(workflow).toContain("node-version: '24.18.0'")
    expect(workflow.match(/npm run verify/g)).toHaveLength(1)
  })

  test('AC61: shell CI depends on verify and uses the pinned three-platform matrix', async () => {
    const workflow = await readFile('.github/workflows/verify.yml', 'utf8')
    expect(workflow).toContain('needs: verify')
    expect(workflow).toContain('ubuntu-24.04')
    expect(workflow).toContain('windows-2025')
    expect(workflow).toContain('macos-15')
    expect(workflow).toContain('sudo apt-get install --yes openbox')
    expect(workflow).toContain("xvfb-run -a sh -c 'openbox")
    expect(workflow).toContain('npm run test:shell')
  })

  test('AC55: shell launches use isolated profiles and graceful teardown', async () => {
    const helper = await readFile('tests/playwright/shell/helpers.ts', 'utf8')
    const main = await readFile('src/platform/electron/main.ts', 'utf8')
    expect(helper).toContain('--user-data-dir=')
    expect(helper).toContain("app.getPath('userData')")
    expect(helper).toContain('const launchAttempts = 3')
    expect(helper).toContain('timeout: launchTimeout')
    expect(helper).toContain('app.quit()')
    expect(helper).toContain("child.kill('SIGKILL')")
    expect(main).toContain("app.commandLine.getSwitchValue('user-data-dir')")
    expect(main).toContain("app.setPath('userData'")
  })

  test('AC62: packaging and fuse inspection target one production artifact', async () => {
    const scripts = (await readJson<{ scripts: Record<string, string> }>('package.json')).scripts
    const shellSuite = await readFile('tests/playwright/shell/spec0001.shell.spec.ts', 'utf8')
    expect(scripts.package).toContain('electron-builder --dir')
    expect(scripts['test:shell']?.match(/npm run package/g) ?? []).toHaveLength(1)
    expect(shellSuite).toContain("test('AC31:")
    expect(shellSuite).toContain('getCurrentFuseWire(await findPackagedExecutable())')
  })

  test('AC67: the accepted security ADR exists and cites runtime verification', async () => {
    const index = await readFile('docs/decisions/README.md', 'utf8')
    const adr = await readFile('docs/decisions/0001-electron-security-and-capabilities.md', 'utf8')
    expect(index).toContain('0001-electron-security-and-capabilities.md')
    expect(adr).toContain('**Status:** Accepted')
    expect(adr).toContain('runtime')
    expect(adr).toContain('Verification')
  })

  test('AC69: Node, Electron, lockfile install, and runner labels are pinned', async () => {
    const packageJson = await readJson<{ engines: { node: string }; devDependencies: Record<string, string> }>('package.json')
    const workflow = await readFile('.github/workflows/verify.yml', 'utf8')
    expect(packageJson.engines.node).toBe('24.18.0')
    expect(packageJson.devDependencies.electron).toBe('43.1.0')
    expect(workflow).toContain('npm ci')
    expect(workflow).not.toContain('-latest')
  })

  test('AC87: the external-opening static surface is one typed intent without shell or generic IPC', async () => {
    const contracts = await readFile('src/platform/contracts.ts', 'utf8')
    const preload = await readFile('src/platform/electron/preload.ts', 'utf8')
    expect(contracts).toContain("readonly openExternal: (destination: string)")
    expect(preload).toContain("openExternal: (destination: string) => invoke<ExternalOpenResult>")
    expect(preload).not.toContain('shell.openExternal')
    expect(preload).not.toContain('ipcRenderer:')
    expect(preload).not.toContain('confirmed:')
  })
})
