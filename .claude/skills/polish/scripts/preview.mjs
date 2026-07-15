#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { rmSync } from 'node:fs'
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { clearTimeout, setTimeout } from 'node:timers'
import { fileURLToPath, URL } from 'node:url'

const host = '127.0.0.1'
const repository = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)))
const rawArguments = process.argv.slice(2)
const options = parseArguments(rawArguments)

let buildContexts = []
let electronProcess
let electronExecutable
let electronTransition = Promise.resolve()
let exitCode = 0
let restartTimer
let rawTerminalInput = false
let stopping = false
let temporaryRoot
let viteServer
let finish
const finished = new Promise((resolve) => { finish = resolve })

process.once('SIGINT', () => requestStop(0))
process.once('SIGTERM', () => requestStop(0))
process.once('SIGHUP', () => requestStop(0))
process.once('SIGQUIT', () => requestStop(0))
process.once('exit', emergencyCleanup)
configureTerminalInput()

try {
  await start()
  await finished
} catch (error) {
  exitCode = 1
  process.stderr.write(`[polish] ${error instanceof Error ? error.message : String(error)}\n`)
} finally {
  await cleanup()
  process.exitCode = exitCode
}

async function start() {
  const { createServer } = await import('vite')
  viteServer = await createServer({
    configFile: path.join(repository, 'vite.config.ts'),
    root: repository,
    server: { host, port: 4173 },
  })
  await viteServer.listen()
  const address = viteServer.httpServer?.address()
  if (!address || typeof address === 'string') throw new Error('Vite did not expose a loopback TCP port')
  const port = address.port
  const origin = `http://${host}:${port}`
  viteServer.printUrls()

  if (options.mode === 'browser') {
    const preview = new URL(origin)
    preview.searchParams.set('fixture', options.fixture)
    process.stdout.write(`[polish] Browser preview ready: ${preview.href}\n`)
    process.stdout.write(`POLISH_PREVIEW_URL=${preview.href}\n`)
    return
  }

  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'markzen-polish-'))
  const profile = path.join(temporaryRoot, 'profile')
  const workspace = path.join(temporaryRoot, 'stoic-workspace')
  await mkdir(profile)
  await cp(path.join(repository, 'examples', 'stoic-workspace'), workspace, { recursive: true })
  process.stdout.write(`[polish] Temporary profile: ${profile}\n`)
  process.stdout.write(`[polish] Temporary workspace: ${workspace}\n`)

  await watchElectron({ origin, profile, workspace })
}

async function watchElectron(launchOptions) {
  const [{ default: electronPath }, { context }] = await Promise.all([import('electron'), import('esbuild')])
  electronExecutable = electronPath
  const health = new Map([['main', false], ['preload', false]])
  let initialLaunchQueued = false

  const rebuildPlugin = (name) => ({
    name: `polish-${name}-rebuild`,
    setup(build) {
      build.onEnd((result) => {
        const succeeded = result.errors.length === 0
        health.set(name, succeeded)
        if (!succeeded) {
          if (restartTimer) clearTimeout(restartTimer)
          restartTimer = undefined
          process.stderr.write(`[polish] ${name} rebuild failed; keeping the current Electron process.\n`)
          for (const error of result.errors) process.stderr.write(`[polish] ${error.text}\n`)
          return
        }
        if (![...health.values()].every(Boolean)) return
        if (!initialLaunchQueued) {
          initialLaunchQueued = true
          queueElectronRestart(launchOptions, 'initial build')
          return
        }
        if (restartTimer) clearTimeout(restartTimer)
        restartTimer = setTimeout(() => queueElectronRestart(launchOptions, `${name} rebuild`), 350)
      })
    },
  })

  buildContexts = await Promise.all([
    context({
      bundle: true,
      entryPoints: [path.join(repository, 'src', 'platform', 'electron', 'main.ts')],
      external: ['electron'],
      format: 'esm',
      outfile: path.join(repository, 'dist-electron', 'main.mjs'),
      platform: 'node',
      plugins: [rebuildPlugin('main')],
    }),
    context({
      bundle: true,
      entryPoints: [path.join(repository, 'src', 'platform', 'electron', 'preload.ts')],
      external: ['electron'],
      format: 'cjs',
      outfile: path.join(repository, 'dist-electron', 'preload.cjs'),
      platform: 'node',
      plugins: [rebuildPlugin('preload')],
    }),
  ])
  await Promise.all(buildContexts.map((buildContext) => buildContext.watch()))
}

