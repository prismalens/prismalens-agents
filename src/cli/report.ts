import { defineCommand } from "citty";

export default defineCommand({
	meta: {
		name: "report",
		description:
			"Report findings, status, completion, or errors (appends to findings.jsonl)",
	},
	subCommands: {
		finding: () => import("./report/finding.js").then((m) => m.default),
		status: () => import("./report/status.js").then((m) => m.default),
		complete: () => import("./report/complete.js").then((m) => m.default),
		error: () => import("./report/error.js").then((m) => m.default),
	},
	run() {
		console.log("Usage: pl report <finding|status|complete|error>");
	},
});
