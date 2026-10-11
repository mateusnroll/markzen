export function mapContentPosition(source: string, destination: string, position: number): number {
  const sourceScalars = [...source]
  const destinationScalars = [...destination]
  const offset = [...source.slice(0, position)].length
  const progress = sourceScalars.length ? offset / sourceScalars.length : 0
  const projected = Math.round(progress * destinationScalars.length)
  let best = projected
  let bestScore = 0
  for (let index = 0; index <= destinationScalars.length; index++) {
    let before = 0
    let after = 0
    while (before < 16 && offset > before && index > before && sourceScalars[offset - before - 1] === destinationScalars[index - before - 1]) before++
    while (after < 16 && offset + after < sourceScalars.length && index + after < destinationScalars.length && sourceScalars[offset + after] === destinationScalars[index + after]) after++
    const score = before + after
    if (score > bestScore || (score > 0 && score === bestScore && Math.abs(index - projected) < Math.abs(best - projected))) {
      best = index
      bestScore = score
    }
  }
  return destinationScalars.slice(0, best).join('').length
}
