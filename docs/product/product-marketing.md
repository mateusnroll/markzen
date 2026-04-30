# Markzen — Product Marketing Context

**Document type:** Product Marketing Reference  
**Status:** Living document  
**Last updated:** April 2026

---

## 1. Product Identity

**Name:** Markzen  
**Type:** Open-source, cross-platform Markdown editor  
**Positioning:** A fast, beautiful, focused Markdown editor for people who care about their writing environment — in the same ballpark as iA Writer and Obsidian, but with a sharper focus on Markdown, elegance, and speed.

---

## 2. Core Value Proposition

Markzen is a Markdown-first editor that feels native, looks beautiful, and gets out of the way. It combines an inline WYSIWYG editing experience with folder-level file navigation — making it equally at home as a single-file writing tool or a lightweight personal knowledge base.

**The three pillars:**
- **Fast** — Sub-500ms cold start, low memory footprint; feels snappy on every platform
- **Beautiful** — Rendered, inline editing (no split-pane preview); clean, elegant UI
- **Focused** — Markdown-first, no feature bloat; does one thing exceptionally well

---

## 3. Key Features

- **Inline WYSIWYG editor** — Markdown renders as you type (iA Writer-style), not in a separate preview pane
- **Source mode toggle** — Raw Markdown editing via CodeMirror 6 for power users (Obsidian-style toggle)
- **Folder navigation sidebar** — Open a directory of `.md` files; left sidebar shows the full file tree
- **Tab support** — Multiple files open simultaneously
- **Cross-platform** — macOS, Windows, Linux from a single codebase
- **Native feel** — Tauri-based (not Electron); uses the OS's native WebView

---

## 4. Target Audience

**Primary:** Writers, developers, and knowledge workers who:
- Live in Markdown daily
- Are dissatisfied with Electron-heavy editors (VS Code, Obsidian) for pure writing
- Want the aesthetic discipline of iA Writer but the file-system freedom of Obsidian
- Care about app performance and startup time
- Value open-source software

**Secondary:** Teams and developers looking for a lightweight, embeddable Markdown editing experience.

---

## 5. Competitive Landscape

| Product | Positioning | Key Weakness vs. Markzen |
|---|---|---|
| **iA Writer** | Premium, distraction-free writer | Closed source, no folder navigation, no FOSS |
| **Obsidian** | PKM powerhouse, graph-based | Heavy, plugin-dependent, not Markdown-first UX |
| **Typora** | Inline WYSIWYG Markdown | Paid, closed source, no folder-native navigation |
| **MarkEdit** | Lightweight macOS-only Markdown | macOS-only, source editor only (no WYSIWYG) |
| **MarkText** | Open-source WYSIWYG Markdown | Electron-based, largely unmaintained |
| **Notion** | All-in-one workspace | Proprietary format, cloud-dependent, not plain Markdown |

**Markzen's whitespace:** The intersection of *open-source + inline WYSIWYG + fast (non-Electron) + folder navigation* is currently unoccupied. MarkText came closest but is stagnant and Electron-based. Markzen owns this space.

---

## 6. Name & Brand

**Name:** Markzen  
**Rationale:** Portmanteau of *Markdown* + *Zen* — signals the format and the philosophy in a single word. Unique, unregistered, no trademark conflicts found.  
**Availability:** GitHub org, `.app`/`.io` domains, and social handles all available as of April 2026.  
**Tone:** Calm, precise, crafted. Not corporate. Not playful. Think: a well-made tool with no excess.

---

## 7. Key Messages

**Tagline candidates:**
- *Markdown, distilled.*
- *Write in Markdown. Think in Markzen.*
- *Fast. Beautiful. Yours.*

**Elevator pitch (one sentence):**  
Markzen is an open-source Markdown editor that combines iA Writer's inline editing elegance with Obsidian's file-system freedom — built on Tauri for native speed without the Electron overhead.

**For a developer audience:**  
Tauri 2.x + TipTap + React. Single codebase, three platforms, MIT licensed.

---

## 8. Open Questions / To Be Decided

- Business model: Pure FOSS, or open-core with a hosted/sync tier?
- License: Currently MIT (see LICENSE)
- Distribution: GitHub Releases only, or also Homebrew / winget / Flathub at launch?
- Mobile: Tauri 2.x supports iOS and Android — is that a future roadmap item?
- Sync strategy: Local-only at launch, with opt-in cloud sync later?
