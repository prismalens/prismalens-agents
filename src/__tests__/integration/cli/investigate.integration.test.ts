import { resolve } from "node:path";
import { x } from "tinyexec";
import { describe, expect, it } from "vitest";

const tsx = resolve("node_modules", ".bin", "tsx");

describe("pl investigate (integration)", () => {
	it("--dry-run prints InvestigationContext JSON", async () => {
		const result = await x(tsx, [
			"bin/pl.ts",
			"investigate",
			"-q",
			"TestQuery",
			"--dry-run",
		]);
		const output = result.stdout.trim();

		const parsed = JSON.parse(output) as Record<string, unknown>;
		expect(parsed["investigationId"]).toBeDefined();
		expect(parsed["triggerType"]).toBe("query");
		expect(parsed["query"]).toBe("TestQuery");
	});

	it("--dry-run with --repo includes repo in context", async () => {
		const result = await x(tsx, [
			"bin/pl.ts",
			"investigate",
			"-q",
			"Test",
			"--repo",
			"org/my-app",
			"--dry-run",
		]);
		const parsed = JSON.parse(result.stdout.trim()) as Record<string, unknown>;

		expect(parsed["repo"]).toBeDefined();
		const repo = parsed["repo"] as Record<string, unknown>;
		expect(repo["url"]).toBe("org/my-app");
	});
});
