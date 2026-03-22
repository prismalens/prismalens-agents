import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineCommand } from "citty";
import consola from "consola";
import { x } from "tinyexec";
import { stringify as yamlStringify } from "yaml";
import { checkCommand } from "../core/check-tool.js";
import { loadConfig } from "../core/config/index.js";
import { runDoctorChecks } from "../core/doctor-checks.js";

const AGENT_BACKENDS = [
	{ name: "deepagents-cli", cli: "deepagents", label: "Deep Agents CLI" },
	{ name: "claude-code", cli: "claude", label: "Claude Code" },
	{ name: "opencode", cli: "opencode", label: "OpenCode" },
] as const;

const ALERT_SOURCES = [
	{ name: "alertmanager", cli: "amtool", label: "Alertmanager" },
	{ name: "prometheus", cli: "promtool", label: "Prometheus" },
	{ name: "sentry", cli: "sentry-cli", label: "Sentry" },
	{ name: "grafana", cli: "curl", label: "Grafana (curl)" },
	{ name: "pagerduty", cli: "pd", label: "PagerDuty" },
] as const;

interface DetectedTool {
	name: string;
	cli: string;
	label: string;
	available: boolean;
	version?: string;
}

async function detectTools(
	tools: ReadonlyArray<{ name: string; cli: string; label: string }>,
): Promise<DetectedTool[]> {
	return Promise.all(
		tools.map(async (tool) => {
			const result = await checkCommand(tool.cli);
			return {
				...tool,
				available: result.available,
				...(result.version ? { version: result.version } : {}),
			};
		}),
	);
}

