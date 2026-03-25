import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSessionManager } from "../../../core/session-manager.js";
import type { SessionMetadata } from "../../../types/session.js";

function makeSession(overrides?: Partial<SessionMetadata>): SessionMetadata {
	return {
		sessionId: "inv-test-001",
		label: "HighErrorRate on payment-api",
		projectKey: "-tmp-test-project",
		agentSessionId: "agent-session-abc",
		agentBackend: "claude-code",
		status: "gathering",
		workspacePath: "/tmp/workspace",
		runtime: "tmux",
		processRef: "pl-inv-test",
		startedAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		...overrides,
	};
}

describe("SessionManager", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "pl-session-test-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("creates and retrieves a session", async () => {
		const mgr = createSessionManager(tempDir);
		const session = makeSession();
		await mgr.create(session);

		const retrieved = await mgr.get("inv-test-001");
		expect(retrieved).not.toBeNull();
		expect(retrieved!.sessionId).toBe("inv-test-001");
		expect(retrieved!.agentBackend).toBe("claude-code");
	});

	it("returns null for non-existent session", async () => {
		const mgr = createSessionManager(tempDir);
		expect(await mgr.get("nonexistent")).toBeNull();
	});

	it("lists all sessions", async () => {
		const mgr = createSessionManager(tempDir);
		await mgr.create(makeSession({ sessionId: "s1", status: "gathering" }));
		await mgr.create(makeSession({ sessionId: "s2", status: "done" }));

		const all = await mgr.list();
		expect(all).toHaveLength(2);
	});

	it("lists sessions filtered by status", async () => {
		const mgr = createSessionManager(tempDir);
		await mgr.create(makeSession({ sessionId: "s1", status: "gathering" }));
		await mgr.create(makeSession({ sessionId: "s2", status: "done" }));

		const active = await mgr.list({ status: ["gathering"] });
		expect(active).toHaveLength(1);
		expect(active[0]!.sessionId).toBe("s1");
	});

	it("returns empty list when no sessions directory", async () => {
		const mgr = createSessionManager(join(tempDir, "nonexistent"));
		expect(await mgr.list()).toEqual([]);
	});

	it("updates session fields atomically", async () => {
		const mgr = createSessionManager(tempDir);
		await mgr.create(makeSession());

		await mgr.update("inv-test-001", { status: "analyzing" });
		const updated = await mgr.get("inv-test-001");
		expect(updated!.status).toBe("analyzing");
		expect(updated!.sessionId).toBe("inv-test-001"); // preserved
	});

	it("throws when updating non-existent session", async () => {
		const mgr = createSessionManager(tempDir);
		await expect(mgr.update("nonexistent", { status: "done" })).rejects.toThrow(
			"not found",
		);
	});

	it("removes a session", async () => {
		const mgr = createSessionManager(tempDir);
		await mgr.create(makeSession());
		await mgr.remove("inv-test-001");
		expect(await mgr.get("inv-test-001")).toBeNull();
	});

	it("remove is idempotent for missing sessions", async () => {
		const mgr = createSessionManager(tempDir);
		await expect(mgr.remove("nonexistent")).resolves.not.toThrow();
	});
});
