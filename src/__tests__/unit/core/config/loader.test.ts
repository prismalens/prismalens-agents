import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// We test loadConfig by creating real temp config files
// rather than mocking fs, since the loader's value is in correct file reading + merging

describe("loadConfig", () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(async () => {
		tempDir = join(tmpdir(), `pl-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		originalCwd = process.cwd();
		process.chdir(tempDir);
	});

	afterEach(async () => {
		process.chdir(originalCwd);
		await rm(tempDir, { recursive: true, force: true });
		delete process.env.PL_LOG_LEVEL;
	});

	async function importLoader() {
		// Dynamic import to get fresh module after chdir
		const mod = await import("../../../../core/config/loader.js");
		return mod.loadConfig;
	}

	it("returns defaults when no config files exist", async () => {
		const loadConfig = await importLoader();
		const config = await loadConfig();
		expect(config.agent.default).toBe("deepagents-cli");
		expect(config.budget.tokens).toBe(500_000);
		expect(config.logging.level).toBe("info");
	});

	it("reads project pl.config.yaml", async () => {
		await writeFile(
			join(tempDir, "pl.config.yaml"),
			"agent:\n  model: gpt-4o\nrepo: org/my-repo\n",
		);
		const loadConfig = await importLoader();
		const config = await loadConfig();
		expect(config.agent.model).toBe("gpt-4o");
		expect(config.repo).toBe("org/my-repo");
		expect(config.agent.default).toBe("deepagents-cli"); // default preserved
	});

	it("applies CLI overrides over config file", async () => {
		await writeFile(
			join(tempDir, "pl.config.yaml"),
			"agent:\n  model: gpt-4o\n",
		);
		const loadConfig = await importLoader();
		const config = await loadConfig({
			cliOverrides: { model: "claude-opus-4-5" },
		});
		expect(config.agent.model).toBe("claude-opus-4-5");
	});

	it("applies --config path override", async () => {
		const overridePath = join(tempDir, "custom.yaml");
		await writeFile(overridePath, "logging:\n  level: debug\n");
		const loadConfig = await importLoader();
		const config = await loadConfig({ configPath: overridePath });
		expect(config.logging.level).toBe("debug");
	});

	it("applies PL_LOG_LEVEL env override", async () => {
		process.env.PL_LOG_LEVEL = "warn";
		// Write an empty config so no stale files interfere
		await writeFile(join(tempDir, "pl.config.yaml"), "{}\n");
		const loadConfig = await importLoader();
		const config = await loadConfig();
		expect(config.logging.level).toBe("warn");
	});

	it("transforms output to camelCase", async () => {
		await writeFile(
			join(tempDir, "pl.config.yaml"),
			"budget:\n  max_concurrent_sub_agents: 5\n",
		);
		const loadConfig = await importLoader();
		const config = await loadConfig();
		expect(config.budget.maxConcurrentSubAgents).toBe(5);
		// snake_case key should not exist on frozen object
		expect(
			(config.budget as Record<string, unknown>).max_concurrent_sub_agents,
		).toBeUndefined();
	});

	it("returns a frozen object", async () => {
		const loadConfig = await importLoader();
		const config = await loadConfig();
		expect(Object.isFrozen(config)).toBe(true);
	});

	it("interpolates env vars before validation", async () => {
		process.env.MY_AM_URL = "http://am:9093";
		await writeFile(
			join(tempDir, "pl.config.yaml"),
			"alert_sources:\n  alertmanager:\n    url: ${MY_AM_URL}\n",
		);
		const loadConfig = await importLoader();
		const config = await loadConfig();
		expect(config.alertSources.alertmanager?.url).toBe("http://am:9093");
		delete process.env.MY_AM_URL;
	});

	it("throws on missing env var in config", async () => {
		await writeFile(
			join(tempDir, "pl.config.yaml"),
			"alert_sources:\n  sentry:\n    token: ${NONEXISTENT_TOKEN}\n",
		);
		const loadConfig = await importLoader();
		await expect(loadConfig()).rejects.toThrow("NONEXISTENT_TOKEN");
	});

	it("handles invalid YAML gracefully", async () => {
		await writeFile(join(tempDir, "pl.config.yaml"), "invalid: yaml: :\n:bad");
		const loadConfig = await importLoader();
		await expect(loadConfig()).rejects.toThrow();
	});
});
