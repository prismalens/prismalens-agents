export interface SubAgentInfo {
	/** Unique agent ID (e.g. 'agent-001') */
	agentId: string;

	/** Agent's role in the investigation */
	role: "orchestrator" | "gatherer" | "analyst" | "resolver";

	/** Task description assigned to this agent */
	task: string;

	/** Current agent lifecycle status */
	status: "active" | "idle" | "stuck" | "exited";

	/** OS process ID (null if exited) */
	pid: number | null;

	/** When the agent was spawned (ISO 8601) */
	startedAt: string;

	/** Total wall-clock time in milliseconds (null if still running) */
	durationMs?: number;

	/** Number of findings this agent has produced so far */
	findingsCount: number;
}

/** Available tool/CLI info included in context.json */
export interface ToolInfo {
	/** Tool name (e.g., "gh", "amtool", "sentry-cli") */
	name: string;
	/** CLI command to invoke (e.g., "gh", "amtool", "curl") */
	command: string;
	/** Whether the CLI is available (verified via which/where) */
	available: boolean;
	/** Path to SKILL.md if this is a custom tool */
	skillPath?: string;
}
