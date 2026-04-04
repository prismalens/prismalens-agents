import { describe, expect, it, vi } from "vitest";

vi.mock("../../../core/check-tool.js", () => ({
	checkCommand: vi.fn(),
}));

import { checkCommand } from "../../../core/check-tool.js";
import type { PlConfig } from "../../../core/config/index.js";
import { runPreCheck } from "../../../core/pre-check.js";

const mockCheckCommand = vi.mocked(checkCommand);

function makeConfig(overrides?: Partial<PlConfig>): PlConfig {
	return {
		agent: {
			default: "claude-code",
			model: "claude-sonnet-4-5",
			timeoutMs: 1800000,
			permissions: "default",
			shellAllowList: ["pl", "curl"],
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

describe("runPreCheck", () => {
	it("throws when agent CLI is missing", async () => {
		mockCheckCommand.mockResolvedValue({ available: false });

		await expect(runPreCheck(makeConfig())).rejects.toThrow("claude");
	});

	it("throws when tmux is missing and configured as runtime", async () => {
		mockCheckCommand.mockImplementation(async (name: string) => {
			if (name === "claude") return { available: true, version: "2.1.81" };
			if (name === "tmux") return { available: false };
			return { available: false };
		});

		await expect(runPreCheck(makeConfig())).rejects.toThrow("tmux");
	});

	it("does not throw when tmux missing but runtime is process", async () => {
		mockCheckCommand.mockImplementation(async (name: string) => {
			if (name === "claude") return { available: true, version: "2.1.81" };
			return { available: false };
		});

		const config = makeConfig({
			plugins: { runtime: "process", reporter: "file-watching", notifier: [] },
		});
		const result = await runPreCheck(config);
		expect(result).toBeDefined();
	});

	it("populates configuredSources from alertSources config", async () => {
		mockCheckCommand.mockImplementation(async (name: string) => {
			if (name === "claude" || name === "tmux" || name === "amtool") {
				return { available: true, version: "1.0" };
			}
			return { available: false };
		});

		const config = makeConfig({
			alertSources: { alertmanager: { url: "http://am:9093" } },
		});

		const result = await runPreCheck(config);
		expect(result.configuredSources).toHaveLength(1);
		expect(result.configuredSources[0]!.type).toBe("alertmanager");
		expect(result.configuredSources[0]!.cliTool).toBe("amtool");
		expect(result.configuredSources[0]!.available).toBe(true);
	});

	it("populates availableTools for common tools", async () => {
		mockCheckCommand.mockImplementation(async (name: string) => {
			if (name === "claude" || name === "tmux" || name === "curl") {
				return { available: true };
			}
			return { available: false };
		});

		const result = await runPreCheck(makeConfig());
		expect(result.availableTools).toHaveLength(3); // curl, jq, gh
		const curlTool = result.availableTools.find((t) => t.name === "curl");
		expect(curlTool?.available).toBe(true);
		const jqTool = result.availableTools.find((t) => t.name === "jq");
		expect(jqTool?.available).toBe(false);
	});
});
