/**
 * Why the layer order is wrong, or undefined when Docus is the lowest layer.
 * c12 puts a layer's own layers right after it, so the shell listed last keeps Docus last.
 * Anywhere else Docus outranks the layers after it and its components win silently.
 */
export function layerOrderProblem(layerDirs: readonly string[]): string | undefined {
  const docus = layerDirs.findIndex((dir) => /[\\/]docus[\\/]?$/.test(dir))
  if (docus === -1) return `mion-shell found no Docus layer. Layers: ${layerDirs.join(', ')}`
  if (docus === layerDirs.length - 1) return undefined
  return `mion-shell must be the LAST entry of \`extends\`, so Docus stays the lowest layer. Layers: ${layerDirs.join(', ')}`
}
