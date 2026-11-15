/** c12 puts a layer's own layers right after it: this layer not listed last lets Docus silently outrank later layers. */
export function layerOrderProblem(layerDirs: readonly string[]): string | undefined {
  const docus = layerDirs.findIndex((dir) => /[\\/]docus[\\/]?$/.test(dir))
  if (docus === -1) return `mion-shared found no Docus layer. Layers: ${layerDirs.join(', ')}`
  if (docus === layerDirs.length - 1) return undefined
  return `mion-shared must be the LAST entry of \`extends\`, so Docus stays the lowest layer. Layers: ${layerDirs.join(', ')}`
}
