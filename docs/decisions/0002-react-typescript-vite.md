# ADR 0002: React + TypeScript + Vite

**Status:** Accepted  
**Date:** 2026-04  
**Deciders:** Mateus Pinheiro

## Context

The frontend framework must support building a complex editor application with rich state management, have first-class Tauri support, and provide strong typing for a large codebase.

## Decision

Use **React 19** with **TypeScript 5.x** (strict mode) and **Vite 8** as the build tool.

## Rationale

- **React 19**: Largest talent pool of any UI framework, first-class support in Tauri 2.x, rich ecosystem of tooling and component libraries. All key dependencies (TipTap 3.x, Zustand, React Testing Library, dnd-kit, lucide-react) have confirmed React 19 peer dependency support. React 19 brings improved `use()` hook, server component foundations, and better `ref` handling as props.
- **TypeScript strict mode**: Required for a complex editor application. No `any` types in production code. Catches type errors at compile time rather than runtime.
- **Vite 8**: Fast HMR (hot module replacement), native ESM, excellent Tauri integration via `@tauri-apps/cli`. Vite 8 includes the Rolldown merge for faster builds and built-in Oxc-based React Refresh transform (used by `@vitejs/plugin-react` 6.x). Development experience is significantly faster than webpack-based alternatives.

## Consequences

**Positive:**
- Broad hiring pool and community support
- TipTap and CodeMirror both have React-first or React-compatible APIs
- Vite's fast HMR keeps the development feedback loop tight
- TypeScript strict mode prevents entire categories of bugs

**Negative:**
- React's virtual DOM has overhead compared to compiled frameworks (Svelte, Solid) — acceptable for an editor app where the heavy lifting is in ProseMirror/CodeMirror
