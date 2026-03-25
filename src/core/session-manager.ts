import {
	mkdir,
	readdir,
	readFile,
	rename,
	unlink,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { x } from "tinyexec";
import type { SessionManager, SessionMetadata } from "../types/session.js";

const TERMINAL_STATUSES = new Set(["done", "errored", "timeout", "stalled"]);

function resolveBaseDir(baseDir?: string): string {
	const dir = baseDir ?? join(homedir(), ".prismalens");
	return resolve(dir);
}

/**
 * Derive a project key from a CWD path.
 * Replaces path separators with `-`, matching Claude Code's convention.
 * e.g., `/home/sumit/code/payment-api` → `-home-sumit-code-payment-api`
 */
export function deriveProjectKey(cwd: string): string {
	return cwd.replace(/\//g, "-").replace(/\\/g, "-");
}

const SESSION_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

function validateSessionId(sessionId: string): void {
	if (!SESSION_ID_RE.test(sessionId)) {
		throw new Error(`Invalid sessionId: "${sessionId}"`);
	}
}

export function createSessionManager(baseDir?: string): SessionManager {
	const base = resolveBaseDir(baseDir);

	function projectDir(projectKey: string): string {
		return join(base, "projects", projectKey);
	}

	function sessionPath(projectKey: string, sessionId: string): string {
		validateSessionId(sessionId);
		return join(projectDir(projectKey), `${sessionId}.json`);
	}

	return {
		async create(metadata: SessionMetadata): Promise<void> {
			const dir = projectDir(metadata.projectKey);
			await mkdir(dir, { recursive: true });
			await writeFile(
				sessionPath(metadata.projectKey, metadata.sessionId),
				JSON.stringify(metadata, null, 2),
				"utf-8",
			);
		},

		async get(sessionId: string): Promise<SessionMetadata | null> {
			validateSessionId(sessionId);
			// Search across all projects for the session ID
			try {
				const projectsDir = join(base, "projects");
				const projects = await readdir(projectsDir);
				for (const project of projects) {
					const path = join(projectsDir, project, `${sessionId}.json`);
					try {
						const content = await readFile(path, "utf-8");
						return JSON.parse(content) as SessionMetadata;
					} catch {
						// Not in this project
					}
				}
			} catch {
				// No projects dir yet
			}
			return null;
		},

		async list(filter?): Promise<SessionMetadata[]> {
			const sessions: SessionMetadata[] = [];
			try {
				const projectsDir = join(base, "projects");
				const projects = await readdir(projectsDir);
				for (const project of projects) {
					const dir = join(projectsDir, project);
					try {
						const files = await readdir(dir);
						for (const file of files) {
							if (!file.endsWith(".json")) continue;
							try {
								const content = await readFile(join(dir, file), "utf-8");
								const metadata = JSON.parse(content) as SessionMetadata;
								if (
									!filter?.status ||
									filter.status.includes(metadata.status)
								) {
									sessions.push(metadata);
								}
							} catch {
								// Skip corrupted files
							}
						}
					} catch {
						// Skip unreadable project dirs
					}
				}
			} catch {
				// No projects dir yet
			}
			return sessions;
		},

		async update(
			sessionId: string,
			updates: Partial<SessionMetadata>,
		): Promise<void> {
			const existing = await this.get(sessionId);
			if (!existing) {
				throw new Error(`Session "${sessionId}" not found`);
			}
			const merged = { ...existing, ...updates, sessionId };
			const path = sessionPath(existing.projectKey, sessionId);
			const tmpPath = `${path}.tmp`;
			await writeFile(tmpPath, JSON.stringify(merged, null, 2), "utf-8");
			await rename(tmpPath, path);
		},

		async remove(sessionId: string): Promise<void> {
			const existing = await this.get(sessionId);
			if (!existing) return;
			try {
				await unlink(sessionPath(existing.projectKey, sessionId));
			} catch (err) {
				if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
					throw err;
				}
			}
		},

		async findOrphans(): Promise<SessionMetadata[]> {
			const all = await this.list();
			const orphans: SessionMetadata[] = [];

			for (const session of all) {
				if (TERMINAL_STATUSES.has(session.status)) continue;

				if (session.runtime === "process") {
					const pid =
						typeof session.processRef === "number"
							? session.processRef
							: Number.parseInt(String(session.processRef), 10);
					try {
						process.kill(pid, 0);
					} catch {
						orphans.push(session);
					}
				} else if (session.runtime === "tmux") {
					const sessionName = String(session.processRef);
					try {
						const result = await x("tmux", ["has-session", "-t", sessionName]);
						if (result.exitCode !== 0) {
							orphans.push(session);
						}
					} catch {
						orphans.push(session);
					}
				}
			}

			return orphans;
		},
	};
}
