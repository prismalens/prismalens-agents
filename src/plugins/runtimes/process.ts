import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import type {
	RuntimeHandle,
	RuntimePlugin,
	RuntimeStartConfig,
} from "../../types/plugins.js";

export class ProcessRuntime implements RuntimePlugin {
	async start(config: RuntimeStartConfig): Promise<RuntimeHandle> {
		const [cmd, ...args] = config.command;
		if (!cmd) {
			throw new Error("RuntimeStartConfig.command must not be empty");
		}

		if (config.background) {
			return this.startBackground(cmd, args, config);
		}

		const child = spawn(cmd, args, {
			cwd: config.cwd,
			env: { ...process.env, ...config.env },
			stdio: "inherit",
		});

		const pid = child.pid ?? -1;

		let exited = false;
		let resolvedExitCode = 1;

		const exitPromise = new Promise<{ exitCode: number }>((resolve) => {
			child.on("exit", (code) => {
				exited = true;
				resolvedExitCode = code ?? 1;
				resolve({ exitCode: resolvedExitCode });
			});
			child.on("error", () => {
				exited = true;
				resolve({ exitCode: 1 });
			});
		});

		if (config.timeout) {
			setTimeout(() => {
				if (!exited) {
					child.kill("SIGTERM");
				}
			}, config.timeout);
		}

		return {
			pid,
			kill() {
				if (!exited) {
					child.kill("SIGTERM");
					setTimeout(() => {
						if (!exited) {
							child.kill("SIGKILL");
						}
					}, 5_000);
				}
			},
			isRunning() {
				if (exited) return false;
				try {
					process.kill(pid, 0);
					return true;
				} catch {
					return false;
				}
			},
			waitForExit() {
				return exitPromise;
			},
		};
	}

	private startBackground(
		cmd: string,
		args: string[],
		config: RuntimeStartConfig,
	): RuntimeHandle {
		const logFd = config.logFile ? openSync(config.logFile, "a") : null;
		const outStream = logFd !== null ? logFd : "ignore";

		const child = spawn(cmd, args, {
			cwd: config.cwd,
			env: { ...process.env, ...config.env },
			stdio: ["ignore", outStream, outStream],
			detached: true,
		});

		const pid = child.pid ?? -1;
		child.unref();

		// Close parent's copy of the FD — child inherited its own copy via spawn
		if (logFd !== null) {
			closeSync(logFd);
		}

		return {
			pid,
			kill() {
				try {
					process.kill(pid, "SIGTERM");
				} catch {
					// already dead
				}
			},
			isRunning() {
				try {
					process.kill(pid, 0);
					return true;
				} catch {
					return false;
				}
			},
			waitForExit() {
				return Promise.resolve({ exitCode: -1 });
			},
		};
	}

	async stop(handle: RuntimeHandle): Promise<void> {
		handle.kill();
		await handle.waitForExit();
	}

	async isAvailable(): Promise<boolean> {
		return true;
	}
}
