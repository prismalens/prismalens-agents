export type PluginSlot =
	| "runtime"
	| "agent"
	| "workspace"
	| "reporter"
	| "notifier";

export interface PluginManifest {
	/** Plugin name (e.g. 'process', 'deepagents-cli', 'prismalens') */
	name: string;
	/** Which slot this plugin fills */
	slot: PluginSlot;
	/** Semver version */
	version: string;
}

export interface PluginModule<T = unknown> {
	manifest: PluginManifest;
	create(config?: Record<string, unknown>): T;
}

export interface PluginRegistry {
	register(plugin: PluginModule, config?: Record<string, unknown>): void;
	get<T>(slot: PluginSlot, name?: string): T;
	getDefault<T>(slot: PluginSlot): T;
	setDefault(slot: PluginSlot, name: string): void;
}
