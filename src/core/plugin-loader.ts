import { ClaudeCodeAgent } from "../plugins/agents/claude-code.js";
import { DeepAgentsPlugin } from "../plugins/agents/deepagents.js";
import { OpenCodeAgent } from "../plugins/agents/opencode.js";
import { ProcessRuntime } from "../plugins/runtimes/process.js";
import { TmuxRuntime } from "../plugins/runtimes/tmux.js";
import { DefaultWorkspace } from "../plugins/workspaces/default.js";
import type { PluginRegistry } from "../types/plugin-registry.js";
import type { PlConfig } from "./config/index.js";

/**
 * Register built-in plugins based on config.
 */
export async function loadPlugins(
	config: PlConfig,
	registry: PluginRegistry,
): Promise<void> {
	// --- Runtimes ---

	registry.register({
		manifest: { name: "process", slot: "runtime", version: "1.0.0" },
		create: () => new ProcessRuntime(),
	});

	const tmuxRuntime = new TmuxRuntime();
	if (await tmuxRuntime.isAvailable()) {
		registry.register({
			manifest: { name: "tmux", slot: "runtime", version: "1.0.0" },
			create: () => tmuxRuntime,
		});
	}

	try {
		registry.setDefault("runtime", config.plugins.runtime);
	} catch {
		registry.setDefault("runtime", "process");
	}

	// --- Workspace ---

	registry.register({
		manifest: { name: "default", slot: "workspace", version: "1.0.0" },
		create: () => new DefaultWorkspace(config.workspace.baseDir),
	});

	// --- Agent backends ---

	const claudeAgent = new ClaudeCodeAgent();
	claudeAgent.setConfig(config);
	if (await claudeAgent.isAvailable()) {
		registry.register({
			manifest: { name: "claude-code", slot: "agent", version: "1.0.0" },
			create: () => claudeAgent,
		});
	}

	const deepAgent = new DeepAgentsPlugin();
	deepAgent.setConfig(config);
	if (await deepAgent.isAvailable()) {
		registry.register({
			manifest: { name: "deepagents-cli", slot: "agent", version: "1.0.0" },
			create: () => deepAgent,
		});
	}

	const openCodeAgent = new OpenCodeAgent();
	if (await openCodeAgent.isAvailable()) {
		registry.register({
			manifest: { name: "opencode", slot: "agent", version: "1.0.0" },
			create: () => openCodeAgent,
		});
	}

	// Set default agent from config
	try {
		registry.setDefault("agent", config.agent.default);
	} catch {
		// Configured agent not available — first registered becomes default
	}
}
