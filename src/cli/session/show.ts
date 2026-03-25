import { defineCommand } from "citty";
import consola from "consola";
import { createSessionManager } from "../../core/session-manager.js";

export default defineCommand({
	meta: { name: "show", description: "Show session details" },
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

		consola.log("");
		consola.log(`  Session:    ${session.sessionId}`);
		consola.log(`  Status:     ${session.status}`);
		consola.log(`  Backend:    ${session.agentBackend}`);
		consola.log(`  Runtime:    ${session.runtime}`);
		consola.log(`  Workspace:  ${session.workspacePath}`);
		consola.log(`  Process:    ${session.processRef}`);
		if (session.repo) consola.log(`  Repo:       ${session.repo}`);
		if (session.query) consola.log(`  Query:      ${session.query}`);
		consola.log(`  Started:    ${session.startedAt}`);
		consola.log(`  Updated:    ${session.updatedAt}`);
		if (session.completedAt)
			consola.log(`  Completed:  ${session.completedAt}`);
		if (session.exitCode !== undefined)
			consola.log(`  Exit code:  ${session.exitCode}`);
		consola.log("");
	},
});
