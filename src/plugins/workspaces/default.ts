import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type {
	WorkspaceHandle,
	WorkspaceOptions,
	WorkspacePlugin,
} from "../../types/plugins.js";

function resolveBaseDir(baseDir: string): string {
	if (baseDir.startsWith("~")) {
		return resolve(homedir(), baseDir.slice(2));
	}
	return resolve(baseDir);
}

export class DefaultWorkspace implements WorkspacePlugin {
	private readonly baseDir: string;

	constructor(baseDir = "~/.prismalens") {
		this.baseDir = resolveBaseDir(baseDir);
	}

	async create(
		investigationId: string,
		options?: WorkspaceOptions,
	): Promise<WorkspaceHandle> {
		const dir = options?.baseDir
			? join(resolveBaseDir(options.baseDir), investigationId)
			: join(this.baseDir, investigationId);

		// Create directory tree
		await mkdir(join(dir, "stdout"), { recursive: true });

		// Write initial files
		await writeFile(join(dir, "findings.jsonl"), "", "utf-8");
		await writeFile(join(dir, "pids.json"), "{}\n", "utf-8");

		return { investigationId, path: dir };
	}

	getPath(handle: WorkspaceHandle): string {
		return handle.path;
	}
}
