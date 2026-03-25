import { resolve } from "node:path";
import { x } from "tinyexec";
import { describe, expect, it } from "vitest";

const tsx = resolve("node_modules", ".bin", "tsx");

describe("pl doctor (integration)", () => {
	it("runs the full citty command chain without crashing", async () => {
		const result = await x(tsx, ["bin/pl.ts", "doctor"]);
		const output = result.stdout + result.stderr;

		// Verify the CLI wiring works: citty routes to doctor command,
		// doctor-checks runs, and output is produced
		expect(output.length).toBeGreaterThan(0);

		// Exit code 0 (all pass) or 1 (required check failed) — not a crash
		expect(result.exitCode).toBeLessThanOrEqual(1);

		// Should mention at least one check result
		expect(output).toMatch(/deepagents|claude|opencode|Node\.js|curl|jq/);
	});
});
