import consola from "consola";
import type {
	PluginModule,
	PluginRegistry,
	PluginSlot,
} from "../types/plugin-registry.js";

interface RegisteredPlugin {
	module: PluginModule;
	instance: unknown;
}

class DefaultPluginRegistry implements PluginRegistry {
	private readonly plugins = new Map<string, RegisteredPlugin>();
	private readonly defaults = new Map<PluginSlot, string>();

	register(plugin: PluginModule, config?: Record<string, unknown>): void {
		const key = `${plugin.manifest.slot}:${plugin.manifest.name}`;

		if (this.plugins.has(key)) {
			consola.warn(
				`Plugin "${plugin.manifest.name}" re-registered for slot "${plugin.manifest.slot}" — overwriting`,
			);
		}

		const instance = plugin.create(config);
		this.plugins.set(key, { module: plugin, instance });

		// First plugin registered for a slot becomes the default
		if (!this.defaults.has(plugin.manifest.slot)) {
			this.defaults.set(plugin.manifest.slot, plugin.manifest.name);
		}
	}

	get<T>(slot: PluginSlot, name?: string): T {
		const pluginName = name ?? this.defaults.get(slot);
		if (!pluginName) {
			throw new Error(`No plugin registered for slot "${slot}"`);
		}

		const key = `${slot}:${pluginName}`;
		const registered = this.plugins.get(key);
		if (!registered) {
			throw new Error(`Plugin "${pluginName}" not found for slot "${slot}"`);
		}

		return registered.instance as T;
	}

	getDefault<T>(slot: PluginSlot): T {
		return this.get<T>(slot);
	}

	setDefault(slot: PluginSlot, name: string): void {
		const key = `${slot}:${name}`;
		if (!this.plugins.has(key)) {
			throw new Error(
				`Cannot set default: plugin "${name}" not registered for slot "${slot}"`,
			);
		}
		this.defaults.set(slot, name);
	}
}

export function createPluginRegistry(): PluginRegistry {
	return new DefaultPluginRegistry();
}
