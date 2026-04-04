import { x } from "tinyexec";
import { checkCommand } from "../../core/check-tool.js";
import type {
	RuntimeHandle,
	RuntimePlugin,
	RuntimeStartConfig,
} from "../../types/plugins.js";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional — stripping dangerous control chars for shell safety
const CONTROL_CHARS_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x1b\x7f]/g;

/** Escape a value for safe use in a shell env-prefix (KEY='value') */
function shellEscape(value: string): string {
	// Strip control characters that could break tmux send-keys or
	// enable terminal escape injection, then single-quote for shell safety
	const safe = value
		.replace(CONTROL_CHARS_RE, "")
		.replace(/\r/g, "")
		.replace(/\n/g, "\\n");
	return `'${safe.replace(/'/g, "'\\''")}'`;
}

const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Build a KEY=val prefix string for passing env vars to a tmux command */
function buildEnvPrefix(env: Record<string, string>): string {
	return Object.entries(env)
		.filter(([k]) => ENV_KEY_RE.test(k))
		.map(([k, v]) => `${k}=${shellEscape(v)}`)
		.join(" ");
}

export class TmuxRuntime implements RuntimePlugin {
	async start(config: RuntimeStartConfig): Promise<RuntimeHandle> {
		const rawCommand = config.command.map((arg) => shellEscape(arg)).join(" ");
		const envPrefix = buildEnvPrefix(config.env ?? {});
		const command = envPrefix ? `${envPrefix} ${rawCommand}` : rawCommand;
		const windowName = config.windowName ?? "agent";

		const sessionName =
			config.sessionName ?? `pl-${crypto.randomUUID().slice(0, 8)}`;

		if (config.sessionName) {
			// Add window to existing session
			await x("tmux", [
				"new-window",
				"-t",
				sessionName,
				"-n",
				windowName,
				command,
			]);
		} else {
			// Create new session with this as the first window
			await x("tmux", [
				"new-session",
				"-d",
				"-s",
				sessionName,
				"-n",
				windowName,
				command,
			]);
		}

		let alive = true;

		const handle: RuntimeHandle = {
			pid: -1,
			sessionName,
			windowName,
			kill() {
				alive = false;
				void (async () => {
					try {
						await x("tmux", [
							"kill-window",
							"-t",
							`${sessionName}:${windowName}`,
						]);
					} catch {
						// Window may already be gone
					}
				})();
			},
			isRunning() {
				return alive;
			},
			async waitForExit() {
				// Poll until window is gone.
				// tmux does not expose process exit codes — returns -1 as sentinel.
				while (true) {
					try {
						const result = await x("tmux", [
							"list-windows",
							"-t",
							sessionName,
							"-F",
							"#{window_name}",
						]);
						const windows = result.stdout.trim().split("\n").filter(Boolean);
						if (!windows.includes(windowName)) {
							alive = false;
							return { exitCode: -1 };
						}
					} catch {
						// Session gone entirely
						alive = false;
						return { exitCode: -1 };
					}
					await sleep(1_000);
				}
			},
		};

		return handle;
	}

	async stop(handle: RuntimeHandle): Promise<void> {
		if (handle.sessionName && handle.windowName) {
			try {
				await x("tmux", [
					"kill-window",
					"-t",
					`${handle.sessionName}:${handle.windowName}`,
				]);
			} catch {
				// Window may already be gone
			}
		}
	}

	async isAvailable(): Promise<boolean> {
		const result = await checkCommand("tmux");
		return result.available;
	}
}

/**
 * Create a new tmux session for an investigation.
 * The first window is the timeline view.
 */
export async function createTmuxSession(
	sessionName: string,
	firstWindowName = "timeline",
): Promise<void> {
	await x("tmux", [
		"new-session",
		"-d",
		"-s",
		sessionName,
		"-n",
		firstWindowName,
	]);
}

/**
 * Kill an entire tmux session (all windows).
 */
export async function killTmuxSession(sessionName: string): Promise<void> {
	try {
		await x("tmux", ["kill-session", "-t", sessionName]);
	} catch {
		// Session may already be gone
	}
}

/**
 * Check if a tmux session exists.
 */
export async function hasTmuxSession(sessionName: string): Promise<boolean> {
	try {
		const result = await x("tmux", ["has-session", "-t", sessionName]);
		return result.exitCode === 0;
	} catch {
		return false;
	}
}
