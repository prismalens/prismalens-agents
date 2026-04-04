import { appendFile } from "node:fs/promises";
import { join } from "node:path";
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
	async run({ args }) {
		const workspace = process.env["PL_WORKSPACE"];
		const agentId = process.env["PL_AGENT_ID"] ?? "unknown";

		if (!workspace) {
			console.error("PL_WORKSPACE env var not set");
			process.exit(1);
		}

		const event = {
			type: "complete",
			rootCause: args["root-cause"],
			confidence: Number.parseFloat(args.confidence),
			agentId,
			timestamp: new Date().toISOString(),
		};

		await appendFile(
			join(workspace, "findings.jsonl"),
			`${JSON.stringify(event)}\n`,
			"utf-8",
		);
	},
});
