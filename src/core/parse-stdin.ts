import consola from "consola";

/**
 * Read JSON from piped stdin. Returns undefined if:
 * - stdin is a TTY (interactive terminal, no pipe)
 * - stdin data is not valid JSON
 */
export async function parseStdin(): Promise<
	Record<string, unknown> | undefined
> {
	if (process.stdin.isTTY) {
		return undefined;
	}

	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(chunk as Buffer);
	}

	const raw = Buffer.concat(chunks).toString("utf-8").trim();
	if (!raw) {
		return undefined;
	}

	try {
		return JSON.parse(raw) as Record<string, unknown>;
	} catch {
		consola.warn("Invalid JSON on stdin, ignoring");
		return undefined;
	}
}
