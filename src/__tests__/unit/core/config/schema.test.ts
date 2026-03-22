import { describe, expect, it } from "vitest";
import {
	AgentConfigSchema,
	BudgetConfigSchema,
	LoggingConfigSchema,
	PlConfigSchema,
} from "../../../../core/config/schema.js";

describe("PlConfigSchema", () => {
	it("accepts minimal config with just repo", () => {
		const result = PlConfigSchema.parse({ repo: "org/repo" });
		expect(result.repo).toBe("org/repo");
	});

	it("accepts empty config and applies all defaults", () => {
		const result = PlConfigSchema.parse({});
		expect(result.agent.default).toBe("deepagents-cli");
		expect(result.agent.model).toBe("claude-sonnet-4-5");
		expect(result.agent.timeout_ms).toBe(1_800_000);
		expect(result.budget.tokens).toBe(500_000);
		expect(result.budget.max_concurrent_sub_agents).toBe(3);
		expect(result.logging.level).toBe("info");
		expect(result.logging.format).toBe("json");
		expect(result.plugins.runtime).toBe("tmux");
		expect(result.convergence.confidence_threshold).toBe(0.8);
		expect(result.workspace.base_dir).toBe("~/.prismalens/investigations");
	});

	it("rejects invalid agent backend enum", () => {
		expect(() =>
			PlConfigSchema.parse({ agent: { default: "invalid-agent" } }),
		).toThrow();
	});

	it("rejects negative timeout", () => {
		expect(() =>
			PlConfigSchema.parse({ budget: { timeout_ms: -1 } }),
		).toThrow();
	});

	it("rejects max_concurrent_sub_agents above 10", () => {
		expect(() =>
			PlConfigSchema.parse({ budget: { max_concurrent_sub_agents: 11 } }),
		).toThrow();
	});

	it("applies partial overrides while keeping other defaults", () => {
		const result = PlConfigSchema.parse({
			agent: { model: "gpt-4o" },
			logging: { level: "debug" },
		});
		expect(result.agent.model).toBe("gpt-4o");
		expect(result.agent.default).toBe("deepagents-cli"); // default preserved
		expect(result.logging.level).toBe("debug");
		expect(result.logging.format).toBe("json"); // default preserved
	});

	it("handles repos map correctly", () => {
		const result = PlConfigSchema.parse({
			repos: {
				"payment-api": { repo: "org/payment-api" },
			},
		});
		expect(result.repos["payment-api"]?.repo).toBe("org/payment-api");
		expect(result.repos["payment-api"]?.local_path).toBeNull();
	});

	it("handles alert_sources as record of records", () => {
		const result = PlConfigSchema.parse({
			alert_sources: {
				alertmanager: { url: "http://localhost:9093" },
				sentry: { org: "my-org", project: "my-project" },
			},
		});
		expect(result.alert_sources.alertmanager?.url).toBe(
			"http://localhost:9093",
		);
	});
});

describe("AgentConfigSchema", () => {
	it("applies all defaults for empty input", () => {
		const result = AgentConfigSchema.parse({});
		expect(result.default).toBe("deepagents-cli");
		expect(result.shell_allow_list).toContain("pl");
		expect(result.shell_allow_list).toContain("curl");
	});

	it("accepts valid permissions enum", () => {
		const result = AgentConfigSchema.parse({ permissions: "permissionless" });
		expect(result.permissions).toBe("permissionless");
	});
});

describe("BudgetConfigSchema", () => {
	it("applies defaults", () => {
		const result = BudgetConfigSchema.parse({});
		expect(result.max_retries).toBe(2);
		expect(result.max_total_sub_agents).toBe(10);
	});

	it("rejects max_retries above 5", () => {
		expect(() => BudgetConfigSchema.parse({ max_retries: 6 })).toThrow();
	});
});

describe("LoggingConfigSchema", () => {
	it("rejects invalid log level", () => {
		expect(() => LoggingConfigSchema.parse({ level: "verbose" })).toThrow();
	});
});
