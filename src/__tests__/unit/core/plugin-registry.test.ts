import consola from "consola";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPluginRegistry } from "../../../core/plugin-registry.js";
import type {
	PluginModule,
	PluginRegistry,
	PluginSlot,
} from "../../../types/plugin-registry.js";

function makePlugin(
	slot: PluginSlot,
	name: string,
	instance: unknown = {},
): PluginModule {
	return {
		manifest: { name, slot, version: "1.0.0" },
		create: () => instance,
	};
}

describe("PluginRegistry", () => {
	let registry: PluginRegistry;

	beforeEach(() => {
		registry = createPluginRegistry();
	});

	it("registers and retrieves a plugin by slot and name", () => {
		const instance = { foo: "bar" };
		registry.register(makePlugin("runtime", "process", instance));
		expect(registry.get("runtime", "process")).toBe(instance);
	});

	it("first registered plugin becomes default for slot", () => {
		const instance = { type: "first" };
		registry.register(makePlugin("runtime", "process", instance));
		registry.register(makePlugin("runtime", "tmux", { type: "second" }));
		expect(registry.getDefault("runtime")).toBe(instance);
	});

	it("setDefault changes the default plugin for a slot", () => {
		const tmuxInstance = { type: "tmux" };
		registry.register(makePlugin("runtime", "process", { type: "process" }));
		registry.register(makePlugin("runtime", "tmux", tmuxInstance));
		registry.setDefault("runtime", "tmux");
		expect(registry.getDefault("runtime")).toBe(tmuxInstance);
	});

	it("throws when getting a plugin from an empty slot", () => {
		expect(() => registry.get("runtime")).toThrow("No plugin registered");
	});

	it("throws when getting a non-existent plugin by name", () => {
		registry.register(makePlugin("runtime", "process"));
		expect(() => registry.get("runtime", "docker")).toThrow("not found");
	});

	it("throws when setting default to unregistered plugin", () => {
		expect(() => registry.setDefault("runtime", "docker")).toThrow(
			"not registered",
		);
	});

	it("warns on re-registration (last wins)", () => {
		const warnSpy = vi.spyOn(consola, "warn").mockImplementation(() => {});
		const first = { v: 1 };
		const second = { v: 2 };
		registry.register(makePlugin("runtime", "process", first));
		registry.register(makePlugin("runtime", "process", second));
		expect(registry.get("runtime", "process")).toBe(second);
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("re-registered"),
		);
		warnSpy.mockRestore();
	});

	it("supports multiple slots independently", () => {
		const runtime = { type: "runtime" };
		const workspace = { type: "workspace" };
		registry.register(makePlugin("runtime", "process", runtime));
		registry.register(makePlugin("workspace", "default", workspace));
		expect(registry.getDefault("runtime")).toBe(runtime);
		expect(registry.getDefault("workspace")).toBe(workspace);
	});
});
