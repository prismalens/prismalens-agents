import { describe, expect, it, vi } from "vitest";

describe("parseStdin", () => {
	it("returns undefined when stdin is a TTY", async () => {
		const originalIsTTY = process.stdin.isTTY;
		Object.defineProperty(process.stdin, "isTTY", {
			value: true,
			writable: true,
		});

		const { parseStdin } = await import("../../../core/parse-stdin.js");
		expect(await parseStdin()).toBeUndefined();

		Object.defineProperty(process.stdin, "isTTY", {
			value: originalIsTTY,
			writable: true,
		});
	});
});
