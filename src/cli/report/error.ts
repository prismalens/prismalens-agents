import { defineCommand } from "citty";

export default defineCommand({
	meta: { name: "error", description: "Report an error or blocker" },
	args: {
		_: { type: "positional", description: "Error message" },
	},
	run({ args }) {
		console.log("pl report error is not yet implemented");
		console.log("args:", args);
	},
});
