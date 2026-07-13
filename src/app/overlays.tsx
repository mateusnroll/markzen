import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react'

type OverlayEntry = {
  readonly dismiss: () => void
  readonly id: string
  readonly modal: boolean
}

type OverlayCoordinator = {
  register(entry: OverlayEntry): () => void
}

const inertCoordinator: OverlayCoordinator = { register: () => () => undefined }
const OverlayContext = createContext<OverlayCoordinator>(inertCoordinator)

export function OverlayProvider({ children }: { readonly children: ReactNode }) {
  const stack = useRef<OverlayEntry[]>([])
  const register = useCallback((entry: OverlayEntry) => {
    stack.current = stack.current.filter((candidate) => candidate.id !== entry.id)
    if (entry.modal) {
      const nonModal = stack.current.filter((candidate) => !candidate.modal)
      stack.current = stack.current.filter((candidate) => candidate.modal)
      for (const candidate of nonModal.reverse()) candidate.dismiss()
    }
    stack.current.push(entry)
    return () => { stack.current = stack.current.filter((candidate) => candidate.id !== entry.id) }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      const top = stack.current.at(-1)
      if (!top) return
      event.preventDefault()
      event.stopPropagation()
      top.dismiss()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [])

  const value = useMemo<OverlayCoordinator>(() => ({ register }), [register])
  return <OverlayContext.Provider value={value}>{children}</OverlayContext.Provider>
}

export function useOverlaySurface(id: string, open: boolean, modal: boolean, dismiss: () => void): void {
  const coordinator = useContext(OverlayContext)
  const dismissRef = useRef(dismiss)
  dismissRef.current = dismiss
  useEffect(() => {
    if (!open) return
    return coordinator.register({ dismiss: () => dismissRef.current(), id, modal })
  }, [coordinator, id, modal, open])
}
