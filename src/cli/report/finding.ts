import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
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
		confidence: {
			type: "string",
			description: "Confidence level (0.0-1.0)",
		},
		source: {
			type: "string",
			description: "Data source (e.g., prometheus, github)",
		},
		"related-to": { type: "string", description: "Related finding ID" },
		priority: {
			type: "string",
			description: "For recommendation type: immediate, preventive, monitoring",
		},
	},
	async run({ args }) {
		const workspace = process.env["PL_WORKSPACE"];
		const agentId = process.env["PL_AGENT_ID"] ?? "unknown";

		if (!workspace) {
			console.error("PL_WORKSPACE env var not set");
			process.exit(1);
		}

		const findingsPath = join(workspace, "findings.jsonl");

		// Count existing findings to generate next ID
		let count = 0;
		try {
			const content = await readFile(findingsPath, "utf-8");
			count = content.split("\n").filter((l) => l.trim()).length;
		} catch {
			// File may not exist yet
		}

		const id = `f-${String(count + 1).padStart(3, "0")}`;

		const event: Record<string, unknown> = {
			type: "finding",
			id,
			findingType: args.type,
			description: args.description,
			agentId,
			timestamp: new Date().toISOString(),
		};

		if (args.confidence) {
			event["confidence"] = Number.parseFloat(args.confidence);
		}
		if (args.source) {
			event["source"] = args.source;
		}
		if (args["related-to"]) {
			event["relatedTo"] = args["related-to"];
		}
		if (args.priority) {
			event["priority"] = args.priority;
		}

		await appendFile(findingsPath, `${JSON.stringify(event)}\n`, "utf-8");
		console.log(id);
	},
});
