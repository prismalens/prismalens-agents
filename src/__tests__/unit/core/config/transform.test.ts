import { describe, expect, it } from "vitest";
import { snakeToCamelCase } from "../../../../core/config/transform.js";

describe("snakeToCamelCase", () => {
	it("converts snake_case keys to camelCase", () => {
		expect(snakeToCamelCase({ timeout_ms: 1000 })).toEqual({
			timeoutMs: 1000,
		});
	});

	it("converts nested objects recursively", () => {
		const input = {
			max_concurrent_sub_agents: 3,
			agent: {
				shell_allow_list: ["pl"],
				timeout_ms: 1800000,
			},
		};
		expect(snakeToCamelCase(input)).toEqual({
			maxConcurrentSubAgents: 3,
			agent: {
				shellAllowList: ["pl"],
				timeoutMs: 1800000,
			},
		});
	});

	it("converts arrays of objects", () => {
		const input = [{ max_retries: 2 }, { stall_timeout_ms: 120000 }];
		expect(snakeToCamelCase(input)).toEqual([
			{ maxRetries: 2 },
			{ stallTimeoutMs: 120000 },
		]);
	});

	it("passes non-object values through unchanged", () => {
		expect(snakeToCamelCase("hello")).toBe("hello");
		expect(snakeToCamelCase(42)).toBe(42);
		expect(snakeToCamelCase(true)).toBe(true);
		expect(snakeToCamelCase(null)).toBeNull();
	});

	it("handles keys without underscores", () => {
		expect(snakeToCamelCase({ repo: "org/repo" })).toEqual({
			repo: "org/repo",
		});
	});

	it("handles empty objects", () => {
		expect(snakeToCamelCase({})).toEqual({});
	});

	it("handles arrays of primitives unchanged", () => {
		expect(snakeToCamelCase(["pl", "gh", "curl"])).toEqual([
			"pl",
			"gh",
			"curl",
		]);
	});
});
