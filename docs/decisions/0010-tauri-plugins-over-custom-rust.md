# ADR 0010: Tauri Built-in Plugins Over Custom Rust for MVP

**Status:** Accepted  
**Date:** 2026-04  
**Deciders:** Mateus Pinheiro

## Context

The app needs file system access, native dialogs, and shell integration. These can be implemented as custom Rust commands or by using Tauri's official plugin ecosystem.

## Decision

Use **Tauri's built-in plugins** for all standard operations at MVP. The only custom Rust code is a **file watcher** using the `notify` crate.

### Plugins Used

| Plugin | Purpose |
|---|---|
| `@tauri-apps/plugin-fs` | Read/write files, read directories |
| `@tauri-apps/plugin-dialog` | Native open/save file pickers, folder picker |
| `@tauri-apps/plugin-shell` | Open URLs, reveal files in OS file manager |

### Custom Rust

Only the file watcher (`notify` crate) requires custom Rust:
- Watches the open folder for external changes
- Emits `folder-changed` events to the frontend via Tauri's event system
- Frontend listens and calls `fileSystemStore.refreshDirs()`

#### File Watcher Behavior

- The sidebar file tree auto-refreshes when files or folders are created, deleted, renamed, or moved within the watched folder
- Only currently-expanded directories are refreshed in real-time; collapsed directories have their cache invalidated and reload on next expand
- Events are debounced at 500ms on the Rust side (`notify-debouncer-full`) to coalesce rapid operations (e.g., `git checkout`, batch renames)
- Each folder window watches its own root independently via a `HashMap<String, Debouncer>` keyed by folder path
- The `folder-changed` event payload includes the watched root path so each window can filter for its own events

### Tauri Permissions

Minimal scope — only declare what's needed:
- `fs:read-files`, `fs:write-files`, `fs:read-dirs`
- `dialog:open`, `dialog:save`
- `shell:open`

Do NOT enable `fs:allow-read-recursive` globally — scope it to the user-opened folder path.

## Consequences

**Positive:**
- No Rust learning curve for 90% of backend needs
- Plugins are maintained by the Tauri team, well-tested across platforms
- Minimal permission surface reduces security risk
- Faster development velocity at MVP

**Negative:**
- Plugins may not cover future advanced features (e.g., custom file format support, background indexing)
- File watcher requires basic Rust knowledge (Rust `notify` crate + Tauri command registration)
