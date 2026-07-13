import type {
  DocumentGatewayPort,
  ExternalGatewayEvent,
  GatewayDocument,
  OpenOutcome,
  SaveInput,
  SaveOutcome,
  WorkspaceOpenInput,
} from '../../src/documents/gateway'
import type { RendererCommand } from '../../src/platform/contracts'

export class FakeDocumentGateway implements DocumentGatewayPort {
  readonly #externalListeners = new Set<(event: ExternalGatewayEvent) => void>()
  readonly #commandListeners = new Set<(command: RendererCommand) => void>()
  #nextTab = 1

  async acceptExternal(): Promise<boolean> { return true }
  async closeTab(): Promise<void> {}
  async confirmClose(): Promise<'cancel' | 'discard' | 'save'> { return 'discard' }
  async confirmWindowClose(): Promise<'cancel' | 'discard' | 'save-all'> { return 'discard' }
  async completeQuitSaveAll(): Promise<void> {}
  async createTabId(): Promise<string> { return `browser-${this.#nextTab++}` }
  async open(): Promise<OpenOutcome> { return { kind: 'cancelled' } }
  async openWorkspace(input: WorkspaceOpenInput): Promise<OpenOutcome> {
    void input
    return { kind: 'error' }
  }
  onCommand(listener: (command: RendererCommand) => void): () => void {
    this.#commandListeners.add(listener)
    return () => this.#commandListeners.delete(listener)
  }
  emitCommand(command: RendererCommand): void {
    for (const listener of this.#commandListeners) listener(command)
  }
  emitExternal(event: ExternalGatewayEvent): void {
    for (const listener of this.#externalListeners) listener(event)
  }
  onExternalChange(listener: (event: ExternalGatewayEvent) => void): () => void {
    this.#externalListeners.add(listener)
    return () => this.#externalListeners.delete(listener)
  }
  async overwriteExternal(input: SaveInput): Promise<SaveOutcome> {
    return { document: input, kind: 'saved' }
  }
  async retryCleanup(): Promise<SaveOutcome> { return { kind: 'unchanged' } }
  async save(input: SaveInput): Promise<SaveOutcome> { return { document: input, kind: 'saved' } }
  async saveAndRename(input: SaveInput): Promise<SaveOutcome> { return { document: input, kind: 'saved' } }
  async saveAs(input: GatewayDocument): Promise<SaveOutcome> { return { document: input, kind: 'saved' } }
  async updateMenuState(): Promise<void> {}
}
