import { checkCommand } from "./check-tool.js";
import type { PlConfig } from "./config/index.js";

// Reuse maps from doctor-checks
const AGENT_CLI_MAP: Record<string, string> = {
	"deepagents-cli": "deepagents",
	"claude-code": "claude",
	opencode: "opencode",
};

const ALERT_SOURCE_CLI_MAP: Record<string, string> = {
	alertmanager: "amtool",
	prometheus: "promtool",
	sentry: "sentry-cli",
	pagerduty: "pd",
	grafana: "curl",
};

export interface PreCheckResult {
	configuredSources: Array<{
		type: string;
		url?: string;
		cliTool: string;
		available: boolean;
	}>;
	availableTools: Array<{ name: string; available: boolean }>;
}

/**
 * Validate tool availability for an investigation.
 * Throws on hard requirement failures (agent CLI, tmux when configured).
 * Returns structured results for prompt injection.
 */
export async function runPreCheck(config: PlConfig): Promise<PreCheckResult> {
	// Hard requirements — throw if missing
	const agentCliName =
		AGENT_CLI_MAP[config.agent.default] ?? config.agent.default;
	const agentCheck = await checkCommand(agentCliName);
	if (!agentCheck.available) {
		const err = new Error(
			`Agent CLI "${agentCliName}" not found. Install the ${config.agent.default} CLI.`,
		);
		(err as Error & { exitCode: number }).exitCode = 3;
		throw err;
	}

	if (config.plugins.runtime === "tmux") {
		const tmuxCheck = await checkCommand("tmux");
		if (!tmuxCheck.available) {
			const err = new Error(
				"tmux not found. Install tmux or set runtime: process in pl.config.yaml.",
			);
			(err as Error & { exitCode: number }).exitCode = 3;
			throw err;
		}
	}

	// Soft checks — record availability
	const configuredSources: PreCheckResult["configuredSources"] = [];
	for (const [sourceName, sourceConfig] of Object.entries(
		config.alertSources,
	)) {
		const cliTool = ALERT_SOURCE_CLI_MAP[sourceName] ?? "curl";
		const cliCheck = await checkCommand(cliTool);
		const url = sourceConfig["url"];
		configuredSources.push({
			type: sourceName,
			...(url ? { url } : {}),
			cliTool,
			available: cliCheck.available,
		});
	}

	const commonTools = ["curl", "jq", "gh"];
	const availableTools: PreCheckResult["availableTools"] = [];
	for (const tool of commonTools) {
		const check = await checkCommand(tool);
		availableTools.push({ name: tool, available: check.available });
	}

	return { configuredSources, availableTools };
}
