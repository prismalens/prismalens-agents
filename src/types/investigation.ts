import type {
	ChecklistItem,
	Finding,
	Hypothesis,
	Recommendation,
} from "./findings.js";

export interface InvestigationContext {
	/** Generated UUID */
	investigationId: string;

	/** How the investigation was initiated */
	triggerType: "query" | "piped_payload" | "discover";

	/** Investigation query from --query flag (alert name, error, or description) */
	query?: string;

	/** Raw JSON piped via stdin (if provided) */
	pipedPayload?: Record<string, unknown>;

	/** Repository under investigation */
	repo?: {
		/** Git clone URL or owner/repo shorthand */
		url: string;
		defaultBranch: string;
		/** Local filesystem path if already cloned */
		localPath?: string;
	};

	/** Alert sources configured in pl.config.yaml with connection info */
	configuredSources: Array<{
		/** Source type (e.g. 'alertmanager', 'prometheus', 'sentry', 'grafana') */
		type: string;
		/** API URL from config */
		url?: string;
		/** CLI tool for this source (e.g. 'amtool', 'sentry-cli', 'curl') */
		cliTool: string;
		/** Whether the CLI tool is installed on this system */
		available: boolean;
	}>;

	/** CLI tools detected on the system */
	availableTools: Array<{
		name: string;
		available: boolean;
	}>;

	/** When the investigation was triggered (ISO 8601) */
	createdAt: string;
}

export interface InvestigationResult {
	/** Investigation UUID */
	investigationId: string;

	/** Terminal status of the investigation */
	status: "completed" | "failed" | "timeout" | "stalled";

	/** Identified root cause, or null if not determined */
	rootCause: string | null;

	/** Confidence in the root cause (0.0 - 1.0) */
	confidence: number;

	/** All findings produced during investigation */
	findings: Finding[];

	/** Actionable recommendations */
	recommendations: Recommendation[];

	/** All hypotheses explored during investigation */
	hypotheses: Hypothesis[];

	/** Investigation checklist with final statuses */
	checklist: ChecklistItem[];

	/** Total investigation wall-clock time in milliseconds */
	duration: number;

	/** Aggregate token usage across all agents */
	tokensUsed: { input: number; output: number };
}

export type InvestigationEvent =
	| { type: "status_changed"; status: string; timestamp: string }
	| { type: "finding_added"; finding: Finding; agentId?: string }
	| { type: "hypothesis_updated"; hypothesis: Hypothesis }
	| { type: "agent_dispatched"; agentId: string; role: string; task: string }
	| { type: "agent_completed"; agentId: string; exitCode: number }
	| { type: "stalled"; reason: string }
	| { type: "complete"; rootCause: string; confidence: number }
	| { type: "error"; message: string; fatal: boolean };

export interface AlertSource {
	/** Source type (e.g. 'alertmanager', 'prometheus', 'sentry', 'grafana') */
	type: string;
	/** API URL */
	url?: string;
	/** CLI tool name */
	cliTool?: string;
	/** Whether the CLI tool is available */
	available?: boolean;
}

export interface InvestigationConfig {
	/** Investigation UUID */
	investigationId: string;

	/** Agent implementation to use (e.g. 'deepagents-cli', 'claude-code', 'opencode') */
	agent: string;

	/** Maximum investigation duration in milliseconds */
	timeout: number;

	/** Resource budget for the investigation */
	budget: {
		/** Max agents running in parallel (default: 3) */
		maxConcurrentSubAgents: number;
		/** Total sub-agents allowed per investigation (default: 10) */
		maxTotalSubAgents: number;
		/** Token budget for entire investigation */
		tokens?: number;
		/** Wall-clock timeout in milliseconds */
		timeoutMs?: number;
		/** Max retries per failed sub-agent (default: 2) */
		maxRetries?: number;
	};

	/** Execution mode */
	mode: "standalone" | "prismalens";

	/** Repository under investigation (owner/repo format) */
	repo: string;

	/** Alert source that triggered this investigation */
	alertSource: AlertSource;

	/** When the investigation was created (ISO 8601) */
	createdAt: string;
}
