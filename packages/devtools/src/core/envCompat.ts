// Reads an env var under its current MION_ name, falling back to the pre-rename RT_ spelling. The vars
// that still need it are read from a CONSUMER's environment (a shell profile, a CI job, a .env), where
// neither end is ours to move, so dropping the old name would silently stop honouring a value someone
// deliberately set. It warns once per process: a rename a user never hears about is one they debug later.

const warned = new Set<string>();

// readEnvCompat prefers the current name whenever it is SET, even to empty: an empty value is a
// deliberate choice, not a fall-through. It warns once when the legacy RT_ twin is what answered.
export function readEnvCompat(name: string): string | undefined {
  const current = process.env[name];
  if (current !== undefined) return current;

  const legacy = name.startsWith('MION_') ? `RT_${name.slice('MION_'.length)}` : undefined;
  if (!legacy) return undefined;

  const value = process.env[legacy];
  if (value === undefined) return undefined;

  if (!warned.has(legacy)) {
    warned.add(legacy);
    console.warn(`[mion] ${legacy} is deprecated and will be removed. Rename it to ${name}; it is still being honoured for now.`);
  }
  return value;
}
