import type { Finding } from "./findings.js";
import type {
	InvestigationContext,
	InvestigationResult,
} from "./investigation.js";

// --- RuntimePlugin ---

export interface RuntimePlugin {
	/** Start an agent process with the given config. Returns a handle for lifecycle management. */
	start(config: RuntimeStartConfig): Promise<RuntimeHandle>;

	/** Stop a running agent process. Sends SIGTERM, waits grace period, then SIGKILL. */
	stop(handle: RuntimeHandle): Promise<void>;

	/** Check if the runtime environment is available (e.g. tmux installed, process spawning works) */
	isAvailable(): Promise<boolean>;
}

export interface RuntimeStartConfig {
	/** Shell command + args to execute */
	command: string[];
	/** Environment variables for the process */
	env: Record<string, string>;
	/** Working directory */
	cwd: string;
	/** Timeout in milliseconds */
	timeout?: number;
	/** tmux session to join (undefined = create new session) */
	sessionName?: string;
	/** Name for the tmux window (e.g., "orchestrator", "gatherer-1") */
	windowName?: string;
}

export interface RuntimeHandle {
	/** Process ID (for process runtime) or -1 (for tmux runtime — tmux manages the PID) */
	pid: number;
	/** tmux session name (only for tmux runtime, undefined for process runtime) */
	sessionName?: string;
	/** tmux window name (only for tmux runtime) */
	windowName?: string;
	/** Kill the process (SIGTERM → grace → SIGKILL) or kill the tmux window/session */
	kill(): void;
	/** Whether the process is still running (checks PID or tmux window existence) */
	isRunning(): boolean;
	/** Promise that resolves when the process exits */
	waitForExit(): Promise<{ exitCode: number }>;
}

// --- AgentPlugin ---

export interface AgentPlugin {
	readonly name: string; // 'deepagents-cli', 'claude-code', 'opencode'
	readonly processName: string; // 'deepagents', 'claude', 'opencode'

	/** Get the shell command + args to launch this agent */
	getLaunchCommand(task: AgentTask, config: AgentLaunchConfig): string[];

	/** Get environment variables for the agent process */
	getEnvironment?(config: AgentLaunchConfig): Record<string, string>;

	/** Parse agent output from workspace after process exits */
	parseOutput(dir: string): Promise<AgentOutput>;

	/** Check if this agent CLI is installed and available on the system */
	isAvailable(): Promise<boolean>;
}

export interface AgentTask {
	/** Task description */
	task: string;
	/** Agent role */
	role: "orchestrator" | "gatherer" | "analyst" | "resolver";
	/** Workspace path */
	workspacePath: string;
}

export interface AgentLaunchConfig {
	/** Agent role in the investigation */
	role: "orchestrator" | "gatherer" | "analyst" | "resolver";

	/** Task description for the agent */
	task: string;

	/** Absolute path to the agent's workspace directory */
	workspaceDir: string;

	/** LLM model override (e.g. 'claude-sonnet-4-6', 'gpt-4o') */
	model?: string;

	/** Agent-level timeout in milliseconds */
	timeout?: number;

	/** Agent-level token budget */
	budget?: number;

	/** Additional environment variables for the agent process */
	environment?: Record<string, string>;

	/** Path to IPC socket (undefined in standalone mode) */
	ipcSocket?: string;
}

export interface AgentOutput {
	/** All findings the agent produced */
	findings: Finding[];

	/** Structured result summary (optional -- agent may only produce findings) */
	result?: {
		rootCause?: string;
		confidence?: number;
		summary?: string;
	};

	/** LLM token usage for this agent session */
	tokensUsed?: { input: number; output: number };

	/** Agent's terminal status */
	status: "completed" | "error" | "timeout";

	/** Captured stdout from the agent process */
	stdout: string;

	/** Process exit code */
	exitCode: number;

	/** Wall-clock duration in milliseconds */
	durationMs: number;
}

// --- WorkspacePlugin ---

export interface WorkspacePlugin {
	/** Create a new investigation workspace directory with standard structure */
	create(
		investigationId: string,
		options?: WorkspaceOptions,
	): Promise<WorkspaceHandle>;

	/** Get the absolute filesystem path for a workspace */
	getPath(handle: WorkspaceHandle): string;
}

export interface WorkspaceOptions {
	/** Base directory for workspaces (default: ~/.prismalens/investigations/) */
	baseDir?: string;
	/** Pre-populate with context files */
	context?: InvestigationContext;
	/** Available tools metadata (included in context.json) */
	tools?: Array<{ name: string; command: string; available: boolean }>;
}

export interface WorkspaceHandle {
	/** Investigation ID this workspace belongs to */
	investigationId: string;
	/** Absolute path to the workspace root */
	path: string;
}

// --- ReporterPlugin ---

export interface ReporterPlugin {
	/** Report a single finding (hypothesis, evidence, observation, etc.) */
	reportFinding(finding: Finding): Promise<void>;

	/** Report an investigation status change */
	reportStatus(status: string): Promise<void>;

	/** Report investigation completion with full result */
	reportComplete(result: InvestigationResult): Promise<void>;
}

// --- NotifierPlugin ---

export interface NotifierPlugin {
	/** Send a notification for an investigation event */
	notify(event: NotifierEvent, message: string): Promise<void>;
}

export type NotifierEvent =
	| { type: "status_changed"; from: string; to: string }
	| { type: "finding_reported"; finding: Finding }
	| { type: "sub_agent_spawned"; agentId: string; role: string; task: string }
	| { type: "sub_agent_completed"; agentId: string; exitCode: number }
	| { type: "investigation_complete"; result: InvestigationResult }
	| { type: "error"; message: string; fatal: boolean };
