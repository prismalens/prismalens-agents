import { defineCommand } from "citty";
import consola from "consola";
import { createSessionManager } from "../../core/session-manager.js";

export default defineCommand({
	meta: { name: "list", description: "List investigation sessions" },
	args: {
		all: {
			type: "boolean",
			description: "Include completed/errored sessions",
		},
		active: {
			type: "boolean",
			description: "Only running investigations",
			default: true,
		},
		json: { type: "boolean", description: "JSON output" },
	},
	async run({ args }) {
		const sessionManager = createSessionManager();
		const activeStatuses = [
			"spawning",
			"gathering",
			"analyzing",
			"resolving",
		] as const;

		const sessions = args.all
			? await sessionManager.list()
			: await sessionManager.list({ status: [...activeStatuses] });

		if (args.json) {
			// JSON output — no formatting, machine-parseable
			console.log(JSON.stringify(sessions, null, 2));
			return;
		}

		if (sessions.length === 0) {
			consola.info(args.all ? "No sessions found" : "No active investigations");
			return;
		}

		// Group by project
		const byProject = new Map<string, typeof sessions>();
		for (const s of sessions) {
			const key = s.projectKey ?? "unknown";
			const group = byProject.get(key) ?? [];
			group.push(s);
			byProject.set(key, group);
		}

		for (const [projectKey, projectSessions] of byProject) {
			// Show last segment of project key as display name
			const displayName = projectKey.split("-").slice(-1)[0] ?? projectKey;
			consola.log(`\n  ${displayName}`);
			for (const s of projectSessions) {
				const age = Date.now() - new Date(s.startedAt).getTime();
				const mins = Math.floor(age / 60_000);
				const label = s.label ? `"${s.label}"` : "";
				consola.log(
					`    ${s.sessionId}  ${s.status.padEnd(10)}  ${label.padEnd(35)}  ${mins}m ago`,
				);
			}
		}

		const active = sessions.filter(
			(s) => !["done", "errored", "timeout", "stalled"].includes(s.status),
		);
		consola.log(
			`\n  ${sessions.length} session(s)${active.length > 0 ? ` (${active.length} active)` : ""}`,
		);
	},
});
