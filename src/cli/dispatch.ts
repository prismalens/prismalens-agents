import { defineCommand } from "citty";

export default defineCommand({
	meta: {
		name: "dispatch",
		description: "Spawn and manage investigation sub-agents",
	},
	args: {
		role: {
			type: "string",
			description: "Agent role: gatherer, analyst, resolver",
		},
		task: {
			type: "string",
			description: "Task description for the sub-agent",
		},
		timeout: {
			type: "string",
			description: "Agent timeout in seconds (default: 120)",
		},
		"budget-tokens": {
			type: "string",
			description: "Remaining token budget for this sub-agent",
		},
		agent: {
			type: "string",
			description: "Override agent backend for this sub-agent",
		},
		list: {
			type: "boolean",
			description: "List running sub-agents",
		},
		output: {
			type: "string",
			description: "Read sub-agent output by agent ID",
		},
		kill: {
			type: "string",
			description: "Kill a sub-agent by agent ID",
		},
	},
	run({ args }) {
		console.log("pl dispatch is not yet implemented");
		console.log("args:", args);
	},
});
