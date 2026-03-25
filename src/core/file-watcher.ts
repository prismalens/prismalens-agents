import { open } from "node:fs/promises";
import { watch } from "chokidar";
import type { InvestigationEvent } from "../types/investigation.js";

export interface FileWatcherOptions {
	/** Path to findings.jsonl */
	path: string;
	/** Debounce interval in ms (default: 500) */
	debounceMs?: number;
	/** Callback for each parsed event */
	onEvent: (event: InvestigationEvent) => void;
}

/**
 * Watch findings.jsonl for new events appended by agents.
 * Tracks byte offset to only read new content. Handles partial line writes.
 */
export function createFileWatcher(options: FileWatcherOptions): {
	close: () => Promise<void>;
} {
	const { path, debounceMs = 500, onEvent } = options;
	let offset = 0;
	let partialLine = "";
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	async function readNewEvents(): Promise<void> {
		let fd: Awaited<ReturnType<typeof open>> | undefined;
		try {
			fd = await open(path, "r");
			const stats = await fd.stat();

			if (stats.size <= offset) return;

			const bytesToRead = stats.size - offset;
			const buffer = Buffer.alloc(bytesToRead);
			await fd.read(buffer, 0, bytesToRead, offset);
			offset = stats.size;

			const chunk = partialLine + buffer.toString("utf-8");
			const lines = chunk.split("\n");

			// Last element may be incomplete — save for next read
			partialLine = lines.pop() ?? "";

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				try {
					const event = JSON.parse(trimmed) as InvestigationEvent;
					onEvent(event);
				} catch {
					// Skip malformed lines
				}
			}
		} catch {
			// File may not exist yet — wait for next change
		} finally {
			await fd?.close();
		}
	}

	function debouncedRead(): void {
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			void readNewEvents();
		}, debounceMs);
	}

	const usePolling = process.env["PL_DOCKER"] === "1";

	const watcher = watch(path, {
		persistent: true,
		ignoreInitial: true,
		...(usePolling ? { usePolling: true, interval: 1_000 } : {}),
	});

	watcher.on("change", debouncedRead);
	watcher.on("add", debouncedRead);

	return {
		async close() {
			if (debounceTimer) clearTimeout(debounceTimer);
			await watcher.close();
		},
	};
}
