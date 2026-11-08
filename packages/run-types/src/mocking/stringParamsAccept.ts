// Exact runtime mirror of the stringFormat validator (Go `stringConditions`): the mock walker uses it to keep only
// candidates the emitted validator accepts. Lengths count code points and every char / value set rebuilds the
// validator's own regex, so a mock this accepts always re-passes `validate`.

/** Code points, the unit JSON Schema length bounds and the emitted validator count in. **/
export function codePointLength(value: string): number {
  let count = 0;
  for (const _char of value) count++;
  return count;
}

/** True when `value` passes every stringFormat param; `unknownParam` answers (or throws) for a key this cannot test. **/
export function stringParamsAccept(
  value: string,
  params: Record<string, unknown>,
  unknownParam: (key: string, param: unknown) => boolean
): boolean {
  for (const [key, param] of Object.entries(params)) {
    if (!paramAccepts(key, param, value, params, unknownParam)) return false;
  }
  return true;
}

function paramAccepts(
  key: string,
  param: unknown,
  value: string,
  params: Record<string, unknown>,
  unknownParam: (key: string, param: unknown) => boolean
): boolean {
  switch (key) {
    case 'maxLength':
      return typeof param !== 'number' || codePointLength(value) <= param;
    case 'minLength':
      return typeof param !== 'number' || codePointLength(value) >= param;
    case 'length':
      return typeof param !== 'number' || codePointLength(value) === param;
    case 'pattern': {
      const pattern = param as {source?: unknown; flags?: unknown} | undefined;
      if (!pattern || typeof pattern.source !== 'string') return unknownParam(key, param);
      return new RegExp(pattern.source, typeof pattern.flags === 'string' ? pattern.flags : '').test(value);
    }
    case 'allowedChars':
      return charSetAccepts(param, value, (escaped) => `^[${escaped}]+$`, true);
    case 'disallowedChars':
      return charSetAccepts(param, value, (escaped) => `[${escaped}]`, false);
    case 'allowedValues':
      return valueSetAccepts(param, value, true);
    case 'disallowedValues':
      return valueSetAccepts(param, value, false);
    case 'isRegex':
      return param !== true || compilesAsRegex(value);
    case 'contentMediaType':
      // Any other media type describes the payload and constrains nothing, as in the validator.
      return param !== 'application/json' || parsesAsJson(params.contentEncoding === 'base64' ? decodeBase64(value) : value);
    // No check of their own: generation-only, a rewrite validate never applies, or read by contentMediaType.
    case 'mockSamples':
    case 'generator':
    case 'transform':
    case 'contentEncoding':
      return true;
    default:
      return unknownParam(key, param);
  }
}

// `^[…]+$` must match (allowed) or `[…]` must not (disallowed); an empty set is no check, as in Go `readCharParam`.
function charSetAccepts(param: unknown, value: string, source: (escaped: string) => string, mustMatch: boolean): boolean {
  const set = param as {val?: unknown; ignoreCase?: unknown} | undefined;
  if (!set || typeof set.val !== 'string' || set.val === '') return true;
  const matched = new RegExp(source(regexpEscape(set.val)), set.ignoreCase === true ? 'i' : '').test(value);
  return matched === mustMatch;
}

// `^(?:v1|v2…)$`, asserted for allowedValues and negated for disallowedValues; an empty list is no check.
function valueSetAccepts(param: unknown, value: string, mustMatch: boolean): boolean {
  const set = param as {val?: unknown; ignoreCase?: unknown} | undefined;
  const values = Array.isArray(set?.val) ? set.val.filter((entry): entry is string => typeof entry === 'string') : [];
  if (values.length === 0) return true;
  const source = `^(?:${values.map(regexpEscape).join('|')})$`;
  return new RegExp(source, set?.ignoreCase === true ? 'i' : '').test(value) === mustMatch;
}

// The exact escape set of Go `regexpEscape` (formats/string/shared.go), so a literal char matches verbatim.
function regexpEscape(text: string): string {
  return text.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}

function compilesAsRegex(value: string): boolean {
  try {
    new RegExp(value, 'u');
    return true;
  } catch {
    return false;
  }
}

function parsesAsJson(text: string | undefined): boolean {
  if (text === undefined) return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

function decodeBase64(value: string): string | undefined {
  try {
    return atob(value);
  } catch {
    return undefined;
  }
}
