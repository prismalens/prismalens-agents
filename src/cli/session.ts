import { defineCommand } from "citty";

export default defineCommand({
	meta: {
		name: "session",
		description: "Manage investigation sessions",
	},
	subCommands: {
		list: () => import("./session/list.js").then((m) => m.default),
		show: () => import("./session/show.js").then((m) => m.default),
		kill: () => import("./session/kill.js").then((m) => m.default),
		cleanup: () => import("./session/cleanup.js").then((m) => m.default),
	},
	run() {
		console.log("Usage: pl session <list|show|kill|cleanup>");
	},
});
