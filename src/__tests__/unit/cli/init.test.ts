import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock consola for prompts
const promptResponses: unknown[] = [];
vi.mock("consola", () => ({
	default: {
		log: vi.fn(),
		success: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		prompt: vi.fn().mockImplementation(() => promptResponses.shift()),
	},
}));

// Mock tinyexec
vi.mock("tinyexec", () => ({
	x: vi.fn().mockImplementation((cmd: string, args?: string[]) => {
		if (cmd === "which" && args?.[0] === "claude") {
			return Promise.resolve({ exitCode: 0, stdout: "/usr/bin/claude\n" });
		}
		if (cmd === "which" && args?.[0] === "curl") {
			return Promise.resolve({ exitCode: 0, stdout: "/usr/bin/curl\n" });
		}
		if (cmd === "which") {
			return Promise.reject(new Error("not found"));
		}
		if (args?.[0] === "--version") {
			return Promise.resolve({ exitCode: 0, stdout: `${cmd} v1.0.0\n` });
		}
		if (cmd === "npx" && args?.[0] === "skills") {
			return Promise.resolve({ exitCode: 0, stdout: "" });
		}
		return Promise.resolve({ exitCode: 0, stdout: "" });
	}),
}));

vi.mock("../../../core/doctor-checks.js", () => ({
	runDoctorChecks: vi.fn().mockResolvedValue({
		required: [],
		informational: [],
		allRequiredPassed: true,
	}),
}));

vi.mock("../../../core/config/index.js", () => ({
	loadConfig: vi.fn().mockResolvedValue({
		agent: { default: "claude-code" },
		alertSources: {},
	}),
}));

import consola from "consola";

describe("pl init", () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "pl-init-test-"));
		originalCwd = process.cwd();
		process.chdir(tempDir);
		vi.clearAllMocks();
		promptResponses.length = 0;
	});

	afterEach(async () => {
		process.chdir(originalCwd);
		await rm(tempDir, { recursive: true, force: true });
	});

	it("generates pl.config.yaml with selected options", async () => {
		promptResponses.push(
			"claude-code", // agent backend
			["alertmanager", "sentry"], // alert sources
			"claude-sonnet-4-5", // model
		);

		const mod = await import("../../../cli/init.js");
		await mod.default.run!({ args: { yes: false } } as never);

		const content = await readFile(join(tempDir, "pl.config.yaml"), "utf-8");
		expect(content).toContain("claude-code");
		expect(content).toContain("claude-sonnet-4-5");
		expect(content).toContain("alertmanager");
		expect(content).toContain("sentry");
	});

	it("handles skills installation failure gracefully", async () => {
		const { x } = await import("tinyexec");
		vi.mocked(x).mockImplementation((cmd: string, args?: string[]) => {
			if (cmd === "npx") {
				return Promise.reject(new Error("npx failed")) as never;
			}
			if (cmd === "which" && args?.[0] === "claude") {
				return Promise.resolve({
					exitCode: 0,
					stdout: "/usr/bin/claude\n",
				}) as never;
			}
			if (cmd === "which" && args?.[0] === "curl") {
				return Promise.resolve({
					exitCode: 0,
					stdout: "/usr/bin/curl\n",
				}) as never;
			}
			if (cmd === "which") {
				return Promise.reject(new Error("not found")) as never;
			}
			return Promise.resolve({
				exitCode: 0,
				stdout: `${cmd} v1.0.0\n`,
			}) as never;
		});

		promptResponses.push("claude-code", [], "claude-sonnet-4-5");

		const mod = await import("../../../cli/init.js");
		await mod.default.run!({ args: { yes: false } } as never);

		expect(consola.warn).toHaveBeenCalledWith(
			expect.stringContaining("Skills installation failed"),
		);
	});

	it("asks for overwrite confirmation when config exists", async () => {
		await writeFile(join(tempDir, "pl.config.yaml"), "existing: true\n");

		promptResponses.push(
			"claude-code", // agent
			[], // sources
			"claude-sonnet-4-5", // model
			true, // overwrite confirm
		);

		const mod = await import("../../../cli/init.js");
		await mod.default.run!({ args: { yes: false } } as never);

		expect(consola.prompt).toHaveBeenCalledTimes(4);
	});
});
