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
import type { ImageIntentOutcome } from '../../src/platform/contracts'

export class FakeDocumentGateway implements DocumentGatewayPort {
  readonly #externalListeners = new Set<(event: ExternalGatewayEvent) => void>()
  readonly #commandListeners = new Set<(command: RendererCommand) => void>()
  #nextTab = 1

  async authorizeImage(id: string, source: string): Promise<ImageIntentOutcome> { void id; void source; return { kind: 'blocked' } }
  async commitImage(id: string, candidateId: string): Promise<ImageIntentOutcome> { void id; void candidateId; return { kind: 'error' } }
  async loadRemoteImage(id: string, assetId: string, source: string, generation: number): Promise<ImageIntentOutcome> {
    void id; void assetId; void source; void generation
    return { kind: 'retryable' }
  }

  async acceptExternal(): Promise<boolean> { return true }
  async closeTab(): Promise<void> {}
  async confirmClose(): Promise<'cancel' | 'discard' | 'save'> { return 'discard' }
  async confirmWindowClose(): Promise<'cancel' | 'discard' | 'save-all'> { return 'discard' }
  async completeQuitSaveAll(): Promise<void> {}
  async createTabId(): Promise<string> { return `browser-${this.#nextTab++}` }
  async open(): Promise<OpenOutcome> { return { kind: 'cancelled' } }
  async openInDefaultApp(): Promise<import('../../src/platform/contracts').ExternalOpenResult> { return { kind: 'opened' } }
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
  async resolveEmbeddedImage(id: string, assetId: string, source: string, generation: number): Promise<ImageIntentOutcome> {
    void id; void assetId; void source; void generation
    return { kind: 'blocked' }
  }
  async resolveImage(id: string, source: string): Promise<ImageIntentOutcome> { void id; void source; return { kind: 'blocked' } }
  async revokeImage(id: string, assetId: string, source: string, generation: number, url?: string): Promise<void> {
    void id; void assetId; void source; void generation; void url
  }
  async save(input: SaveInput): Promise<SaveOutcome> { return { document: input, kind: 'saved' } }
  async saveAndRename(input: SaveInput): Promise<SaveOutcome> { return { document: input, kind: 'saved' } }
  async saveAs(input: GatewayDocument): Promise<SaveOutcome> { return { document: input, kind: 'saved' } }
  async selectImage(id: string): Promise<ImageIntentOutcome> { void id; return { kind: 'cancelled' } }
  async updateMenuState(): Promise<void> {}
}
