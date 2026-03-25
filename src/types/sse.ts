import type { ChecklistItem, Finding } from "./findings.js";

export type InvestigationSSEEvent =
	| { type: "status_changed"; status: string; timestamp: string }
	| { type: "finding_added"; finding: Finding; agentId?: string }
	| { type: "checklist_updated"; items: ChecklistItem[] }
	| { type: "progress_updated"; progress: ProgressSnapshot }
	| { type: "agent_spawned"; agentId: string; role: string; task: string }
	| { type: "agent_completed"; agentId: string; exitCode: number }
	| {
			type: "agent_activity";
			agentId: string;
			activity: "active" | "idle" | "exited";
	  }
	| {
			type: "investigation_complete";
			rootCause: string;
			confidence: number;
	  }
	| { type: "error"; message: string; fatal: boolean };

export interface ProgressSnapshot {
	currentPhase: string;
	summary: string;
	completedSteps: number;
	totalSteps: number;
	nextStep?: string;
}
