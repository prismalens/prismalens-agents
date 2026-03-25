/**
 * Convert a snake_case string to camelCase.
 */
function toCamelCase(str: string): string {
	return str.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

/**
 * Recursively transform all keys in an object from snake_case to camelCase.
 * Arrays of objects are traversed. Non-object/array values pass through unchanged.
 */
export function snakeToCamelCase(obj: unknown): unknown {
	if (Array.isArray(obj)) {
		return obj.map(snakeToCamelCase);
	}

	if (obj !== null && typeof obj === "object") {
		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(obj)) {
			result[toCamelCase(key)] = snakeToCamelCase(value);
		}
		return result;
	}

	return obj;
}
