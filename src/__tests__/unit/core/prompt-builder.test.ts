import { describe, expect, it } from "vitest";
import type { PlConfig } from "../../../core/config/index.js";
import {
	buildAllowList,
	buildOrchestratorPrompt,
	buildSubAgentPrompt,
} from "../../../core/prompt-builder.js";
import type { InvestigationContext } from "../../../types/investigation.js";

function makeContext(
	overrides?: Partial<InvestigationContext>,
): InvestigationContext {
	return {
		investigationId: "test1234",
		triggerType: "query",
		query: "HighErrorRate",
		configuredSources: [
			{
				type: "alertmanager",
				url: "http://am:9093",
				cliTool: "amtool",
				available: true,
			},
		],
		availableTools: [
			{ name: "curl", available: true },
			{ name: "jq", available: false },
		],
		createdAt: "2026-03-26T10:00:00Z",
		...overrides,
	};
}

function makeConfig(overrides?: Partial<PlConfig>): PlConfig {
	return {
		agent: {
			default: "claude-code",
			model: "claude-sonnet-4-5",
			timeoutMs: 1800000,
			permissions: "default",
			shellAllowList: ["pl", "curl", "jq", "gh"],
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
		...overrides,
	};
}

describe("buildOrchestratorPrompt", () => {
	it("replaces investigationContext placeholder", async () => {
		const ctx = makeContext();
		const prompt = await buildOrchestratorPrompt(ctx, makeConfig());

		expect(prompt).toContain("test1234");
		expect(prompt).toContain("HighErrorRate");
		expect(prompt).not.toContain("{{investigationContext}}");
	});

	it("replaces availableTools placeholder", async () => {
		const ctx = makeContext();
		const prompt = await buildOrchestratorPrompt(ctx, makeConfig());

		expect(prompt).toContain("amtool");
		expect(prompt).toContain("alertmanager");
		expect(prompt).not.toContain("{{availableTools}}");
	});

	it("replaces priorFindings placeholder with empty string", async () => {
		const ctx = makeContext();
		const prompt = await buildOrchestratorPrompt(ctx, makeConfig());

		expect(prompt).not.toContain("{{priorFindings}}");
	});
});

describe("buildSubAgentPrompt", () => {
	it("replaces role and task placeholders", async () => {
		const toolInfo = {
			configuredSources: [
				{
					type: "alertmanager",
					url: "http://am:9093",
					cliTool: "amtool",
					available: true,
				},
			],
			availableTools: [{ name: "curl", available: true }],
		};
		const prompt = await buildSubAgentPrompt(
			"gatherer",
			"Check Alertmanager alerts",
			toolInfo,
			{ parentTask: "Investigate HighErrorRate" },
			[],
		);

		expect(prompt).toContain("gatherer");
		expect(prompt).toContain("Check Alertmanager alerts");
		expect(prompt).not.toContain("{{role}}");
		expect(prompt).not.toContain("{{task}}");
	});

	it("injects lineage and siblings into context", async () => {
		const toolInfo = {
			configuredSources: [],
			availableTools: [],
		};
		const siblings = [
			{
				agentId: "agent-001",
				role: "gatherer",
				task: "Fetch logs",
				status: "active" as const,
			},
		];
		const prompt = await buildSubAgentPrompt(
			"analyst",
			"Analyze logs",
			toolInfo,
			{
				parentTask: "Root cause OOM",
				hypothesis: "OOM after deploy",
				confidence: 0.7,
			},
			siblings,
		);

		expect(prompt).toContain("OOM after deploy");
		expect(prompt).toContain("agent-001");
		expect(prompt).not.toContain("{{context}}");
	});
});

describe("buildAllowList", () => {
	it("formats for claude with Bash() wrapper", () => {
		const config = makeConfig();
		const list = buildAllowList(config, "claude");
		expect(list).toBe("Bash(pl*),Bash(curl*),Bash(jq*),Bash(gh*)");
	});

	it("formats for comma-separated (deepagents)", () => {
		const config = makeConfig();
		const list = buildAllowList(config, "comma");
		expect(list).toBe("pl,curl,jq,gh");
	});
});
