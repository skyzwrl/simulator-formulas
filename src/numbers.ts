export const MAX_VALUE = 1.7976931348623157e308;

// past 2^53 a double can't hold every integer, so adding a small amount to a huge balance is a
// no-op. games that need to grow beyond this want a mantissa/exponent number type instead
export const MAX_EXACT_INTEGER = 2 ** 53;

export function isFiniteNumber(value: number): boolean {
	return value === value && value !== math.huge && value !== -math.huge;
}

export function saturate(value: number, fallback = 0): number {
	if (value !== value) {
		return fallback;
	}
	return math.clamp(value, -MAX_VALUE, MAX_VALUE);
}
