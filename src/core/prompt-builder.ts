import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { InvestigationContext } from "../types/investigation.js";
import type { PlConfig } from "./config/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(__dirname, "../../prompts");

// --- Sub-agent prompt types ---

export interface ToolInfo {
	configuredSources: InvestigationContext["configuredSources"];
	availableTools: InvestigationContext["availableTools"];
}

export interface SubAgentLineage {
	parentTask: string;
	hypothesis?: string;
	confidence?: number;
	checklistItemId?: string;
}

export interface SubAgentSibling {
	agentId: string;
	role: string;
	task: string;
	status: "active" | "exited";
}

// --- Helpers ---

async function readTemplate(name: string): Promise<string> {
	return readFile(join(PROMPTS_DIR, name), "utf-8");
}

function formatAvailableTools(toolInfo: ToolInfo): string {
	const lines: string[] = [];

	for (const source of toolInfo.configuredSources) {
		const status = source.available ? "installed" : "not installed (use curl)";
		lines.push(
			`- ${source.type}: \`${source.cliTool}\` (${status})${source.url ? ` — ${source.url}` : ""}`,
		);
	}

	for (const tool of toolInfo.availableTools) {
		if (!toolInfo.configuredSources.some((s) => s.cliTool === tool.name)) {
			lines.push(
				`- ${tool.name}: ${tool.available ? "available" : "not available"}`,
			);
		}
	}

	return lines.join("\n");
}

/**
 * Build the orchestrator prompt (Layers 1-4) by reading the template
 * and injecting investigation context.
 */
export async function buildOrchestratorPrompt(
	context: InvestigationContext,
	_config: PlConfig,
): Promise<string> {
	const template = await readTemplate("orchestrator.md");

	return template
		.replaceAll("{{availableTools}}", formatAvailableTools(context))
		.replaceAll("{{investigationContext}}", JSON.stringify(context, null, 2))
		.replaceAll("{{priorFindings}}", "");
}

/**
 * Build a sub-agent prompt by reading the template and injecting
 * role, task, context, lineage, and sibling info.
 */
export async function buildSubAgentPrompt(
	role: string,
	task: string,
	toolInfo: ToolInfo,
	lineage: SubAgentLineage,
	siblings: SubAgentSibling[],
): Promise<string> {
	const template = await readTemplate("sub-agent.md");

	return template
		.replaceAll("{{role}}", role)
		.replaceAll("{{task}}", task)
		.replaceAll("{{availableTools}}", formatAvailableTools(toolInfo))
		.replaceAll("{{context}}", JSON.stringify({ lineage, siblings }, null, 2));
}

/**
 * Build the shell allow-list formatted for a specific agent backend.
 */
export function buildAllowList(
	config: PlConfig,
	format: "claude" | "comma",
): string {
	const tools = config.agent.shellAllowList;
	if (format === "claude") {
		return tools.map((t) => `Bash(${t}*)`).join(",");
	}
	return tools.join(",");
}
