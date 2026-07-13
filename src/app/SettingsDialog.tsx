import { useCallback, useEffect, useRef, useState } from 'react'

import type { PlatformResult, SettingsPatch, SettingsSnapshotPayload } from '../platform/contracts'
import { useOverlaySurface } from './overlays'

export function SettingsDialog({
  onClose,
  onPatch,
  snapshot,
}: {
  readonly onClose: () => void
  readonly onPatch: (patch: SettingsPatch) => Promise<PlatformResult<SettingsSnapshotPayload>>
  readonly snapshot: SettingsSnapshotPayload
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [error, setError] = useState('')
  const close = useCallback(() => onClose(), [onClose])
  useOverlaySurface('settings-dialog', true, true, close)

  useEffect(() => {
    const element = dialog.current
    if (!element?.open) element?.showModal()
    return () => { if (element?.open) element.close() }
  }, [])

  const patch = useCallback(async (value: SettingsPatch) => {
    const result = await onPatch(value)
    setError(result.ok ? '' : 'That setting could not be applied. The latest accepted value is still active.')
  }, [onPatch])

  return (
    <dialog
      aria-labelledby="settings-title"
      className="settings-dialog"
      data-testid="settings-dialog"
      onCancel={(event) => { event.preventDefault(); close() }}
      onClick={(event) => { if (event.target === event.currentTarget) close() }}
      ref={dialog}
    >
      <div className="settings-card">
        <header>
          <h2 id="settings-title">Settings</h2>
          <button aria-label="Close Settings" data-testid="settings-close" onClick={close} type="button">×</button>
        </header>
        <label htmlFor="theme-setting">Theme</label>
        <select
          autoFocus
          data-testid="theme-setting"
          id="theme-setting"
          onChange={(event) => { void patch({ theme: event.currentTarget.value as 'system' | 'light' | 'dark' }) }}
          value={snapshot.theme}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
        <label htmlFor="toolbar-setting">Toolbar</label>
        <select
          data-testid="toolbar-setting"
          id="toolbar-setting"
          onChange={(event) => { void patch({ toolbarMode: event.currentTarget.value as 'minimal' | 'regular' }) }}
          value={snapshot.toolbarMode}
        >
          <option value="minimal">Minimal</option>
          <option value="regular">Regular</option>
        </select>
        {error ? <p className="settings-error" data-testid="settings-error" role="alert">{error}</p> : null}
      </div>
    </dialog>
  )
}
