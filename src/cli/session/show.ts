import { defineCommand } from "citty";

export default defineCommand({
	meta: { name: "show", description: "Show session details" },
	args: {
		_: { type: "positional", description: "Session ID" },
	},
	run({ args }) {
		console.log("pl session show is not yet implemented");
		console.log("args:", args);
	},
});
