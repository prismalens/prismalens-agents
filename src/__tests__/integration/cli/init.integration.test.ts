import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { x } from "tinyexec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const tsx = resolve("node_modules", ".bin", "tsx");
const binPath = resolve("bin/pl.ts");

describe("pl init (integration)", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "pl-init-integration-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("--yes generates pl.config.yaml with default values", async () => {
		await x(tsx, [binPath, "init", "--yes"], {
			nodeOptions: { cwd: tempDir },
			timeout: 60_000,
		});

		const configContent = await readFile(
			join(tempDir, "pl.config.yaml"),
			"utf-8",
		);

		expect(configContent).toMatch(/default:/);
		expect(configContent).toContain("claude-sonnet-4-5");
	}, 60_000);

	it("--yes overwrites existing config without prompting", async () => {
		await writeFile(join(tempDir, "pl.config.yaml"), "repo: old-config\n");

		await x(tsx, [binPath, "init", "--yes"], {
			nodeOptions: { cwd: tempDir },
			timeout: 60_000,
		});

		const configContent = await readFile(
			join(tempDir, "pl.config.yaml"),
			"utf-8",
		);
		expect(configContent).not.toContain("old-config");
		expect(configContent).toContain("claude-sonnet-4-5");
	}, 60_000);

	it("--dry-run does not write config file", async () => {
		await x(tsx, [binPath, "init", "--yes", "--dry-run"], {
			nodeOptions: { cwd: tempDir },
			timeout: 60_000,
		});

		// Should NOT write the file
		expect(existsSync(join(tempDir, "pl.config.yaml"))).toBe(false);
	}, 60_000);

	it("auto-detects repo from git remote", async () => {
		// Set up a git repo with a remote in the temp dir
		await x("git", ["init"], { nodeOptions: { cwd: tempDir } });
		await x(
			"git",
			["remote", "add", "origin", "https://github.com/test-org/test-repo.git"],
			{
				nodeOptions: { cwd: tempDir },
			},
		);

		await x(tsx, [binPath, "init", "--yes"], {
			nodeOptions: { cwd: tempDir },
			timeout: 60_000,
		});

		const configContent = await readFile(
			join(tempDir, "pl.config.yaml"),
			"utf-8",
		);

		expect(configContent).toContain("test-org/test-repo");
	}, 60_000);
});
