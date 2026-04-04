import { describe, expect, it, vi } from "vitest";
import { TmuxRuntime } from "../../../plugins/runtimes/tmux.js";

// Mock tinyexec to avoid requiring real tmux
vi.mock("tinyexec", () => ({
	x: vi.fn().mockImplementation((cmd: string, args?: string[]) => {
		if (cmd === "which" && args?.[0] === "tmux") {
			return Promise.resolve({ exitCode: 0, stdout: "/usr/bin/tmux\n" });
		}
		if (cmd === "tmux" && args?.[0] === "--version") {
			return Promise.resolve({ exitCode: 0, stdout: "tmux 3.4\n" });
		}
		if (cmd === "tmux" && args?.[0] === "new-window") {
			return Promise.resolve({ exitCode: 0, stdout: "" });
		}
		if (cmd === "tmux" && args?.[0] === "kill-window") {
			return Promise.resolve({ exitCode: 0, stdout: "" });
		}
		if (cmd === "tmux" && args?.[0] === "has-session") {
			return Promise.resolve({ exitCode: 0, stdout: "" });
		}
		return Promise.resolve({ exitCode: 0, stdout: "" });
	}),
}));

describe("TmuxRuntime", () => {
	it("isAvailable returns true when tmux is installed", async () => {
		const runtime = new TmuxRuntime();
		expect(await runtime.isAvailable()).toBe(true);
	});

	it("start without sessionName auto-creates session via new-session", async () => {
		const { x } = await import("tinyexec");
		const runtime = new TmuxRuntime();

		const handle = await runtime.start({
			command: ["echo", "hello"],
			env: {},
			cwd: "/tmp",
			windowName: "orchestrator",
		});

		expect(handle.sessionName).toBeDefined();
		expect(x).toHaveBeenCalledWith(
			"tmux",
			expect.arrayContaining(["new-session"]),
		);
	});

	it("start with sessionName calls tmux new-window", async () => {
		const { x } = await import("tinyexec");
		const runtime = new TmuxRuntime();

		const handle = await runtime.start({
			command: ["echo", "hello"],
			env: {},
			cwd: "/tmp",
			sessionName: "pl-inv-test",
			windowName: "gatherer-1",
		});

		expect(handle.sessionName).toBe("pl-inv-test");
		expect(handle.windowName).toBe("gatherer-1");
		expect(x).toHaveBeenCalledWith("tmux", [
			"new-window",
			"-t",
			"pl-inv-test",
			"-n",
			"gatherer-1",
			"'echo' 'hello'",
		]);
	});

	it("stop calls tmux kill-window", async () => {
		const { x } = await import("tinyexec");
		const runtime = new TmuxRuntime();

		await runtime.stop({
			pid: -1,
			sessionName: "pl-inv-test",
			windowName: "gatherer-1",
			kill() {},
			isRunning() {
				return false;
			},
			async waitForExit() {
				return { exitCode: 0 };
			},
		});

		expect(x).toHaveBeenCalledWith("tmux", [
			"kill-window",
			"-t",
			"pl-inv-test:gatherer-1",
		]);
	});
});
