import { describe, expect, it, vi } from "vitest";
import type { PlConfig } from "../../../core/config/index.js";
import { ClaudeCodeAgent } from "../../../plugins/agents/claude-code.js";

vi.mock("../../../core/check-tool.js", () => ({
	checkCommand: vi
		.fn()
		.mockResolvedValue({ available: true, version: "2.1.81" }),
}));

function makeConfig(): PlConfig {
	return {
		agent: {
			default: "claude-code",
			model: "claude-sonnet-4-5",
			timeoutMs: 1800000,
			permissions: "default",
			shellAllowList: ["pl", "curl", "jq"],
		},
		subAgents: { timeoutMs: 120000 },
		investigation: { maxConcurrent: 3 },
		budget: {
			tokens: 500000,
			timeoutMs: 1800000,
			maxConcurrentSubAgents: 3,
			maxTotalSubAgents: 10,
			maxRetries: 2,
		},
		workspace: { baseDir: "~/.prismalens" },
		plugins: { runtime: "tmux", reporter: "file-watching", notifier: [] },
		alertSources: {},
		convergence: {
			confidenceThreshold: 0.8,
			maxNoNewInfoRounds: 3,
			stallDetectionWindow: 3,
			stallTimeoutMs: 120000,
		},
		logging: { level: "info", format: "json" },
		repos: {},
	};
}

describe("ClaudeCodeAgent", () => {
	it("getLaunchCommand builds correct flags", () => {
		const agent = new ClaudeCodeAgent();
		agent.setConfig(makeConfig());

		const cmd = agent.getLaunchCommand(
			{
				task: "Investigate error",
				role: "orchestrator",
				workspacePath: "/tmp/ws",
			},
			{
				role: "orchestrator",
				task: "Investigate error",
				workspaceDir: "/tmp/ws",
			},
		);

		expect(cmd[0]).toBe("claude");
		expect(cmd).toContain("-p");
		expect(cmd).toContain("Investigate error");
		expect(cmd).toContain("--append-system-prompt-file");
		expect(cmd).toContain("--allowedTools");
		expect(cmd.join(" ")).toContain("Bash(pl*)");
	});

	it("getEnvironment sets PL_ env vars", () => {
		const agent = new ClaudeCodeAgent();
		const env = agent.getEnvironment({
			role: "orchestrator",
			task: "test",
			workspaceDir: "/tmp/ws/abc123",
		});

		expect(env["PL_AGENT_ID"]).toBe("orchestrator");
		expect(env["PL_WORKSPACE"]).toBe("/tmp/ws/abc123");
		expect(env["PL_INVESTIGATION_ID"]).toBe("abc123");
	});

	it("uses promptFile when provided", () => {
		const agent = new ClaudeCodeAgent();
		agent.setConfig(makeConfig());

		const cmd = agent.getLaunchCommand(
			{
				task: "Sub-agent task",
				role: "gatherer",
				workspacePath: "/tmp/ws",
				promptFile: ".prompt-agent-001.md",
			},
			{
				role: "gatherer",
				task: "Sub-agent task",
				workspaceDir: "/tmp/ws",
			},
		);

		expect(cmd).toContain("--append-system-prompt-file");
		expect(cmd.join(" ")).toContain(".prompt-agent-001.md");
	});

	it("uses default .prompt.md when promptFile not set", () => {
		const agent = new ClaudeCodeAgent();
		agent.setConfig(makeConfig());

		const cmd = agent.getLaunchCommand(
			{
				task: "Orchestrator task",
				role: "orchestrator",
				workspacePath: "/tmp/ws",
			},
			{
				role: "orchestrator",
				task: "Orchestrator task",
				workspaceDir: "/tmp/ws",
			},
		);

		expect(cmd.join(" ")).toContain(".prompt.md");
	});

	it("forwards model from launch config", () => {
		const agent = new ClaudeCodeAgent();
		agent.setConfig(makeConfig());

		const cmd = agent.getLaunchCommand(
			{
				task: "Task",
				role: "gatherer",
				workspacePath: "/tmp/ws",
			},
			{
				role: "gatherer",
				task: "Task",
				workspaceDir: "/tmp/ws",
				model: "claude-haiku-4-5-20251001",
			},
		);

		expect(cmd).toContain("--model");
		expect(cmd).toContain("claude-haiku-4-5-20251001");
	});

	it("isAvailable returns true when claude installed", async () => {
		const agent = new ClaudeCodeAgent();
		expect(await agent.isAvailable()).toBe(true);
	});
});
