import type { RasterInfo } from '../assets/raster'

export type DocumentKind = 'markdown' | 'csv' | 'json' | 'text' | 'raster' | 'external'

export type DocumentClassification =
  | { readonly kind: 'markdown' | 'csv' | 'json' | 'raster' | 'external' }
  | { readonly kind: 'text'; readonly language: string; readonly managedExtension?: string }

const suffixLanguages: Readonly<Record<string, string>> = {
  '.txt': 'Plain text', '.text': 'Plain text', '.log': 'Plain text',
  '.js': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript', '.jsx': 'JSX',
  '.ts': 'TypeScript', '.mts': 'TypeScript', '.cts': 'TypeScript', '.tsx': 'TSX',
  '.html': 'HTML', '.htm': 'HTML', '.css': 'CSS', '.scss': 'SCSS', '.sass': 'Sass',
  '.less': 'Less', '.vue': 'Vue', '.svelte': 'Svelte', '.astro': 'Astro',
  '.py': 'Python', '.pyi': 'Python', '.sh': 'Shell', '.bash': 'Bash', '.zsh': 'Zsh',
  '.fish': 'Fish', '.c': 'C', '.h': 'C header', '.cc': 'C++', '.cpp': 'C++',
  '.cxx': 'C++', '.hpp': 'C++ header', '.hxx': 'C++ header', '.cs': 'C#',
  '.java': 'Java', '.kt': 'Kotlin', '.kts': 'Kotlin', '.go': 'Go', '.rs': 'Rust',
  '.swift': 'Swift', '.rb': 'Ruby', '.php': 'PHP', '.lua': 'Lua', '.pl': 'Perl',
  '.pm': 'Perl', '.r': 'R', '.scala': 'Scala', '.xml': 'XML', '.yaml': 'YAML',
  '.yml': 'YAML', '.toml': 'TOML', '.ini': 'INI', '.cfg': 'Configuration',
  '.conf': 'Configuration', '.jsonc': 'JSON with comments', '.sql': 'SQL',
  '.graphql': 'GraphQL', '.gql': 'GraphQL', '.proto': 'Protocol Buffers',
  '.properties': 'Java properties', '.cmake': 'CMake', '.gradle': 'Gradle',
  '.tf': 'Terraform', '.tfvars': 'Terraform', '.hcl': 'HCL', '.nix': 'Nix',
  '.rst': 'reStructuredText', '.adoc': 'AsciiDoc', '.tex': 'TeX',
}

export const SPECIALIZED_DOCUMENT_EXTENSIONS = Object.freeze(['md', 'markdown', 'csv', 'json'] as const)
export const GENERIC_TEXT_EXTENSIONS = Object.freeze(Object.keys(suffixLanguages).map((suffix) => suffix.slice(1)))
export const RASTER_EXTENSIONS = Object.freeze(['png', 'jpg', 'jpeg', 'gif', 'webp'] as const)

const exactBasenames: Readonly<Record<string, string>> = {
  license: 'Plain text', notice: 'Plain text', authors: 'Plain text',
  'cmakelists.txt': 'CMake', dockerfile: 'Dockerfile', makefile: 'Makefile',
  gnumakefile: 'Makefile', '.env': 'Environment', '.gitignore': 'Ignore rules',
  '.prettierignore': 'Ignore rules', '.eslintignore': 'Ignore rules',
  '.gitattributes': 'Git attributes', '.editorconfig': 'EditorConfig',
  '.npmrc': 'npm configuration', '.nvmrc': 'nvm configuration',
  '.prettierrc': 'Prettier configuration', '.eslintrc': 'ESLint configuration',
}

const prefixBasenames: readonly (readonly [string, string])[] = [
  ['dockerfile.', 'Dockerfile'], ['.env.', 'Environment'],
]

const rasterSuffixes = new Set(RASTER_EXTENSIONS.map((extension) => `.${extension}`))

const languageGrammars: Readonly<Record<string, string>> = {
  Bash: 'bash', C: 'c', 'C header': 'c', 'C#': 'csharp', 'C++': 'cpp', 'C++ header': 'cpp',
  Configuration: 'ini', CSS: 'css', EditorConfig: 'ini', Go: 'go', GraphQL: 'graphql', HTML: 'xml',
  INI: 'ini', Java: 'java', JavaScript: 'javascript', JSX: 'javascript', 'JSON with comments': 'json',
  Kotlin: 'kotlin', Less: 'less', Lua: 'lua', Makefile: 'makefile', Perl: 'perl', PHP: 'php',
  'Prettier configuration': 'json', Python: 'python', R: 'r', Ruby: 'ruby', Rust: 'rust', Sass: 'scss',
  SCSS: 'scss', Shell: 'bash', SQL: 'sql', Svelte: 'xml', Swift: 'swift', TSX: 'typescript',
  TypeScript: 'typescript', Vue: 'xml', XML: 'xml', YAML: 'yaml', Zsh: 'bash',
}

export function classifyDocumentName(name: string): DocumentClassification {
  const lower = name.toLocaleLowerCase('en-US')
  if (lower.endsWith('.markdown') || lower.endsWith('.md')) return { kind: 'markdown' }
  if (lower.endsWith('.csv')) return { kind: 'csv' }
  if (lower.endsWith('.json')) return { kind: 'json' }

  const exact = exactBasenames[lower]
  if (exact) return textClassification(exact, lower)
  const prefix = prefixBasenames.find(([candidate]) => lower.startsWith(candidate))
  if (prefix) return textClassification(prefix[1], extensionFrom(lower))

  const extension = extensionFrom(lower)
  const language = suffixLanguages[extension]
  if (language) return textClassification(language, extension)
  if (rasterSuffixes.has(extension)) return { kind: 'raster' }
  return { kind: 'external' }
}

export function grammarForLanguage(language: string): string | undefined {
  return languageGrammars[language]
}

export function documentKindAllowsWrite(kind: DocumentKind): boolean {
  return kind === 'markdown' || kind === 'csv' || kind === 'json' || kind === 'text'
}

export function documentKindAllowsMarkdownAssets(kind: DocumentKind): boolean {
  return kind === 'markdown'
}

export interface RasterDisplayMetadata {
  readonly animated: boolean
  readonly format: 'GIF' | 'JPEG' | 'PNG' | 'WebP'
  readonly height: number
  readonly width: number
}

export function rasterDisplayMetadata(info: RasterInfo): RasterDisplayMetadata {
  const format = info.mime === 'image/png' ? 'PNG'
    : info.mime === 'image/jpeg' ? 'JPEG'
      : info.mime === 'image/gif' ? 'GIF'
        : 'WebP'
  return { animated: info.frames > 1, format, height: info.height, width: info.width }
}

function extensionFrom(name: string): string {
  const index = name.lastIndexOf('.')
  return index < 0 ? '' : name.slice(index)
}

function textClassification(language: string, managedExtension?: string): DocumentClassification {
  return managedExtension
    ? { kind: 'text', language, managedExtension }
    : { kind: 'text', language }
}
