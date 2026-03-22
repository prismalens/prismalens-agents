import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	interpolateDeep,
	interpolateEnvVars,
} from "../../../../core/config/interpolate.js";

describe("interpolateEnvVars", () => {
	beforeEach(() => {
		process.env.TEST_VAR = "hello";
		process.env.EMPTY_VAR = "";
	});

	afterEach(() => {
		delete process.env.TEST_VAR;
		delete process.env.EMPTY_VAR;
	});

	it("replaces ${VAR} with env var value", () => {
		expect(interpolateEnvVars("${TEST_VAR}")).toBe("hello");
	});

	it("replaces multiple vars in one string", () => {
		process.env.OTHER = "world";
		expect(interpolateEnvVars("${TEST_VAR}-${OTHER}")).toBe("hello-world");
		delete process.env.OTHER;
	});

	it("throws for missing env var with var name in message", () => {
		expect(() => interpolateEnvVars("${MISSING_VAR}")).toThrow("MISSING_VAR");
	});

	it("returns empty string for empty env var", () => {
		expect(interpolateEnvVars("${EMPTY_VAR}")).toBe("");
	});

	it("returns string unchanged when no patterns present", () => {
		expect(interpolateEnvVars("plain string")).toBe("plain string");
	});
});

describe("interpolateDeep", () => {
	beforeEach(() => {
		process.env.DEEP_VAR = "resolved";
	});

	afterEach(() => {
		delete process.env.DEEP_VAR;
	});

	it("interpolates string values in objects", () => {
		const result = interpolateDeep({ url: "${DEEP_VAR}" });
		expect(result).toEqual({ url: "resolved" });
	});

	it("traverses nested objects", () => {
		const result = interpolateDeep({
			outer: { inner: "${DEEP_VAR}" },
		});
		expect(result).toEqual({ outer: { inner: "resolved" } });
	});

	it("traverses arrays", () => {
		const result = interpolateDeep(["${DEEP_VAR}", "plain"]);
		expect(result).toEqual(["resolved", "plain"]);
	});

	it("passes non-string values through unchanged", () => {
		const result = interpolateDeep({ count: 42, flag: true, nil: null });
		expect(result).toEqual({ count: 42, flag: true, nil: null });
	});

	it("handles mixed nested structures", () => {
		const result = interpolateDeep({
			sources: {
				alertmanager: { url: "${DEEP_VAR}" },
			},
			count: 5,
			tags: ["${DEEP_VAR}", "static"],
		});
		expect(result).toEqual({
			sources: {
				alertmanager: { url: "resolved" },
			},
			count: 5,
			tags: ["resolved", "static"],
		});
	});
});
