export function pathContains(parent: string, candidate: string, separator: '/' | '\\'): boolean {
  const parentSegments = segments(parent, separator)
  const candidateSegments = segments(candidate, separator)
  return parentSegments.length <= candidateSegments.length && parentSegments.every((segment, index) => segment === candidateSegments[index])
}

export function relativeSegments(parent: string, candidate: string, separator: '/' | '\\'): readonly string[] | undefined {
  if (!pathContains(parent, candidate, separator)) return undefined
  return segments(candidate, separator).slice(segments(parent, separator).length)
}

const segments = (value: string, separator: '/' | '\\'): readonly string[] =>
  value.split(separator).filter((segment) => segment.length > 0)
