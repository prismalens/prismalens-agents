import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DefaultWorkspace } from "../../../plugins/workspaces/default.js";

describe("DefaultWorkspace", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "pl-workspace-test-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("creates workspace directory structure", async () => {
		const workspace = new DefaultWorkspace(tempDir);
		const handle = await workspace.create("inv-test-001");

		expect(existsSync(join(handle.path, "findings.jsonl"))).toBe(true);
		expect(existsSync(join(handle.path, "pids.json"))).toBe(true);
		expect(existsSync(join(handle.path, "stdout"))).toBe(true);
	});

	it("cleanup immediate removes workspace", async () => {
		const workspace = new DefaultWorkspace(tempDir);
		const handle = await workspace.create("inv-test-002");

		expect(existsSync(handle.path)).toBe(true);
	});

	it("getPath returns handle path", () => {
		const workspace = new DefaultWorkspace(tempDir);
		const handle = { investigationId: "inv-test", path: "/some/path" };
		expect(workspace.getPath(handle)).toBe("/some/path");
	});

	it("initializes findings.jsonl as empty", async () => {
		const workspace = new DefaultWorkspace(tempDir);
		const handle = await workspace.create("inv-test-004");

		const content = await readFile(
			join(handle.path, "findings.jsonl"),
			"utf-8",
		);
		expect(content).toBe("");
	});

	it("initializes pids.json as empty object", async () => {
		const workspace = new DefaultWorkspace(tempDir);
		const handle = await workspace.create("inv-test-005");

		const content = await readFile(join(handle.path, "pids.json"), "utf-8");
		expect(JSON.parse(content)).toEqual({});
	});
});