function queueElectronRestart(launchOptions, reason) {
  electronTransition = electronTransition.then(async () => {
    if (stopping) return
    process.stdout.write(`[polish] Relaunching Electron after ${reason}.\n`)
    await stopElectron()
    if (stopping) return
    if (!electronExecutable) throw new Error('Electron executable is unavailable')
    const child = spawn(electronExecutable, [
      repository,
      `--user-data-dir=${launchOptions.profile}`,
      `--markzen-dev-server-url=${launchOptions.origin}/`,
      `--markzen-polish-workspace=${launchOptions.workspace}`,
    ], { cwd: repository, env: process.env, stdio: ['ignore', 'inherit', 'inherit'] })
    electronProcess = child
    child.once('exit', (code) => {
      if (electronProcess !== child) return
      electronProcess = undefined
      if (!stopping) {
        process.stderr.write(`[polish] Electron exited unexpectedly with code ${String(code)}.\n`)
        requestStop(code ?? 1)
      }
    })
  }).catch((error) => {
    process.stderr.write(`[polish] Electron relaunch failed: ${error instanceof Error ? error.message : String(error)}\n`)
    requestStop(1)
  })
}

async function stopElectron() {
  const child = electronProcess
  electronProcess = undefined
  if (!child || child.exitCode !== null) return
  const exited = once(child, 'exit')
  child.kill('SIGTERM')
  const ended = await Promise.race([exited.then(() => true), delay(3_000).then(() => false)])
  if (!ended && child.exitCode === null) {
    child.kill('SIGKILL')
    await exited
  }
}

function requestStop(code) {
  if (stopping) return
  stopping = true
  exitCode = code
  finish()
}

async function cleanup() {
  stopping = true
  if (restartTimer) clearTimeout(restartTimer)
  await Promise.all(buildContexts.map((buildContext) => buildContext.dispose().catch(() => undefined)))
  await electronTransition.catch(() => undefined)
  await stopElectron()
  await viteServer?.close()
  if (temporaryRoot) await rm(temporaryRoot, { force: true, recursive: true })
  restoreTerminalInput()
}

function emergencyCleanup() {
  restoreTerminalInput()
  if (electronProcess?.exitCode === null) electronProcess.kill('SIGKILL')
  if (temporaryRoot) rmSync(temporaryRoot, { force: true, recursive: true })
}

function configureTerminalInput() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') return
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.on('data', handleTerminalInput)
  rawTerminalInput = true
}

function handleTerminalInput(data) {
  if ([...data].includes(3)) requestStop(0)
}

function restoreTerminalInput() {
  if (!rawTerminalInput) return
  process.stdin.removeListener('data', handleTerminalInput)
  process.stdin.setRawMode(false)
  process.stdin.pause()
  rawTerminalInput = false
}

function parseArguments(args) {
  const mode = args[0]
  if (mode !== 'browser' && mode !== 'electron') {
    throw new Error('Usage: npm run polish -- browser|electron [--fixture <name>]')
  }
  let fixture = 'workspace-basic'
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--fixture') {
      fixture = args[index + 1] ?? ''
      index += 1
    } else if (argument.startsWith('--fixture=')) {
      fixture = argument.slice('--fixture='.length)
    } else {
      throw new Error(`Unknown polish option: ${argument}`)
    }
  }
  if (!/^[a-z0-9-]+$/.test(fixture)) throw new Error('Fixture names use lowercase letters, digits, and hyphens')
  return { fixture, mode }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
