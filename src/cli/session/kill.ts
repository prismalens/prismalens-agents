import { defineCommand } from "citty";
import consola from "consola";
import { createSessionManager } from "../../core/session-manager.js";
import {
	hasTmuxSession,
	killTmuxSession,
} from "../../plugins/runtimes/tmux.js";

export default defineCommand({
	meta: { name: "kill", description: "Kill a running investigation" },
	args: {
		_: { type: "positional", description: "Session ID" },
	},
	async run({ args }) {
		const sessionId = String(args._);
		const sessionManager = createSessionManager();
		const session = await sessionManager.get(sessionId);

		if (!session) {
			consola.error(`Session "${sessionId}" not found`);
			process.exit(1);
		}

		if (session.runtime === "tmux") {
			const sessionName = String(session.processRef);
			await killTmuxSession(sessionName);
			const stillAlive = await hasTmuxSession(sessionName);
			if (stillAlive) {
				consola.warn(`tmux session ${sessionName} may still be running`);
			} else {
				consola.success(`Killed tmux session: ${sessionName}`);
			}
		} else {
			const pid =
				typeof session.processRef === "number"
					? session.processRef
					: Number.parseInt(String(session.processRef), 10);
			try {
				process.kill(pid, "SIGTERM");
				consola.success(`Sent SIGTERM to process ${pid}`);
			} catch {
				consola.warn(`Process ${pid} already exited`);
			}
		}

		await sessionManager.update(sessionId, {
			status: "done",
			updatedAt: new Date().toISOString(),
			completedAt: new Date().toISOString(),
		});
		consola.info("Session stopped. Workspace preserved.");
	},
});
