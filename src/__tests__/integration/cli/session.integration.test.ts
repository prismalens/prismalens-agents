import { resolve } from "node:path";
import { x } from "tinyexec";
import { describe, expect, it } from "vitest";

const tsx = resolve("node_modules", ".bin", "tsx");

describe("pl session (integration)", () => {
	it("list --json returns empty array when no sessions", async () => {
		const result = await x(tsx, ["bin/pl.ts", "session", "list", "--json"]);
		const output = result.stdout.trim();

		expect(output).toContain("[]");
	});
});
