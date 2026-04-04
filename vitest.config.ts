import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		include: ["src/__tests__/**/*.test.ts"],
		exclude: ["dist/**", "node_modules/**"],
		sequence: { concurrent: false },
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: [
				"src/types/**/*.ts",
				"src/__tests__/**",
				"src/cli/investigate.ts", // Phase 2c — wired next
				"src/cli/report.ts", // router only
				"src/cli/session.ts", // router only
				"src/cli/report/**", // tested via integration tests
				"src/cli/session/**", // tested via integration tests
				"src/cli/dispatch.ts", // tested via integration tests
				"src/cli/status.ts", // tested via integration tests
			],
			thresholds: {
				statements: 80,
				branches: 65, // CLI guard clauses (cancellation paths) reduce branch coverage
				functions: 80,
				lines: 80,
			},
		},
	},
});
