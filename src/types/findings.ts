export interface Finding {
	/** Unique finding ID (e.g. 'f-001') */
	id: string;

	/** Classification of what this finding represents */
	type:
		| "hypothesis"
		| "evidence"
		| "observation"
		| "root_cause"
		| "recommendation"
		| "error"
		| "metadata";

	/** Human-readable description of the finding */
	description: string;

	/** Confidence level (0.0 - 1.0). Required for hypothesis and root_cause types. */
	confidence?: number;

	/** Where this finding came from (e.g. 'alertmanager', 'prometheus', 'sentry', 'github-commits') */
	source?: string;

	/** ID of the agent that produced this finding (set automatically by pl report from PL_AGENT_ID env var) */
	agentId: string;

	/** ID of another finding this one relates to (e.g. evidence supporting a hypothesis) */
	relatedTo?: string;

	/** Whether this finding represents a fatal/blocking error */
	fatal?: boolean;

	/** When this finding was recorded (ISO 8601) */
	timestamp: string;
}

export interface ChecklistItem {
	/** Unique checklist item ID (e.g. 'cl-001') */
	id: string;

	/** Whether this is a data-gathering task or a hypothesis to validate */
	category: "data_gathering" | "hypothesis";

	/** Human-readable description of the task or hypothesis */
	description: string;

	/** Current status of this checklist item */
	status: "pending" | "in_progress" | "confirmed" | "refuted" | "skipped";

	/** Priority for ordering (lower = higher priority) */
	priority: number;

	/** ID of the agent assigned to work on this item */
	assignedAgentId?: string;

	/** Supporting evidence or notes collected for this item */
	evidence?: string;
}

export interface Recommendation {
	/** Unique recommendation ID (e.g. 'r-001') */
	id: string;

	/** Urgency classification */
	type: "immediate" | "preventive" | "monitoring";

	/** Human-readable description of the recommendation */
	description: string;

	/** How critical this recommendation is */
	priority: "critical" | "high" | "medium" | "low";

	/** Estimated implementation effort */
	effort?: "low" | "medium" | "high";
}

export interface Hypothesis {
	/** Unique hypothesis ID (e.g. 'hyp-001') */
	id: string;

	/** Human-readable hypothesis statement */
	statement: string;

	/** Current status in the hypothesis lifecycle */
	status: "proposed" | "testing" | "supported" | "refuted" | "inconclusive";

	/** Confidence level (0.0 - 1.0) */
	confidence: number;

	/** IDs of findings that support this hypothesis */
	supportingEvidence: string[];

	/** IDs of findings that contradict this hypothesis */
	contradictingEvidence: string[];

	/** What evidence would confirm or refute this hypothesis */
	testPlan?: string;

	/** Why this hypothesis was refuted (if status is 'refuted') */
	refutationReason?: string;

	/** Which investigation iteration created this hypothesis */
	iteration: number;
}
