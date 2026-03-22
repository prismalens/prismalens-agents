export { interpolateDeep, interpolateEnvVars } from "./interpolate.js";
export type { CliOverrides, LoadConfigOptions } from "./loader.js";
export { loadConfig } from "./loader.js";
export type { PlConfigInput, PlConfigOutput } from "./schema.js";
export { PlConfigSchema } from "./schema.js";
export { snakeToCamelCase } from "./transform.js";

/**
 * The final camelCase config type used by all downstream code.
 * Derived from PlConfigOutput but with all keys transformed to camelCase.
 */
export interface PlConfig {
	$schema?: string;
	repo?: string;
	repos: Record<
		string,
		{
			repo: string;
			localPath: string | null;
			alertSources?: Record<string, Record<string, string>>;
		}
	>;
	agent: {
		default: "deepagents-cli" | "claude-code" | "opencode";
		model: string;
		timeoutMs: number;
		permissions: "default" | "permissionless" | "restricted";
		shellAllowList: string[];
	};
	subAgents: {
		model?: string;
		timeoutMs: number;
	};
	investigation: {
		maxConcurrent: number;
	};
	budget: {
		tokens: number;
		timeoutMs: number;
		maxConcurrentSubAgents: number;
		maxTotalSubAgents: number;
		maxRetries: number;
	};
	workspace: {
		baseDir: string;
		ttlMs: number;
		failureTtlMs: number;
	};
	plugins: {
		runtime: "process" | "tmux";
		reporter: "file-watching" | "ipc";
		notifier: string[];
	};
	alertSources: Record<string, Record<string, string>>;
	convergence: {
		confidenceThreshold: number;
		maxNoNewInfoRounds: number;
		stallDetectionWindow: number;
		stallTimeoutMs: number;
	};
	logging: {
		level: "debug" | "info" | "warn" | "error";
		format: "json" | "text";
	};
}
