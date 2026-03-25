import { z } from "zod";

export const AgentConfigSchema = z.object({
	default: z
		.enum(["deepagents-cli", "claude-code", "opencode"])
		.default("deepagents-cli"),
	model: z.string().default("claude-sonnet-4-5"),
	timeout_ms: z.number().positive().default(1_800_000),
	permissions: z
		.enum(["default", "permissionless", "restricted"])
		.default("default"),
	shell_allow_list: z
		.array(z.string())
		.default([
			"pl",
			"gh",
			"amtool",
			"sentry-cli",
			"pd",
			"curl",
			"jq",
			"grep",
			"cat",
		]),
});

export const SubAgentConfigSchema = z.object({
	model: z.string().optional(),
	timeout_ms: z.number().positive().default(120_000),
});

export const BudgetConfigSchema = z.object({
	tokens: z.number().positive().default(500_000),
	timeout_ms: z.number().positive().default(1_800_000),
	max_concurrent_sub_agents: z.number().int().min(1).max(10).default(3),
	max_total_sub_agents: z.number().int().min(1).max(50).default(10),
	max_retries: z.number().int().min(0).max(5).default(2),
});

export const WorkspaceConfigSchema = z.object({
	base_dir: z.string().default("~/.prismalens"),
});

export const InvestigationConfigSchema = z.object({
	max_concurrent: z.number().int().min(1).max(10).default(3),
});

export const ConvergenceConfigSchema = z.object({
	confidence_threshold: z.number().min(0).max(1).default(0.8),
	max_no_new_info_rounds: z.number().int().min(1).default(3),
	stall_detection_window: z.number().int().min(1).default(3),
	stall_timeout_ms: z.number().positive().default(120_000),
});

export const LoggingConfigSchema = z.object({
	level: z.enum(["debug", "info", "warn", "error"]).default("info"),
	format: z.enum(["json", "text"]).default("json"),
});

export const AlertSourceConfigSchema = z.record(
	z.string(),
	z.record(z.string(), z.string()),
);

export const PluginsConfigSchema = z.object({
	runtime: z.enum(["process", "tmux"]).default("tmux"),
	reporter: z.enum(["file-watching", "ipc"]).default("file-watching"),
	notifier: z.array(z.string()).default([]),
});

export const RepoConfigSchema = z.object({
	repo: z.string(),
	local_path: z.string().nullable().default(null),
	alert_sources: AlertSourceConfigSchema.optional(),
});

/** Helper: make a sub-schema optional with defaults applied via transform */
function optionalWithDefaults<T extends z.ZodObject<z.ZodRawShape>>(schema: T) {
	return z
		.optional(z.record(z.string(), z.unknown()))
		.transform((val) => schema.parse(val ?? {}));
}

export const PlConfigSchema = z.object({
	$schema: z.string().optional(),
	repo: z.string().optional(),
	repos: z
		.record(z.string(), RepoConfigSchema)
		.optional()
		.transform((val) => val ?? {}),
	agent: optionalWithDefaults(AgentConfigSchema),
	sub_agents: optionalWithDefaults(SubAgentConfigSchema),
	investigation: optionalWithDefaults(InvestigationConfigSchema),
	budget: optionalWithDefaults(BudgetConfigSchema),
	workspace: optionalWithDefaults(WorkspaceConfigSchema),
	plugins: optionalWithDefaults(PluginsConfigSchema),
	alert_sources: AlertSourceConfigSchema.optional().transform(
		(val) => val ?? {},
	),
	convergence: optionalWithDefaults(ConvergenceConfigSchema),
	logging: optionalWithDefaults(LoggingConfigSchema),
});

export type PlConfigInput = z.input<typeof PlConfigSchema>;
export type PlConfigOutput = z.output<typeof PlConfigSchema>;
