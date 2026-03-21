import { defineCommand } from "citty";

export default defineCommand({
	meta: { name: "list", description: "List investigation sessions" },
	args: {
		all: { type: "boolean", description: "Include completed/errored sessions" },
		active: { type: "boolean", description: "Only running investigations" },
		json: { type: "boolean", description: "JSON output" },
	},
	run({ args }) {
		console.log("pl session list is not yet implemented");
		console.log("args:", args);
	},
});
