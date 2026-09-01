// Minimal base64-VLQ decoder for the standard source-map `mappings` field —
// enough for tests to assert line/column relocation without pulling a
// source-map library into the test deps.

export interface MappingSegment {
  generatedColumn: number;
  sourceIndex: number;
  originalLine: number;
  originalColumn: number;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// decodeMappings expands the delta-encoded `mappings` string into one
// segment list per GENERATED line. All indices are 0-based, matching the
// raw source-map encoding (not the 1-based devtools display).
export function decodeMappings(mappings: string): MappingSegment[][] {
  const lines: MappingSegment[][] = [];
  let sourceIndex = 0;
  let originalLine = 0;
  let originalColumn = 0;
  for (const lineText of mappings.split(';')) {
    const segments: MappingSegment[] = [];
    let generatedColumn = 0;
    for (const segmentText of lineText.split(',')) {
      if (segmentText === '') continue;
      const values: number[] = [];
      let value = 0;
      let shift = 0;
      for (const char of segmentText) {
        const digit = BASE64.indexOf(char);
        value |= (digit & 31) << shift;
        if (digit & 32) {
          shift += 5;
        } else {
          values.push(value & 1 ? -(value >>> 1) : value >>> 1);
          value = 0;
          shift = 0;
        }
      }
      generatedColumn += values[0];
      if (values.length >= 4) {
        sourceIndex += values[1];
        originalLine += values[2];
        originalColumn += values[3];
        segments.push({generatedColumn, sourceIndex, originalLine, originalColumn});
      }
    }
    lines.push(segments);
  }
  return lines;
}
