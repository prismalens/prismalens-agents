import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { PlConfig } from "./index.js";
import { interpolateDeep } from "./interpolate.js";
import type { PlConfigOutput } from "./schema.js";
import { PlConfigSchema } from "./schema.js";
import { snakeToCamelCase } from "./transform.js";

export interface CliOverrides {
	model?: string;
	timeout?: number;
	budgetTokens?: number;
	agent?: string;
	maxAgents?: number;
	verbose?: boolean;
}

/**
 * Read a YAML config file. Returns empty object if file doesn't exist.
 */
async function readYamlFile(
	filePath: string,
): Promise<Record<string, unknown>> {
	try {
		const content = await readFile(filePath, "utf-8");
		return (parseYaml(content) as Record<string, unknown>) ?? {};
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			return {};
		}
		throw err;
	}
}

/**
 * Deep merge two objects. Later values override earlier.
 * Arrays are replaced (not concatenated). Objects are merged recursively.
 */
function deepMerge(
	target: Record<string, unknown>,
	source: Record<string, unknown>,
): Record<string, unknown> {
	const result = { ...target };

	for (const [key, sourceValue] of Object.entries(source)) {
		const targetValue = result[key];

		if (
			sourceValue !== null &&
			typeof sourceValue === "object" &&
			!Array.isArray(sourceValue) &&
			targetValue !== null &&
			typeof targetValue === "object" &&
			!Array.isArray(targetValue)
		) {
			result[key] = deepMerge(
				targetValue as Record<string, unknown>,
				sourceValue as Record<string, unknown>,
			);
		} else {
			result[key] = sourceValue;
		}
	}

	return result;
}

/**
 * Apply CLI flag overrides to a config object.
 */
function applyCliOverrides(
	config: Record<string, unknown>,
	overrides: CliOverrides,
): Record<string, unknown> {
	const result = { ...config };

	if (overrides.model !== undefined) {
		result.agent = deepMerge((result.agent as Record<string, unknown>) ?? {}, {
			model: overrides.model,
		});
	}
	if (overrides.timeout !== undefined) {
		result.budget = deepMerge(
			(result.budget as Record<string, unknown>) ?? {},
			{ timeout_ms: overrides.timeout },
		);
	}
	if (overrides.budgetTokens !== undefined) {
		result.budget = deepMerge(
			(result.budget as Record<string, unknown>) ?? {},
			{ tokens: overrides.budgetTokens },
		);
	}
	if (overrides.agent !== undefined) {
		result.agent = deepMerge((result.agent as Record<string, unknown>) ?? {}, {
			default: overrides.agent,
		});
	}
	if (overrides.maxAgents !== undefined) {
		result.budget = deepMerge(
			(result.budget as Record<string, unknown>) ?? {},
			{ max_concurrent_sub_agents: overrides.maxAgents },
		);
	}
	if (overrides.verbose) {
		result.logging = deepMerge(
			(result.logging as Record<string, unknown>) ?? {},
			{ level: "debug" },
		);
	}

	return result;
}

/**
 * Apply environment variable overrides to config.
 */
function applyEnvOverrides(
	config: Record<string, unknown>,
): Record<string, unknown> {
	const result = { ...config };

	if (process.env.PL_LOG_LEVEL) {
		result.logging = deepMerge(
			(result.logging as Record<string, unknown>) ?? {},
			{ level: process.env.PL_LOG_LEVEL },
		);
	}

	return result;
}

export interface LoadConfigOptions {
	configPath?: string;
	cliOverrides?: CliOverrides;
}

/**
 * Load and validate pl.config.yaml with full inheritance chain.
 *
 * Priority (later overrides earlier):
 * 1. Built-in defaults (Zod .default() values)
 * 2. ~/.prismalens/pl.config.yaml (global)
 * 3. ./pl.config.yaml (project)
 * 4. --config path (explicit override)
 * 5. CLI flag overrides
 * 6. Environment variable overrides
 */
export async function loadConfig(
	options?: LoadConfigOptions,
): Promise<PlConfig> {
	const globalPath = resolve(homedir(), ".prismalens", "pl.config.yaml");
	const projectPath = resolve("pl.config.yaml");

	// Read config layers (missing files → empty object)
	const globalConfig = await readYamlFile(globalPath);
	const projectConfig = await readYamlFile(projectPath);

	// Start with global, override with project
	let merged = deepMerge(globalConfig, projectConfig);

	// Apply explicit --config path override
	if (options?.configPath) {
		const explicitConfig = await readYamlFile(options.configPath);
		merged = deepMerge(merged, explicitConfig);
	}

	// Apply CLI flag overrides
	if (options?.cliOverrides) {
		merged = applyCliOverrides(merged, options.cliOverrides);
	}

	// Apply environment variable overrides
	merged = applyEnvOverrides(merged);

	// Interpolate ${VAR} patterns in string values
	const interpolated = interpolateDeep(merged) as Record<string, unknown>;

	// Validate with Zod (applies defaults for missing fields)
	let validated: PlConfigOutput;
	try {
		validated = PlConfigSchema.parse(interpolated);
	} catch (err) {
		const details = err instanceof Error ? err.message : String(err);
		throw new Error(`Invalid configuration: ${details}`);
	}

	// Transform snake_case keys to camelCase
	const transformed = snakeToCamelCase(validated) as PlConfig;

	// Freeze to enforce immutability
	return Object.freeze(transformed);
}
