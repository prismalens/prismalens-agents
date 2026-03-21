#!/usr/bin/env node
import { defineCommand, runMain } from "citty";

const main = defineCommand({
	meta: {
		name: "pl",
		version: "0.0.1",
		description: "PrismaLens Investigation Orchestrator",
	},
	subCommands: {
		investigate: () =>
			import("../src/cli/investigate.js").then((m) => m.default),
		report: () => import("../src/cli/report.js").then((m) => m.default),
		dispatch: () => import("../src/cli/dispatch.js").then((m) => m.default),
		session: () => import("../src/cli/session.js").then((m) => m.default),
		init: () => import("../src/cli/init.js").then((m) => m.default),
		doctor: () => import("../src/cli/doctor.js").then((m) => m.default),
		status: () => import("../src/cli/status.js").then((m) => m.default),
	},
});

runMain(main);
