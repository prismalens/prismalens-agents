import { defineCommand } from "citty";

export default defineCommand({
	meta: { name: "finding", description: "Report a finding" },
	args: {
		type: {
			type: "string",
			description:
				"Finding type: hypothesis, evidence, observation, recommendation",
			required: true,
		},
		description: {
			type: "string",
			description: "What was found",
			required: true,
		},
		confidence: { type: "string", description: "Confidence level (0.0-1.0)" },
		source: {
			type: "string",
			description: "Data source (e.g., prometheus, github)",
		},
		"related-to": { type: "string", description: "Related finding ID" },
	},
	run({ args }) {
		console.log("pl report finding is not yet implemented");
		console.log("args:", args);
	},
});
