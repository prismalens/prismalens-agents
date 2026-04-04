import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { defineCommand } from "citty";
import consola from "consola";
import { loadConfig } from "../core/config/index.js";
import { loadPlugins } from "../core/plugin-loader.js";
import { createPluginRegistry } from "../core/plugin-registry.js";
import {
	buildSubAgentPrompt,
	type SubAgentLineage,
	type SubAgentSibling,
	type ToolInfo,
} from "../core/prompt-builder.js";
import type { AgentPlugin, RuntimePlugin } from "../types/plugins.js";

interface PidsEntry {
	role: string;
	task: string;
	status: "active" | "exited" | "killed";
	pid?: number;
	sessionName?: string;
	windowName?: string;
	spawnedAt?: string;
}

function isProcessAlive(pid?: number): boolean {
	if (!pid || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

async function readPids(pidsPath: string): Promise<Record<string, PidsEntry>> {
	try {
		return JSON.parse(await readFile(pidsPath, "utf-8")) as Record<
			string,
			PidsEntry
		>;
	} catch {
		return {};
	}
}

async function readToolInfo(workspace: string): Promise<ToolInfo> {
	try {
		return JSON.parse(
			await readFile(join(workspace, "tools.json"), "utf-8"),
		) as ToolInfo;
	} catch {
		return { configuredSources: [], availableTools: [] };
	}
}

async function checkTmuxWindow(
	sessionName: string,
	windowName: string,
): Promise<boolean> {
	try {
		const { x } = await import("tinyexec");
		const result = await x("tmux", [
			"list-windows",
			"-t",
			sessionName,
			"-F",
			"#{window_name}",
		]);
		return result.stdout.trim().split("\n").includes(windowName);
	} catch {
		return false;
	}
}

async function isAgentAlive(entry: PidsEntry): Promise<boolean> {
	if (entry.sessionName && entry.windowName) {
		return checkTmuxWindow(entry.sessionName, entry.windowName);
	}
	return isProcessAlive(entry.pid);
}

/** Resolve a path within a workspace, rejecting traversal attempts */
function safeJoin(workspace: string, filename: string): string {
	const resolved = resolve(workspace, filename);
	if (!resolved.startsWith(`${resolve(workspace)}/`)) {
		throw new Error(`Path traversal attempt: ${filename}`);
	}
	return resolved;
}

export default defineCommand({
	meta: {
		name: "dispatch",
		description: "Spawn and manage investigation sub-agents",
	},
	args: {
		role: {
			type: "string",
			description: "Agent role: gatherer, analyst, resolver",
		},
		task: {
			type: "string",
			description: "Task description for the sub-agent",
		},
		timeout: {
			type: "string",
			description: "Agent timeout in seconds (default: 120)",
		},
		"budget-tokens": {
			type: "string",
			description: "Remaining token budget for this sub-agent",
		},
		agent: {
			type: "string",
			description: "Override agent backend for this sub-agent",
		},
		model: {
			type: "string",
			description: "LLM model for this sub-agent",
		},
		context: {
			type: "string",
			description:
				'JSON with lineage/siblings context (e.g. \'{"hypothesis":"OOM","confidence":0.6}\')',
		},
		list: {
			type: "boolean",
			description: "List running sub-agents",
		},
		output: {
			type: "string",
			description: "Read sub-agent output by agent ID",
		},
		kill: {
			type: "string",
			description: "Kill a sub-agent by agent ID",
		},
	},
	async run({ args }) {
		const workspace = process.env["PL_WORKSPACE"];

		if (!workspace) {
			consola.error("PL_WORKSPACE env var not set");
			process.exit(1);
		}

		const findingsPath = join(workspace, "findings.jsonl");
		const pidsPath = join(workspace, "pids.json");

		// --list: show sub-agents with live status
		if (args.list) {
			const pids = await readPids(pidsPath);
			const entries = await Promise.all(
				Object.entries(pids).map(async ([id, entry]) => {
					const alive = await isAgentAlive(entry);
					return {
						agentId: id,
						role: entry.role,
						task: entry.task,
						status: alive ? "active" : "exited",
					};
				}),
			);
			console.log(JSON.stringify(entries, null, 2));
			return;
		}

		// --output <id>: filter findings.jsonl for agent
		if (args.output) {
			try {
				const content = await readFile(findingsPath, "utf-8");
				const events = content
					.split("\n")
					.filter((l) => l.trim())
					.map((l) => JSON.parse(l) as Record<string, unknown>)
					.filter((e) => e["agentId"] === args.output);
				console.log(JSON.stringify(events, null, 2));
			} catch {
				console.log("[]");
			}
			return;
		}

		// --kill <id>: actually kill the process/tmux window
		if (args.kill) {
			const pids = await readPids(pidsPath);
			const entry = pids[args.kill];
			if (entry) {
				if (entry.sessionName && entry.windowName) {
					try {
						const { x } = await import("tinyexec");
						await x("tmux", [
							"kill-window",
							"-t",
							`${entry.sessionName}:${entry.windowName}`,
						]);
					} catch {
						// Window may already be gone
					}
				} else if (entry.pid) {
					try {
						process.kill(entry.pid, "SIGTERM");
					} catch {
						// Already dead
					}
				}
				pids[args.kill] = { ...entry, status: "killed" };
				await writeFile(pidsPath, JSON.stringify(pids, null, 2), "utf-8");
			}

			const event = {
				type: "agent_completed",
				agentId: args.kill,
				exitCode: -1,
				timestamp: new Date().toISOString(),
			};
			await appendFile(findingsPath, `${JSON.stringify(event)}\n`, "utf-8");
			consola.success(`Killed agent ${args.kill}`);
			return;
		}

		// --- Default: spawn sub-agent ---

		if (!args.role || !args.task) {
			consola.error("--role and --task are required to spawn a sub-agent");
			process.exit(2);
		}

		// 1. Load config and plugins
		const config = await loadConfig({});
		const registry = createPluginRegistry();
		await loadPlugins(config, registry);

		// 2. Resolve runtime + agent
		const runtimeType = process.env["PL_RUNTIME"] ?? config.plugins.runtime;
		if (runtimeType === "tmux") {
			try {
				registry.setDefault("runtime", "tmux");
			} catch {
				// tmux not available, fall back to process
			}
		}
		const runtime = registry.getDefault<RuntimePlugin>("runtime");

		let agent: AgentPlugin;
		try {
			agent = args.agent
				? registry.get<AgentPlugin>("agent", args.agent)
				: registry.getDefault<AgentPlugin>("agent");
		} catch {
			consola.error("No agent backend available");
			process.exit(3);
		}

		// 3. Generate agent ID
		const pids = await readPids(pidsPath);
		const agentNum = Object.keys(pids).length + 1;
		const agentId = `agent-${String(agentNum).padStart(3, "0")}`;

		// 4. Read tool info for prompt building
		const toolInfo = await readToolInfo(workspace);

		// 5. Parse --context JSON for lineage
		const lineage: SubAgentLineage = { parentTask: args.task };
		const contextSiblings: SubAgentSibling[] = [];
		if (args.context) {
			try {
				const parsed = JSON.parse(args.context) as Record<string, unknown>;
				if (typeof parsed["hypothesis"] === "string") {
					lineage.hypothesis = parsed["hypothesis"];
				}
				if (
					typeof parsed["confidence"] === "number" &&
					!Number.isNaN(parsed["confidence"])
				) {
					lineage.confidence = parsed["confidence"];
				}
				if (typeof parsed["checklistItemId"] === "string") {
					lineage.checklistItemId = parsed["checklistItemId"];
				}
				if (Array.isArray(parsed["siblings"])) {
					for (const s of parsed["siblings"]) {
						if (
							typeof s === "object" &&
							s !== null &&
							typeof (s as Record<string, unknown>)["agentId"] === "string" &&
							typeof (s as Record<string, unknown>)["role"] === "string" &&
							typeof (s as Record<string, unknown>)["task"] === "string"
						) {
							contextSiblings.push(s as SubAgentSibling);
						}
					}
				}
			} catch {
				// Ignore malformed context
			}
		}

		// 6. Build siblings from pids.json + context
		const siblings: SubAgentSibling[] = [
			...contextSiblings,
			...(await Promise.all(
				Object.entries(pids).map(async ([id, entry]) => ({
					agentId: id,
					role: entry.role,
					task: entry.task,
					status: ((await isAgentAlive(entry))
						? "active"
						: "exited") as SubAgentSibling["status"],
				})),
			)),
		];

		// 7. Build sub-agent prompt and write to workspace
		const prompt = await buildSubAgentPrompt(
			args.role,
			args.task,
			toolInfo,
			lineage,
			siblings,
		);
		const promptFile = `.prompt-${agentId}.md`;
		await writeFile(safeJoin(workspace, promptFile), prompt, "utf-8");

		// 8. Determine model: --model > subAgents.model > agent.model
		const model = args.model ?? config.subAgents.model ?? config.agent.model;

		// 9. Build agent task + launch config
		const agentTask = {
			task: args.task,
			role: args.role as "gatherer" | "analyst" | "resolver",
			workspacePath: workspace,
			promptFile,
		};

		const budgetTokens = args["budget-tokens"]
			? Number.parseInt(args["budget-tokens"], 10)
			: undefined;

		const launchConfig = {
			role: args.role as "gatherer" | "analyst" | "resolver",
			task: args.task,
			workspaceDir: workspace,
			model,
			timeout: args.timeout
				? Number.parseInt(args.timeout, 10) * 1000
				: config.subAgents.timeoutMs,
			...(budgetTokens !== undefined ? { budget: budgetTokens } : {}),
		};

		const command = agent.getLaunchCommand(agentTask, launchConfig);

		// 10. Build env
		const env: Record<string, string> = {
			...(agent.getEnvironment?.(launchConfig) ?? {}),
			PL_AGENT_ID: agentId,
			PL_WORKSPACE: workspace,
		};

		// 11. Ensure stdout directory exists
		await mkdir(join(workspace, "stdout"), { recursive: true });

		// 12. Spawn
		const sessionName = process.env["PL_SESSION_NAME"];
		const logFile = join(workspace, "stdout", `${agentId}.log`);

		const handle = await runtime.start({
			command,
			env,
			cwd: workspace,
			timeout: launchConfig.timeout,
			...(runtimeType === "tmux" && sessionName
				? { sessionName, windowName: agentId }
				: { background: true, logFile }),
		});

		// 13. Record in pids.json with process info
		pids[agentId] = {
			role: args.role,
			task: args.task,
			status: "active",
			...(handle.pid > 0 ? { pid: handle.pid } : {}),
			...(handle.sessionName ? { sessionName: handle.sessionName } : {}),
			...(handle.windowName ? { windowName: handle.windowName } : {}),
			spawnedAt: new Date().toISOString(),
		};
		await writeFile(pidsPath, JSON.stringify(pids, null, 2), "utf-8");

		// 14. Record dispatch event in findings.jsonl
		const event = {
			type: "agent_dispatched",
			agentId,
			role: args.role,
			task: args.task,
			timestamp: new Date().toISOString(),
		};
		await appendFile(findingsPath, `${JSON.stringify(event)}\n`, "utf-8");

		// 15. Output agent ID
		console.log(agentId);
	},
});
