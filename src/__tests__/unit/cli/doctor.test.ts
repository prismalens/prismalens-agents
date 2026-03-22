import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../core/doctor-checks.js", () => ({
	runDoctorChecks: vi.fn(),
}));

vi.mock("../../../core/config/index.js", () => ({
	loadConfig: vi.fn().mockRejectedValue(new Error("no config")),
}));

import type { DoctorResult } from "../../../core/doctor-checks.js";
import { runDoctorChecks } from "../../../core/doctor-checks.js";

const mockRunDoctorChecks = vi.mocked(runDoctorChecks);

function makeResult(allPass: boolean): DoctorResult {
	return {
		required: [
			{
				name: "Node.js",
				pass: allPass,
				message: allPass ? "Node.js v22.0.0" : "Node.js v18 — requires >= 20",
				level: "required",
			},
		],
		informational: [],
		allRequiredPassed: allPass,
	};
}

describe("pl doctor", () => {
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
			throw new Error("process.exit called");
		});
	});

	afterEach(() => {
		exitSpy.mockRestore();
	});

	it("exits 0 when all required checks pass", async () => {
		mockRunDoctorChecks.mockResolvedValue(makeResult(true));

		const mod = await import("../../../cli/doctor.js");
		const command = mod.default;
		await command.run!({} as never);

		expect(exitSpy).not.toHaveBeenCalled();
	});

	it("exits 1 when a required check fails", async () => {
		mockRunDoctorChecks.mockResolvedValue(makeResult(false));

		const mod = await import("../../../cli/doctor.js");
		const command = mod.default;

		await expect(command.run!({} as never)).rejects.toThrow(
			"process.exit called",
		);

		expect(exitSpy).toHaveBeenCalledWith(1);
	});
});
