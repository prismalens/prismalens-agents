import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import { defineCommand } from "citty";

export default defineCommand({
	meta: { name: "status", description: "Update investigation status" },
	args: {
		_: {
			type: "positional",
			description: "Status: gathering, analyzing, resolving",
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
			type: "status",
			status: String(args._),
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