export default defineCommand({
	meta: {
		name: "init",
		description:
			"Interactive setup wizard — generates pl.config.yaml and installs skills",
	},
	args: {
		yes: {
			type: "boolean",
			alias: "y",
			description: "Accept defaults without prompting (CI-friendly)",
			default: false,
		},
		"dry-run": {
			type: "boolean",
			description:
				"Show what would be generated without writing files or installing skills",
			default: false,
		},
	},
	async run({ args }) {
		const auto = args.yes;
		const dryRun = args["dry-run"];

		consola.log("");

		// Auto-detect repo from git remote
		let detectedRepo: string | undefined;
		try {
			const gitResult = await x("git", ["remote", "get-url", "origin"]);
			const remoteUrl = gitResult.stdout.trim();
			// Extract owner/repo from HTTPS or SSH URLs
			const match = remoteUrl.match(
				/(?:github\.com|gitlab\.com|bitbucket\.org)[/:](.+?)(?:\.git)?$/,
			);
			if (match?.[1]) {
				detectedRepo = match[1];
			}
		} catch {
			// Not a git repo or no remote — skip
		}

		if (detectedRepo) {
			consola.info(`  Detected repo: ${detectedRepo}`);
		}

		// Detect CLIs
		const agents = await detectTools(AGENT_BACKENDS);
		const sources = await detectTools(ALERT_SOURCES);

		const detectedAgents = agents.filter((a) => a.available);
		const detectedSources = sources.filter((s) => s.available);

		consola.log(
			`  Detected CLIs: ${[...detectedAgents, ...detectedSources].map((t) => `${t.cli}${t.version ? ` ${t.version}` : ""}`).join(", ") || "none"}`,
		);
		consola.log("");

		// Select agent backend
		let selectedAgent: string;
		if (auto) {
			selectedAgent = detectedAgents[0]?.name ?? "deepagents-cli";
			consola.info(`  Agent backend: ${selectedAgent} (auto)`);
		} else {
			const agentOptions = agents.map((a) => ({
				label: `${a.label}${a.available ? ` (${a.version ?? "detected"})` : " (not installed)"}`,
				value: a.name,
			}));
			const answer = (await consola.prompt("Agent backend:", {
				type: "select",
				options: agentOptions,
			})) as string;
			if (typeof answer === "symbol") {
				consola.warn("Setup cancelled");
				return;
			}
			selectedAgent = answer;
		}

		const validAgents = AGENT_BACKENDS.map((b) => b.name as string);
		if (!validAgents.includes(selectedAgent)) {
			consola.error(`Invalid agent backend: ${selectedAgent}`);
			return;
		}

		// Select alert sources
		let selectedSources: string[];
		if (auto) {
			selectedSources = [];
			consola.info("  Alert sources: none (auto)");
		} else {
			const sourceOptions = sources.map((s) => ({
				label: `${s.label}${s.available ? "" : " (not installed)"}`,
				value: s.name,
			}));
			const answer = (await consola.prompt("Alert sources:", {
				type: "multiselect",
				options: sourceOptions,
			})) as unknown as string[];
			if (typeof answer === "symbol") {
				consola.warn("Setup cancelled");
				return;
			}
			selectedSources = answer;
		}

		// Select default model
		let selectedModel: string;
		if (auto) {
			selectedModel = "claude-sonnet-4-5";
			consola.info(`  Default model: ${selectedModel} (auto)`);
		} else {
			const answer = (await consola.prompt("Default model:", {
				type: "text",
				default: "claude-sonnet-4-5",
				placeholder: "claude-sonnet-4-5",
			})) as string;
			if (typeof answer === "symbol") {
				consola.warn("Setup cancelled");
				return;
			}
			selectedModel = answer;
		}

		// Check overwrite
		const configPath = resolve("pl.config.yaml");
		if (existsSync(configPath) && !auto) {
			const overwrite = (await consola.prompt(
				"pl.config.yaml already exists. Overwrite?",
				{ type: "confirm" },
			)) as boolean;

			if (typeof overwrite === "symbol" || !overwrite) {
				consola.warn("Setup cancelled");
				return;
			}
		}

		// Generate config
		const config: Record<string, unknown> = {
			...(detectedRepo ? { repo: detectedRepo } : {}),
			agent: {
				default: selectedAgent,
				model: selectedModel,
			},
		};

		if (selectedSources.length > 0) {
			const alertSources: Record<string, Record<string, string>> = {};
			for (const sourceName of selectedSources) {
				alertSources[sourceName] = {};
			}
			config.alert_sources = alertSources;
		}

		const yamlContent = yamlStringify(config);

		if (dryRun) {
			consola.info("Dry run — config that would be written to pl.config.yaml:");
			consola.log("");
			consola.log(yamlContent);
			return;
		}

		await writeFile(configPath, yamlContent, "utf-8");
		consola.success("Written pl.config.yaml");

		// Install skills
		consola.log("  Installing skills...");
		try {
			await x(
				"npx",
				[
					"skills",
					"add",
					"prismalens-org/prismalens-agents",
					"-a",
					selectedAgent === "claude-code" ? "claude-code" : selectedAgent,
					"-y",
				],
				{ throwOnError: true, timeout: 30_000 },
			);
			consola.success("Skills installed");
		} catch {
			consola.warn(
				"Skills installation failed. Install manually: npx skills add prismalens-org/prismalens-agents",
			);
		}

		// Run doctor
		consola.log("");
		let loadedConfig: Awaited<ReturnType<typeof loadConfig>> | undefined;
		try {
			loadedConfig = await loadConfig();
		} catch {
			// Config just written should be valid
		}

		const doctorResult = await runDoctorChecks(loadedConfig);
		if (doctorResult.allRequiredPassed) {
			consola.success("Environment verified (pl doctor passed)");
		} else {
			consola.warn("Some required checks failed — run `pl doctor` for details");
		}

		// Print next steps
		const allowedTools = ["pl", "curl", "jq"];
		for (const src of selectedSources) {
			const sourceDef = sources.find((s) => s.name === src);
			if (sourceDef && sourceDef.cli !== "curl") {
				allowedTools.push(sourceDef.cli);
			}
		}

		consola.log("");
		consola.log(
			`  Auto-approved: ${allowedTools.join(", ")} (via shell_allow_list).`,
		);
		consola.log(
			"  Other commands prompt for approval in the agent's terminal.",
		);
		consola.log(
			"  Runtime: tmux (agents run in tmux windows — attach to interact).",
		);
		consola.log("");
		consola.log(`  Run: pl investigate --repo org/repo --alert "AlertName"`);
		consola.log("");
	},
});
