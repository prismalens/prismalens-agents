import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { defineCommand } from "citty";
import consola from "consola";

export default defineCommand({
	meta: {
		name: "status",
		description: "Show investigation budget and progress",
	},
	async run() {
		const workspace = process.env["PL_WORKSPACE"];
		const investigationId = process.env["PL_INVESTIGATION_ID"] ?? "unknown";

		if (!workspace) {
			consola.error("PL_WORKSPACE env var not set");
			process.exit(1);
		}

		// Count findings
		let findingsCount = 0;
		try {
			const content = await readFile(
				join(workspace, "findings.jsonl"),
				"utf-8",
			);
			findingsCount = content.split("\n").filter((l) => l.trim()).length;
		} catch {
			// no findings yet
		}

		// Count active agents
		let activeAgents = 0;
		try {
			const pids = JSON.parse(
				await readFile(join(workspace, "pids.json"), "utf-8"),
			) as Record<string, unknown>;
			activeAgents = Object.keys(pids).length;
		} catch {
			// no agents
		}

		consola.log("");
		consola.log(`  Investigation: ${investigationId}`);
		consola.log(`  Findings:     ${findingsCount}`);
		consola.log(`  Agents:       ${activeAgents}`);
		consola.log("");
	},
});
