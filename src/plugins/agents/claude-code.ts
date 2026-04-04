import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { checkCommand } from "../../core/check-tool.js";
import type { PlConfig } from "../../core/config/index.js";
import { buildAllowList } from "../../core/prompt-builder.js";
import type { Finding } from "../../types/findings.js";
import type {
	AgentLaunchConfig,
	AgentOutput,
	AgentPlugin,
	AgentTask,
} from "../../types/plugins.js";

export class ClaudeCodeAgent implements AgentPlugin {
	readonly name = "claude-code";
	readonly processName = "claude";

	private config: PlConfig | undefined;

	setConfig(config: PlConfig): void {
		this.config = config;
	}

	getLaunchCommand(task: AgentTask, config: AgentLaunchConfig): string[] {
		const promptFile = task.promptFile ?? ".prompt.md";
		const cmd = [
			"claude",
			"-p",
			task.task,
			"--append-system-prompt-file",
			join(task.workspacePath, promptFile),
		];

		if (this.config) {
			const allowList = buildAllowList(this.config, "claude");
			cmd.push("--allowedTools", allowList);
		}

		if (config.model) {
			cmd.push("--model", config.model);
		}

		return cmd;
	}

	getEnvironment(config: AgentLaunchConfig): Record<string, string> {
		return {
			PL_AGENT_ID:
				config.role === "orchestrator"
					? "orchestrator"
					: `agent-${config.role}`,
			PL_INVESTIGATION_ID: config.workspaceDir.split("/").pop() ?? "",
			PL_WORKSPACE: config.workspaceDir,
			...(process.env["PL_SESSION_NAME"]
				? { PL_SESSION_NAME: process.env["PL_SESSION_NAME"] }
				: {}),
			...(process.env["PL_RUNTIME"]
				? { PL_RUNTIME: process.env["PL_RUNTIME"] }
				: {}),
		};
	}

	async parseOutput(dir: string): Promise<AgentOutput> {
		const findingsPath = join(dir, "findings.jsonl");
		const findings: Finding[] = [];
		let rootCause: string | undefined;
		let confidence: number | undefined;

		try {
			const content = await readFile(findingsPath, "utf-8");
			for (const line of content.split("\n")) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				try {
					const event = JSON.parse(trimmed) as Record<string, unknown>;
					if (event["type"] === "finding") {
						findings.push(event as unknown as Finding);
					} else if (event["type"] === "complete") {
						rootCause = event["rootCause"] as string;
						confidence = event["confidence"] as number;
					}
				} catch {
					// skip malformed lines
				}
			}
		} catch {
			// findings.jsonl may not exist yet
		}

		const output: AgentOutput = {
			findings,
			status: rootCause ? "completed" : "error",
			stdout: "",
			exitCode: rootCause ? 0 : 1,
			durationMs: 0,
		};
		if (rootCause) {
			output.result = {
				rootCause,
				...(confidence !== undefined ? { confidence } : {}),
			};
		}
		return output;
	}

	async isAvailable(): Promise<boolean> {
		const result = await checkCommand("claude");
		return result.available;
	}
}
