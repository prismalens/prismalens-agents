import { defineCommand } from "citty";

export default defineCommand({
	meta: {
		name: "investigate",
		description: "Run an investigation",
	},
	args: {
		repo: {
			type: "string",
			description: "Repository to investigate (org/repo or /local/path)",
			required: true,
		},
		alert: {
			type: "string",
			description: "Alert name hint — agent searches all configured sources",
		},
		describe: {
			type: "string",
			description: "Free-text problem description",
		},
		model: {
			type: "string",
			description: "LLM model override (provider:model)",
		},
		timeout: {
			type: "string",
			description: "Investigation timeout in seconds (default: 600)",
		},
		runtime: {
			type: "string",
			description: "Runtime plugin: process or tmux (default: process)",
		},
		resume: {
			type: "string",
			description: "Resume investigation by session ID",
		},
		output: {
			type: "string",
			description: "Write final report to file",
		},
		json: {
			type: "boolean",
			description: "JSON output to stdout",
		},
		quiet: {
			type: "boolean",
			description: "Suppress progress output",
		},
	},
	run({ args }) {
		console.log("pl investigate is not yet implemented");
		console.log("args:", args);
	},
});
