import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  optimizeDeps: {
    include: [
      '@tiptap/core',
      '@tiptap/extension-link',
      '@tiptap/extension-table',
      '@tiptap/extension-task-item',
      '@tiptap/extension-task-list',
      '@tiptap/markdown',
      '@tiptap/pm/state',
      '@tiptap/pm/view',
      '@tiptap/react',
      '@tiptap/starter-kit',
    ],
  },
  test: {
    include: ['tests/browser/**/*.test.tsx'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
})
