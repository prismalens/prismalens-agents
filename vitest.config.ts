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
				// Phase -1 stubs — not yet implemented, remove exclusions when implemented:
				"src/cli/investigate.ts", // Phase 4
				"src/cli/dispatch.ts", // Phase 3
				"src/cli/report.ts", // Phase 3
				"src/cli/report/**", // Phase 3
				"src/cli/session.ts", // router only, no logic to cover
				"src/cli/session/**", // thin wrappers, tested via integration tests
				"src/cli/status.ts", // Phase 4
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
