import { x } from "tinyexec";

const REPO_PATTERN =
	/(?:github\.com|gitlab\.com|bitbucket\.org)[/:](.+?)(?:\.git)?$/;

/**
 * Auto-detect repository owner/repo from CWD's git remote origin.
 * Returns undefined if not a git repo, no remote, or parse fails.
 */
export async function detectRepo(): Promise<string | undefined> {
	try {
		const result = await x("git", ["remote", "get-url", "origin"]);
		const remoteUrl = result.stdout.trim();
		const match = remoteUrl.match(REPO_PATTERN);
		return match?.[1];
	} catch {
		return undefined;
	}
}
