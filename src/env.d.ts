import type { MarkzenApi } from './platform/contracts'

declare global {
  interface Window {
    readonly markzen?: MarkzenApi
  }
}

export {}
