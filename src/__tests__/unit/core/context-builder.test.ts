import { describe, expect, it } from "vitest";
import { buildContext } from "../../../core/context-builder.js";
import type { PreCheckResult } from "../../../core/pre-check.js";

const emptyPreCheck: PreCheckResult = {
	configuredSources: [],
	availableTools: [],
};

describe("buildContext", () => {
	it("generates an 8-char investigationId", () => {
		const ctx = buildContext({ preCheck: emptyPreCheck });
		expect(ctx.investigationId).toMatch(/^[a-f0-9]{8}$/);
	});

	it("sets triggerType to query when query provided", () => {
		const ctx = buildContext({
			query: "HighErrorRate",
			preCheck: emptyPreCheck,
		});
		expect(ctx.triggerType).toBe("query");
		expect(ctx.query).toBe("HighErrorRate");
	});

	it("sets triggerType to piped_payload when stdin provided", () => {
		const ctx = buildContext({
			pipedPayload: { alert: "test" },
			preCheck: emptyPreCheck,
		});
		expect(ctx.triggerType).toBe("piped_payload");
		expect(ctx.pipedPayload).toEqual({ alert: "test" });
	});

	it("sets triggerType to discover when neither query nor stdin", () => {
		const ctx = buildContext({ preCheck: emptyPreCheck });
		expect(ctx.triggerType).toBe("discover");
	});

	it("query takes precedence over piped_payload for triggerType", () => {
		const ctx = buildContext({
			query: "test",
			pipedPayload: { alert: "test" },
			preCheck: emptyPreCheck,
		});
		expect(ctx.triggerType).toBe("query");
	});

	it("resolves org/repo as remote URL", () => {
		const ctx = buildContext({
			repo: "org/payment-api",
			preCheck: emptyPreCheck,
		});
		expect(ctx.repo?.url).toBe("org/payment-api");
		expect(ctx.repo?.localPath).toBeUndefined();
	});

	it("resolves local path with localPath set", () => {
		const ctx = buildContext({
			repo: "/home/user/code/api",
			preCheck: emptyPreCheck,
		});
		expect(ctx.repo?.url).toBe("/home/user/code/api");
		expect(ctx.repo?.localPath).toBe("/home/user/code/api");
	});

	it("resolves ~ path as local", () => {
		const ctx = buildContext({ repo: "~/code/api", preCheck: emptyPreCheck });
		expect(ctx.repo?.localPath).toBe("~/code/api");
	});

	it("omits repo when not provided", () => {
		const ctx = buildContext({ preCheck: emptyPreCheck });
		expect(ctx.repo).toBeUndefined();
	});

	it("populates configuredSources from preCheck", () => {
		const preCheck: PreCheckResult = {
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
		const ctx = buildContext({ preCheck });
		expect(ctx.configuredSources).toHaveLength(1);
		expect(ctx.availableTools).toHaveLength(1);
	});

	it("sets createdAt to ISO timestamp", () => {
		const ctx = buildContext({ preCheck: emptyPreCheck });
		expect(ctx.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});
});
