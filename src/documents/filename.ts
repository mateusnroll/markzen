const recognizedExtension = /\.(md|markdown|txt)$/i
const invalidCharacters = /[/\\:*?"<>|]/
const reservedDevice = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i

export type FilenameValidation = { readonly valid: true } | { readonly valid: false; readonly reason: string }

export function validateDocumentName(value: string): FilenameValidation {
  if (value.length === 0) return invalid('A filename is required.')
  if (value === '.' || value === '..') return invalid('This name is reserved.')
  if ([...value].some((character) => character.codePointAt(0)! < 0x20 || character.codePointAt(0) === 0x7f)) {
    return invalid('The filename contains a reserved character.')
  }
  if (invalidCharacters.test(value)) return invalid('The filename contains a reserved character.')
  if (/[ .]$/.test(value)) return invalid('A filename cannot end in a space or dot.')
  if (reservedDevice.test(value)) return invalid('This filename is reserved by the operating system.')
  return { valid: true }
}

export function displayDocumentStem(filename: string): string {
  return filename.replace(recognizedExtension, '')
}

export function deriveDocumentFilename(title: string, existingExtension: string | undefined): string {
  if (recognizedExtension.test(title)) return title
  return `${title}${existingExtension ?? '.md'}`
}

export function getRecognizedExtension(filename: string): string | undefined {
  return filename.match(recognizedExtension)?.[0]
}

const invalid = (reason: string): FilenameValidation => ({ reason, valid: false })
