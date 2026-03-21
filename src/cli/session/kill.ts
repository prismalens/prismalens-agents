import { defineCommand } from "citty";

export default defineCommand({
	meta: { name: "kill", description: "Kill a running investigation" },
	args: {
		_: { type: "positional", description: "Session ID" },
	},
	run({ args }) {
		console.log("pl session kill is not yet implemented");
		console.log("args:", args);
	},
});
