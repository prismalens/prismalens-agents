import { access, constants, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { checkCommand } from "./check-tool.js";
import type { PlConfig } from "./config/index.js";

export interface CheckResult {
	name: string;
	pass: boolean;
	message: string;
	level: "required" | "info";
}

export interface DoctorResult {
	required: CheckResult[];
	informational: CheckResult[];
	allRequiredPassed: boolean;
}

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
	grafana: "curl", // no dedicated CLI
};

const ALERT_SOURCE_ENV_MAP: Record<string, string[]> = {
	alertmanager: ["ALERTMANAGER_URL"],
	prometheus: ["PROMETHEUS_URL"],
	sentry: ["SENTRY_AUTH_TOKEN"],
	grafana: ["GRAFANA_URL", "GRAFANA_API_KEY"],
	pagerduty: ["PD_TOKEN"],
};

/**
 * Run all doctor checks and return structured results.
 * If config is not provided, config validity check is skipped.
 */
export async function runDoctorChecks(
	config?: PlConfig,
): Promise<DoctorResult> {
	const required: CheckResult[] = [];
	const informational: CheckResult[] = [];

	// --- Required checks ---

	// 1. Node.js >= 20
	const nodeMajor = Number.parseInt(
		process.versions.node.split(".")[0] ?? "0",
		10,
	);
	required.push({
		name: "Node.js",
		pass: nodeMajor >= 20,
		message:
			nodeMajor >= 20
				? `Node.js v${process.versions.node}`
				: `Node.js v${process.versions.node} — requires >= 20`,
		level: "required",
	});

	// 2. Agent CLI installed
	const agentBackend = config?.agent.default ?? "deepagents-cli";
	const agentCliName = AGENT_CLI_MAP[agentBackend] ?? agentBackend;
	const agentCheck = await checkCommand(agentCliName);
	required.push({
		name: "Agent CLI",
		pass: agentCheck.available,
		message: agentCheck.available
			? `${agentCliName} ${agentCheck.version ?? "(available)"}`
			: `${agentCliName} not found — install the ${agentBackend} CLI`,
		level: "required",
	});

	// 3. Model API key
	const hasApiKey =
		process.env.ANTHROPIC_API_KEY !== undefined ||
		process.env.OPENAI_API_KEY !== undefined;
	required.push({
		name: "API key",
		pass: hasApiKey,
		message: hasApiKey
			? "API key configured"
			: "Set ANTHROPIC_API_KEY or OPENAI_API_KEY",
		level: "required",
	});

	// 4. curl installed
	const curlCheck = await checkCommand("curl");
	required.push({
		name: "curl",
		pass: curlCheck.available,
		message: curlCheck.available
			? `curl ${curlCheck.version ?? "(available)"}`
			: "curl not found — required for HTTP API fallback",
		level: "required",
	});

	// 5. jq installed
	const jqCheck = await checkCommand("jq");
	required.push({
		name: "jq",
		pass: jqCheck.available,
		message: jqCheck.available
			? `jq ${jqCheck.version ?? "(available)"}`
			: "jq not found — required for JSON processing",
		level: "required",
	});

	// 6. Config valid (only if config was provided — means it already parsed successfully)
	if (config) {
		required.push({
			name: "Config",
			pass: true,
			message: "pl.config.yaml valid",
			level: "required",
		});
	}

	// 7. ~/.prismalens/ writable
	const prismalensDir = resolve(homedir(), ".prismalens");
	let dirWritable = false;
	try {
		await mkdir(prismalensDir, { recursive: true });
		await access(prismalensDir, constants.W_OK);
		dirWritable = true;
	} catch {
		dirWritable = false;
	}
	required.push({
		name: "Data directory",
		pass: dirWritable,
		message: dirWritable
			? "~/.prismalens/ writable"
			: "~/.prismalens/ is not writable",
		level: "required",
	});

	// --- Informational checks ---

	// tmux (only if configured)
	if (config?.plugins.runtime === "tmux") {
		const tmuxCheck = await checkCommand("tmux");
		informational.push({
			name: "tmux",
			pass: tmuxCheck.available,
			message: tmuxCheck.available
				? `tmux ${tmuxCheck.version ?? "(available)"}`
				: "tmux not found — configured as runtime",
			level: "info",
		});
	}

	// Alert source CLIs + env vars
	if (config) {
		for (const sourceName of Object.keys(config.alertSources)) {
			const cliName = ALERT_SOURCE_CLI_MAP[sourceName];
			if (cliName && cliName !== "curl") {
				const cliCheck = await checkCommand(cliName);
				informational.push({
					name: `${sourceName} CLI`,
					pass: cliCheck.available,
					message: cliCheck.available
						? `${cliName} ${cliCheck.version ?? "(available)"}`
						: `${cliName} not installed — will use curl fallback`,
					level: "info",
				});
			}

			const envVars = ALERT_SOURCE_ENV_MAP[sourceName];
			if (envVars) {
				for (const envVar of envVars) {
					const isSet = process.env[envVar] !== undefined;
					informational.push({
						name: envVar,
						pass: isSet,
						message: isSet
							? `${envVar} set`
							: `${envVar} not set — configure in pl.config.yaml or set env var`,
						level: "info",
					});
				}
			}
		}
	}

	// gh auth status
	const ghCheck = await checkCommand("gh");
	if (ghCheck.available) {
		informational.push({
			name: "gh",
			pass: true,
			message: `gh ${ghCheck.version ?? "(available)"}`,
			level: "info",
		});
	}

	const allRequiredPassed = required.every((r) => r.pass);

	return { required, informational, allRequiredPassed };
}
