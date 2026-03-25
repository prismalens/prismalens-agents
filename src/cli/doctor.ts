import { defineCommand } from "citty";
import consola from "consola";
import type { PlConfig } from "../core/config/index.js";
import { loadConfig } from "../core/config/index.js";
import { runDoctorChecks } from "../core/doctor-checks.js";

export default defineCommand({
	meta: {
		name: "doctor",
		description: "Verify the investigation environment",
	},
	async run() {
		let config: PlConfig | undefined;
		try {
			config = await loadConfig();
		} catch {
			// Config may not exist yet — doctor still runs required checks
		}

		const result = await runDoctorChecks(config);

		consola.log("");
		consola.log("  Required:");
		for (const check of result.required) {
			if (check.pass) {
				consola.success(`  ${check.message}`);
			} else {
				consola.error(`  ${check.message}`);
			}
		}

		if (result.informational.length > 0) {
			consola.log("");
			consola.log("  Environment:");
			for (const check of result.informational) {
				if (check.pass) {
					consola.success(`  ${check.message}`);
				} else {
					consola.warn(`  ${check.message}`);
				}
			}
		}

		consola.log("");

		if (!result.allRequiredPassed) {
			consola.error("Required checks failed");
			process.exit(1);
		}
	},
});
