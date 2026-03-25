import { ProcessRuntime } from "../plugins/runtimes/process.js";
import { TmuxRuntime } from "../plugins/runtimes/tmux.js";
import { DefaultWorkspace } from "../plugins/workspaces/default.js";
import type { PluginRegistry } from "../types/plugin-registry.js";
import type { RuntimePlugin } from "../types/plugins.js";
import type { PlConfig } from "./config/index.js";

/**
 * Register built-in plugins based on config.
 * Agent plugins are deferred to Phase 3.
 */
export async function loadPlugins(
	config: PlConfig,
	registry: PluginRegistry,
): Promise<void> {
	// Process runtime — always available
	registry.register({
		manifest: { name: "process", slot: "runtime", version: "1.0.0" },
		create: () => new ProcessRuntime(),
	});

	// tmux runtime — register if available
	const tmuxRuntime = new TmuxRuntime();
	if (await tmuxRuntime.isAvailable()) {
		registry.register({
			manifest: { name: "tmux", slot: "runtime", version: "1.0.0" },
			create: () => tmuxRuntime,
		});
	}

	// Set default runtime from config
	try {
		registry.setDefault("runtime", config.plugins.runtime);
	} catch {
		// Configured runtime not available — fall back to process
		registry.setDefault("runtime", "process");
	}

	// Default workspace plugin
	registry.register({
		manifest: { name: "default", slot: "workspace", version: "1.0.0" },
		create: () => new DefaultWorkspace(config.workspace.baseDir),
	});
}
