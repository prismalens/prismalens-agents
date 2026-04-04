import { describe, expect, it, vi } from "vitest";

vi.mock("tinyexec", () => ({
	x: vi.fn(),
}));

import { x } from "tinyexec";
import { detectRepo } from "../../../core/detect-repo.js";

const mockX = vi.mocked(x);

describe("detectRepo", () => {
	it("parses owner/repo from HTTPS URL", async () => {
		mockX.mockResolvedValue({
			stdout: "https://github.com/org/payment-api.git\n",
		} as never);

		expect(await detectRepo()).toBe("org/payment-api");
	});

	it("parses owner/repo from SSH URL", async () => {
		mockX.mockResolvedValue({
			stdout: "git@github.com:org/payment-api.git\n",
		} as never);

		expect(await detectRepo()).toBe("org/payment-api");
	});

	it("parses from GitLab HTTPS URL", async () => {
		mockX.mockResolvedValue({
			stdout: "https://gitlab.com/team/project.git\n",
		} as never);

		expect(await detectRepo()).toBe("team/project");
	});

	it("parses from Bitbucket URL", async () => {
		mockX.mockResolvedValue({
			stdout: "https://bitbucket.org/org/repo.git\n",
		} as never);

		expect(await detectRepo()).toBe("org/repo");
	});

	it("returns undefined when not a git repo", async () => {
		mockX.mockRejectedValue(new Error("not a git repo"));

		expect(await detectRepo()).toBeUndefined();
	});

	it("returns undefined when no remote", async () => {
		mockX.mockRejectedValue(new Error("No such remote"));

		expect(await detectRepo()).toBeUndefined();
	});

	it("returns undefined for unrecognized URL format", async () => {
		mockX.mockResolvedValue({
			stdout: "https://custom-host.com/repo.git\n",
		} as never);

		expect(await detectRepo()).toBeUndefined();
	});
});
