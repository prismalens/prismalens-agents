import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defineCommand } from "citty";
import consola from "consola";
import type { PlConfig } from "../core/config/index.js";
import { loadConfig } from "../core/config/index.js";
import { buildContext } from "../core/context-builder.js";
import { detectRepo } from "../core/detect-repo.js";
import { createFileWatcher } from "../core/file-watcher.js";
import { parseStdin } from "../core/parse-stdin.js";
import { loadPlugins } from "../core/plugin-loader.js";
import { createPluginRegistry } from "../core/plugin-registry.js";
import { runPreCheck } from "../core/pre-check.js";
import { buildOrchestratorPrompt } from "../core/prompt-builder.js";
import {
	createSessionManager,
	deriveProjectKey,
} from "../core/session-manager.js";
import { createTmuxSession } from "../plugins/runtimes/tmux.js";
import type { InvestigationEvent } from "../types/investigation.js";
import type {
	AgentPlugin,
	RuntimePlugin,
	WorkspacePlugin,
} from "../types/plugins.js";

function printTimelineEvent(event: InvestigationEvent): void {
	const time = new Date().toLocaleTimeString("en-US", {
		hour12: false,
		hour: "2-digit",
		minute: "2-digit",
	});

	let symbol: string;
	let desc: string;
	let badge = "";

	switch (event.type) {
		case "status_changed":
			symbol = "●";
			desc = event.status;
			break;
		case "finding_added":
			symbol = event.finding.type === "hypothesis" ? "◆" : "◇";
			desc = `${event.finding.type}${event.finding.confidence !== undefined ? ` (${event.finding.confidence})` : ""}  ${event.finding.description}`;
			if (event.agentId) badge = event.agentId;
			break;
		case "agent_dispatched":
			symbol = "↗";
			desc = `dispatched ${event.agentId}    "${event.task}"`;
			break;
		case "agent_completed":
			symbol = "↙";
			desc = `completed ${event.agentId}`;
			break;
		case "complete":
			symbol = "★";
			desc = `root cause (${event.confidence})  "${event.rootCause}"`;
			break;
		case "stalled":
			symbol = "⚠";
			desc = `stalled: ${event.reason}`;
			break;
		case "error":
			symbol = "▲";
			desc = event.message;
			break;
		default:
			symbol = "·";
			desc = JSON.stringify(event);
	}

	const line = badge
		? `  ${time}  ${symbol} ${desc.padEnd(50)} ${badge}`
		: `  ${time}  ${symbol} ${desc}`;

	process.stderr.write(`${line}\n`);
}

