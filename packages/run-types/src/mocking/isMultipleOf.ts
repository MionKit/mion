// MIRROR of the check multipleOfCondition emits (ts-go-runtypes numeric/numberformat.go), so mocks and the
// constrained-child matcher accept exactly what the generated validator accepts.

// 4 × Number.EPSILON: above the rounding noise of `value / step`, far below a real miss.
export const DEFAULT_MULTIPLE_OF_TOLERANCE = 4 * Number.EPSILON;

export function isMultipleOf(value: number, step: number, tolerance: number = DEFAULT_MULTIPLE_OF_TOLERANCE): boolean {
  if (Number.isInteger(step)) return value % step === 0;
  const quotient = value / step;
  return Math.abs(quotient - Math.round(quotient)) <= Math.abs(quotient) * tolerance;
}
