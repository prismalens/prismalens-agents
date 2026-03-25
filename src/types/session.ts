export interface SessionMetadata {
	/** Investigation ID (short UUID, first 8 chars) */
	sessionId: string;

	/** Human-readable label derived from --query */
	label: string;

	/** Project key (CWD path with / → -, e.g., "-home-sumit-code-payment-api") */
	projectKey: string;

	/** Agent backend's session/thread ID — used for native resume */
	agentSessionId: string;

	/** Which agent backend is running this investigation */
	agentBackend: "deepagents-cli" | "claude-code" | "opencode";

	/** Current investigation status */
	status:
		| "spawning"
		| "gathering"
		| "analyzing"
		| "resolving"
		| "resolved"
		| "done"
		| "errored"
		| "timeout"
		| "stalled";

	/** Absolute path to the investigation workspace */
	workspacePath: string;

	/** Runtime type used for this investigation */
	runtime: "process" | "tmux";

	/** Process ID (for process runtime) or tmux session name (for tmux runtime) */
	processRef: number | string;

	/** Repository under investigation */
	repo?: string;

	/** Investigation query (from --query flag) */
	query?: string;

	/** When the investigation started (ISO 8601) */
	startedAt: string;

	/** When the session metadata was last updated (ISO 8601) */
	updatedAt: string;

	/** When the investigation completed (ISO 8601), if terminal */
	completedAt?: string;

	/** Exit code of the orchestrator process (null if still running) */
	exitCode?: number;
}

export interface SessionManager {
	/** Create a new session record */
	create(metadata: SessionMetadata): Promise<void>;

	/** Get a session by ID. Returns null if not found */
	get(sessionId: string): Promise<SessionMetadata | null>;

	/** List all sessions, optionally filtered by status */
	list(filter?: {
		status?: SessionMetadata["status"][];
	}): Promise<SessionMetadata[]>;

	/** Update session fields (merges with existing) */
	update(sessionId: string, updates: Partial<SessionMetadata>): Promise<void>;

	/** Remove a session record */
	remove(sessionId: string): Promise<void>;

	/** Find sessions with stale process refs (process exited or tmux session gone) */
	findOrphans(): Promise<SessionMetadata[]>;
}
