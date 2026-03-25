import { appendFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFileWatcher } from "../../../core/file-watcher.js";
import type { InvestigationEvent } from "../../../types/investigation.js";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("FileWatcher", () => {
	let tempDir: string;
	let findingsPath: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "pl-watcher-test-"));
		findingsPath = join(tempDir, "findings.jsonl");
		await writeFile(findingsPath, "", "utf-8");
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("emits events when new lines are appended", async () => {
		const events: InvestigationEvent[] = [];

		const watcher = createFileWatcher({
			path: findingsPath,
			debounceMs: 100,
			onEvent: (event) => events.push(event),
		});

		// Append a finding
		const event = JSON.stringify({
			type: "status_changed",
			status: "gathering",
			timestamp: new Date().toISOString(),
		});
		await appendFile(findingsPath, `${event}\n`);

		// Wait for debounce + processing
		await sleep(500);

		expect(events.length).toBeGreaterThanOrEqual(1);
		expect(events[0]!.type).toBe("status_changed");

		await watcher.close();
	}, 5_000);

	it("skips malformed JSON lines", async () => {
		const events: InvestigationEvent[] = [];

		const watcher = createFileWatcher({
			path: findingsPath,
			debounceMs: 100,
			onEvent: (event) => events.push(event),
		});

		await appendFile(findingsPath, "not valid json\n");
		await appendFile(
			findingsPath,
			`${JSON.stringify({ type: "stalled", reason: "no data" })}\n`,
		);

		await sleep(500);

		// Should only get the valid event
		expect(events.length).toBe(1);
		expect(events[0]!.type).toBe("stalled");

		await watcher.close();
	}, 5_000);

	it("handles multiple events in sequence", async () => {
		const events: InvestigationEvent[] = [];

		const watcher = createFileWatcher({
			path: findingsPath,
			debounceMs: 100,
			onEvent: (event) => events.push(event),
		});

		const lines = [
			{ type: "status_changed", status: "gathering", timestamp: "t1" },
			{ type: "status_changed", status: "analyzing", timestamp: "t2" },
		];

		await appendFile(
			findingsPath,
			lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
		);

		await sleep(500);

		expect(events.length).toBe(2);

		await watcher.close();
	}, 5_000);
});
