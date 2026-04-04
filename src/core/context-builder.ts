import type { InvestigationContext } from "../types/investigation.js";
import type { PreCheckResult } from "./pre-check.js";

export interface ContextBuilderInput {
	repo?: string;
	query?: string;
	pipedPayload?: Record<string, unknown>;
	preCheck: PreCheckResult;
}

/**
 * Build InvestigationContext in memory for prompt injection.
 * No file is written — context goes directly into the orchestrator prompt (Layer 2).
 */
export function buildContext(input: ContextBuilderInput): InvestigationContext {
	const investigationId = crypto.randomUUID().slice(0, 8);

	let triggerType: InvestigationContext["triggerType"];
	if (input.query) {
		triggerType = "query";
	} else if (input.pipedPayload) {
		triggerType = "piped_payload";
	} else {
		triggerType = "discover";
	}

	const context: InvestigationContext = {
		investigationId,
		triggerType,
		configuredSources: input.preCheck.configuredSources,
		availableTools: input.preCheck.availableTools,
		createdAt: new Date().toISOString(),
	};

	if (input.query) {
		context.query = input.query;
	}

	if (input.pipedPayload) {
		context.pipedPayload = input.pipedPayload;
	}

	if (input.repo) {
		const isLocalPath =
			input.repo.startsWith("/") || input.repo.startsWith("~");
		context.repo = {
			url: input.repo,
			defaultBranch: "main",
			...(isLocalPath ? { localPath: input.repo } : {}),
		};
	}

	return context;
}
