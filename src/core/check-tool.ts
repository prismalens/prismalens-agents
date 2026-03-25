import { x } from "tinyexec";

export interface ToolCheckResult {
	available: boolean;
	version?: string;
}

/**
 * Check if a CLI tool is installed and get its version.
 * Uses `which` to check availability, then `<tool> --version` for version info.
 */
export async function checkCommand(name: string): Promise<ToolCheckResult> {
	try {
		const whichResult = await x("which", [name], { throwOnError: true });
		if (whichResult.exitCode !== 0) {
			return { available: false };
		}
	} catch {
		return { available: false };
	}

	try {
		const versionResult = await x(name, ["--version"]);
		const firstLine = versionResult.stdout.split("\n")[0]?.trim();
		if (firstLine) {
			return { available: true, version: firstLine };
		}
		return { available: true };
	} catch {
		// Tool exists (which found it) but --version failed — still available
		return { available: true };
	}
}