export default defineCommand({
	meta: {
		name: "investigate",
		description: "Run an investigation",
	},
	args: {
		repo: {
			type: "string",
			description:
				"Repository to investigate (org/repo or /local/path). Auto-detected from CWD if not provided.",
		},
		query: {
			type: "string",
			alias: "q",
			description:
				"What to investigate — alert name, error description, or free-text query.",
		},
		config: {
			type: "string",
			description: "Path to pl.config.yaml override",
		},
		model: {
			type: "string",
			description: "LLM model override",
		},
		timeout: {
			type: "string",
			description: "Investigation timeout in seconds (default: 600)",
		},
		"max-tokens": {
			type: "string",
			description: "Max LLM tokens (default: 500000)",
		},
		runtime: {
			type: "string",
			description: "Runtime plugin: tmux (default) or process",
		},
		resume: {
			type: "string",
			description: "Resume investigation by session ID",
		},
		output: {
			type: "string",
			description: "Write final report to file",
		},
		json: {
			type: "boolean",
			description: "JSON output to stdout",
		},
		quiet: {
			type: "boolean",
			description: "Suppress progress output",
		},
		"dry-run": {
			type: "boolean",
			description: "Show investigation context without spawning agent",
		},
		permissions: {
			type: "string",
			description: "Permission mode: default, permissionless, restricted",
		},
	},
	async run({ args }) {
		// 1. Validate inputs
		const hasStdin = !process.stdin.isTTY;
		if (!args.repo && !args.query && !hasStdin) {
			consola.error("Provide --repo, --query/-q, or pipe JSON to stdin");
			process.exit(2);
		}

		// 2. Load config
		let config: PlConfig;
		try {
			const cliOverrides: Record<string, unknown> = {};
			if (args.model) cliOverrides["model"] = args.model;
			if (args.timeout)
				cliOverrides["timeout"] = Number.parseInt(args.timeout, 10) * 1000;
			if (args["max-tokens"])
				cliOverrides["budgetTokens"] = Number.parseInt(args["max-tokens"], 10);

			config = await loadConfig({
				...(args.config ? { configPath: args.config } : {}),
				cliOverrides,
			});
		} catch (err) {
			consola.error(
				`Config error: ${err instanceof Error ? err.message : err}`,
			);
			process.exit(1);
		}

		// 3. Detect repo
		const repo = args.repo ?? (await detectRepo());

		// --dry-run: build context with empty pre-check and exit (skip stdin/plugins/agent)
		if (args["dry-run"]) {
			const context = buildContext({
				...(repo ? { repo } : {}),
				...(args.query ? { query: args.query } : {}),
				preCheck: { configuredSources: [], availableTools: [] },
			});
			console.log(JSON.stringify(context, null, 2));
			return;
		}

		// --resume: deferred to Phase 3
		if (args.resume) {
			const sessionManager = createSessionManager();
			const session = await sessionManager.get(args.resume);
			if (!session) {
				consola.error(`Session "${args.resume}" not found`);
				process.exit(1);
			}
			consola.info("Resume is not yet implemented. Session found:");
			consola.log(JSON.stringify(session, null, 2));
			return;
		}

		// 4. Parse stdin (after dry-run check to avoid blocking in subprocesses)
		const pipedPayload = hasStdin ? await parseStdin() : undefined;

		// 5. Load plugins
		const registry = createPluginRegistry();
		await loadPlugins(config, registry);

		// 5. Pre-check tools
		let preCheck: Awaited<ReturnType<typeof runPreCheck>>;
		try {
			preCheck = await runPreCheck(config);
		} catch (err) {
			consola.error(err instanceof Error ? err.message : "Pre-check failed");
			process.exit(3);
		}

		// 6. Build context
		const context = buildContext({
			...(repo ? { repo } : {}),
			...(args.query ? { query: args.query } : {}),
			...(pipedPayload ? { pipedPayload } : {}),
			preCheck,
		});

		// 8. Create workspace
		const workspace = registry.getDefault<WorkspacePlugin>("workspace");
		const handle = await workspace.create(context.investigationId);

		// 9. Register session
		const projectKey = deriveProjectKey(process.cwd());
		const sessionManager = createSessionManager();
		await sessionManager.create({
			sessionId: context.investigationId,
			label: args.query ?? "discover",
			projectKey,
			agentSessionId: "",
			agentBackend: config.agent.default,
			status: "spawning",
			workspacePath: handle.path,
			runtime: config.plugins.runtime,
			processRef: "",
			...(repo ? { repo } : {}),
			...(args.query ? { query: args.query } : {}),
			startedAt: context.createdAt,
			updatedAt: context.createdAt,
		});

		// 10. Build prompt and write to workspace
		const prompt = await buildOrchestratorPrompt(context, config);
		await writeFile(join(handle.path, ".prompt.md"), prompt, "utf-8");

		// Write tool availability for sub-agent dispatch
		await writeFile(
			join(handle.path, "tools.json"),
			JSON.stringify(
				{
					configuredSources: context.configuredSources,
					availableTools: context.availableTools,
				},
				null,
				2,
			),
			"utf-8",
		);

		// 11. Get runtime + agent plugins
		const runtime = registry.getDefault<RuntimePlugin>("runtime");

		let agent: AgentPlugin;
		try {
			agent = registry.getDefault<AgentPlugin>("agent");
		} catch {
			consola.error(
				`No agent backend available. Install one: claude, deepagents, or opencode.`,
			);
			process.exit(3);
		}

		// Create tmux session if using tmux runtime
		const tmuxSessionName = `pl-inv-${context.investigationId}`;
		if (config.plugins.runtime === "tmux") {
			await createTmuxSession(tmuxSessionName, "timeline");
		}

		// 12. Spawn orchestrator agent
		const task = args.query ?? "Investigate";
		const agentHandle = await runtime.start({
			command: agent.getLaunchCommand(
				{
					task,
					role: "orchestrator",
					workspacePath: handle.path,
				},
				{
					role: "orchestrator",
					task,
					workspaceDir: handle.path,
					model: config.agent.model,
				},
			),
			env: {
				...(agent.getEnvironment?.({
					role: "orchestrator",
					task,
					workspaceDir: handle.path,
				}) ?? {}),
				PL_RUNTIME: config.plugins.runtime,
				...(config.plugins.runtime === "tmux"
					? { PL_SESSION_NAME: tmuxSessionName }
					: {}),
			},
			cwd: handle.path,
			...(config.plugins.runtime === "tmux"
				? { sessionName: tmuxSessionName }
				: {}),
			windowName: "orchestrator",
		});

		// Update session with process ref
		await sessionManager.update(context.investigationId, {
			status: "gathering",
			processRef: agentHandle.sessionName ?? agentHandle.pid,
			updatedAt: new Date().toISOString(),
		});

		// 13. Print header
		if (!args.quiet) {
			consola.log("");
			consola.log(
				`  Investigation ${context.investigationId} | ${repo ?? "no repo"} | ${args.query ?? "discover"}`,
			);
			if (agentHandle.sessionName) {
				consola.log(`  tmux session: ${agentHandle.sessionName}`);
			}
			consola.log("");
		}

		// 14. Start file watcher + timeline
		const watcher = createFileWatcher({
			path: join(handle.path, "findings.jsonl"),
			debounceMs: 500,
			onEvent: (event) => {
				if (event.type === "status_changed") {
					void sessionManager.update(context.investigationId, {
						status: event.status as "gathering" | "analyzing" | "resolving",
						updatedAt: new Date().toISOString(),
					});
				}
				if (!args.quiet) {
					printTimelineEvent(event);
				}
			},
		});

		// 15. Wait for agent to exit
		const exitResult = await agentHandle.waitForExit();

		// 16. Close watcher, collect results
		await watcher.close();

		const agentOutput = await agent.parseOutput(handle.path);

		// 17. Update session
		await sessionManager.update(context.investigationId, {
			status: exitResult.exitCode === 0 ? "done" : "errored",
			completedAt: new Date().toISOString(),
			exitCode: exitResult.exitCode,
			updatedAt: new Date().toISOString(),
		});

		// 18. Print report
		if (args.json) {
			console.log(JSON.stringify(agentOutput, null, 2));
		} else if (args.output) {
			await writeFile(
				args.output,
				JSON.stringify(agentOutput, null, 2),
				"utf-8",
			);
			consola.success(`Report written to ${args.output}`);
		} else if (agentOutput.result?.rootCause) {
			consola.log("");
			consola.log(
				`  Root cause (${agentOutput.result.confidence ?? "?"}% confidence):`,
			);
			consola.log(`  ${agentOutput.result.rootCause}`);
			consola.log("");
		}

		process.exit(exitResult.exitCode === 0 ? 0 : 1);
	},
});
