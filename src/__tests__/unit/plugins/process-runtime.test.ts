import { describe, expect, it } from "vitest";
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
});
