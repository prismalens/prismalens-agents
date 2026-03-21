import { defineCommand } from "citty";

export default defineCommand({
	meta: { name: "status", description: "Update investigation status" },
	args: {
		_: {
			type: "positional",
			description: "Status: gathering, analyzing, resolving",
		},
	},
	run({ args }) {
		console.log("pl report status is not yet implemented");
		console.log("args:", args);
	},
});
