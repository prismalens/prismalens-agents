import { defineCommand } from "citty";

export default defineCommand({
	meta: { name: "complete", description: "Report investigation completion" },
	args: {
		"root-cause": {
			type: "string",
			description: "Identified root cause",
			required: true,
		},
		confidence: {
			type: "string",
			description: "Confidence in root cause (0.0-1.0)",
			required: true,
		},
	},
	run({ args }) {
		console.log("pl report complete is not yet implemented");
		console.log("args:", args);
	},
});
