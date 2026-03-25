const ENV_VAR_PATTERN = /\$\{([^}]+)\}/g;

/**
 * Replace `${VAR}` patterns in a string with environment variable values.
 * Throws if a referenced env var is not set (undefined).
 * Empty string is valid (env var exists but is empty).
 */
export function interpolateEnvVars(value: string): string {
	return value.replace(ENV_VAR_PATTERN, (_, varName: string) => {
		const envValue = process.env[varName];
		if (envValue === undefined) {
			throw new Error(
				`Environment variable "${varName}" is not set (referenced in config as \${${varName}})`,
			);
		}
		return envValue;
	});
}

/**
 * Recursively walk an object and interpolate `${VAR}` patterns in all string values.
 * Arrays and nested objects are traversed. Non-string values pass through unchanged.
 */
export function interpolateDeep(obj: unknown): unknown {
	if (typeof obj === "string") {
		return ENV_VAR_PATTERN.test(obj) ? interpolateEnvVars(obj) : obj;
	}

	if (Array.isArray(obj)) {
		return obj.map(interpolateDeep);
	}

	if (obj !== null && typeof obj === "object") {
		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(obj)) {
			result[key] = interpolateDeep(value);
		}
		return result;
	}

	return obj;
}
