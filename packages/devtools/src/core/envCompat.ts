// Reads an env var under its current MION_ name, falling back to the
// pre-rename RT_ spelling.
//
// The whole RT_ family moved to MION_ when the package namespace did. Most of
// those vars are internal plumbing the repo's own scripts set on both ends, so
// they moved and were done. A handful are read from a CONSUMER's environment,
// where neither end is ours: someone's shell profile, CI job, or .env still
// says RT_LINT_PRESPAWN. Dropping the old name there would silently stop
// honouring a value they deliberately set.
//
// So the old name keeps working and warns once per process. The warning is the
// point: a rename a user never hears about is a rename they debug later.

const warned = new Set<string>();

// readEnvCompat returns the current name's value when it is SET (even empty:
// an empty value is a deliberate choice, not a fall-through), else the legacy
// RT_ twin's, warning once when the legacy name is what answered.
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
