import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

const interactiveTestIdRule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      missing: 'AC63: interactive elements require a literal stable data-testid.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        const name = node.name.type === 'JSXIdentifier' ? node.name.name : null
        const role = node.attributes.find(
          (attribute) =>
            attribute.type === 'JSXAttribute' &&
            attribute.name.name === 'role' &&
            attribute.value?.type === 'Literal',
        )
        const interactive =
          ['button', 'input', 'select', 'textarea'].includes(name ?? '') ||
          (name === 'a' && node.attributes.some((attribute) => attribute.type === 'JSXAttribute' && attribute.name.name === 'href')) ||
          (role?.type === 'JSXAttribute' && role.value?.type === 'Literal' && ['button', 'tab', 'menuitem'].includes(String(role.value.value)))
        if (!interactive) return
        const testId = node.attributes.find(
          (attribute) => attribute.type === 'JSXAttribute' && attribute.name.name === 'data-testid',
        )
        if (!testId || testId.type !== 'JSXAttribute' || testId.value?.type !== 'Literal') {
          context.report({ node, messageId: 'missing' })
        }
      },
    }
  },
}

const functionalTestIdRule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      selector: 'AC68: functional UI tests use getByTestId; role/name queries are reserved for accessibility assertions.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression' || node.callee.property.type !== 'Identifier') return
        if (node.callee.property.name === 'locator' || node.callee.property.name === 'getByText') {
          context.report({ node, messageId: 'selector' })
        }
      },
    }
  },
}

export default tseslint.config(
  { ignores: ['dist/**', 'dist-electron/**', 'release/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended.map((config) => ({ ...config, files: ['**/*.{ts,tsx}'] })),
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      markzen: { rules: { 'functional-testid': functionalTestIdRule, 'interactive-testid': interactiveTestIdRule } },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'markzen/interactive-testid': 'error',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/platform/electron/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['electron', 'electron/*'], message: 'AC23: Electron imports belong in src/platform/electron/.' },
            { group: ['node:*'], message: 'AC23: Node shell imports belong in src/platform/electron/.' },
            { group: ['**/platform/electron/**'], message: 'AC23: privileged adapter internals cannot be imported by domain code.' }
          ]
        }
      ]
    }
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      'markzen/functional-testid': 'error'
    }
  }
)
