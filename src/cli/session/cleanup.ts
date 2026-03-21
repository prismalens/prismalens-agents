import { defineCommand } from "citty";

export default defineCommand({
	meta: { name: "cleanup", description: "Cleanup completed/orphaned sessions" },
	args: {
		all: {
			type: "boolean",
			description: "Remove all session records + workspaces",
		},
		"older-than": {
			type: "string",
			description: "Remove sessions older than duration (e.g., 24h, 7d)",
		},
	},
	run({ args }) {
		console.log("pl session cleanup is not yet implemented");
		console.log("args:", args);
	},
});
