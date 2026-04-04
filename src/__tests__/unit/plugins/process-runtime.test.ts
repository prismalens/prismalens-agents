import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProcessRuntime } from "../../../plugins/runtimes/process.js";

describe("ProcessRuntime", () => {
	it("isAvailable returns true", async () => {
		const runtime = new ProcessRuntime();
		expect(await runtime.isAvailable()).toBe(true);
	});

	it("starts a process and waits for exit", async () => {
		const runtime = new ProcessRuntime();
		const handle = await runtime.start({
			command: ["node", "-e", "process.exit(0)"],
			env: {},
			cwd: process.cwd(),
		});

		expect(handle.pid).toBeGreaterThan(0);
		const result = await handle.waitForExit();
		expect(result.exitCode).toBe(0);
	});

	it("reports non-zero exit code", async () => {
		const runtime = new ProcessRuntime();
		const handle = await runtime.start({
			command: ["node", "-e", "process.exit(42)"],
			env: {},
			cwd: process.cwd(),
		});

		const result = await handle.waitForExit();
		expect(result.exitCode).toBe(42);
	});

	it("stop kills a running process", async () => {
		const runtime = new ProcessRuntime();
		const handle = await runtime.start({
			command: ["node", "-e", "setTimeout(() => {}, 60000)"],
			env: {},
			cwd: process.cwd(),
		});

		expect(handle.pid).toBeGreaterThan(0);
		await runtime.stop(handle);
		const result = await handle.waitForExit();
		expect(result.exitCode).not.toBe(0);
	});

	describe("background mode", () => {
		const logFile = join(tmpdir(), `pl-test-bg-${Date.now()}.log`);

		afterEach(() => {
			try {
				unlinkSync(logFile);
			} catch {
				// may not exist
			}
		});

		it("spawns detached and returns immediately", async () => {
			const runtime = new ProcessRuntime();
			const handle = await runtime.start({
				command: ["node", "-e", "console.log('hello-bg'); process.exit(0)"],
				env: {},
				cwd: process.cwd(),
				background: true,
				logFile,
			});

			expect(handle.pid).toBeGreaterThan(0);

			// waitForExit resolves immediately with sentinel -1
			const result = await handle.waitForExit();
			expect(result.exitCode).toBe(-1);
		});

		it("captures stdout to logFile", async () => {
			const runtime = new ProcessRuntime();
			await runtime.start({
				command: [
					"node",
					"-e",
					"console.log('captured-output'); process.exit(0)",
				],
				env: {},
				cwd: process.cwd(),
				background: true,
				logFile,
			});

			// Give the background process a moment to write
			await new Promise((r) => setTimeout(r, 500));

			expect(existsSync(logFile)).toBe(true);
			const content = readFileSync(logFile, "utf-8");
			expect(content).toContain("captured-output");
		});

		it("passes environment variables to background process", async () => {
			const runtime = new ProcessRuntime();
			await runtime.start({
				command: [
					"node",
					"-e",
					"console.log(process.env.TEST_BG_VAR); process.exit(0)",
				],
				env: { TEST_BG_VAR: "bg-value-123" },
				cwd: process.cwd(),
				background: true,
				logFile,
			});

			await new Promise((r) => setTimeout(r, 500));

			const content = readFileSync(logFile, "utf-8");
			expect(content).toContain("bg-value-123");
		});

		it("works without logFile (ignore mode)", async () => {
			const runtime = new ProcessRuntime();
			const handle = await runtime.start({
				command: ["node", "-e", "process.exit(0)"],
				env: {},
				cwd: process.cwd(),
				background: true,
			});

			expect(handle.pid).toBeGreaterThan(0);
			const result = await handle.waitForExit();
			expect(result.exitCode).toBe(-1);
		});
	});
});
