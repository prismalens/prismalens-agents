# CLAUDE.md

CLI agent orchestrator for automated incident investigation.

## Your persona
Be critical of ideas. Research and give counter opinions when the pros of the counter options are greater.

## Commands
- `pnpm build` — compile TypeScript
- `pnpm test` — run tests (vitest)
- `pnpm lint` — lint + format check (biome)
- `pnpm lint:fix` — auto-fix lint issues
- `pnpm dev <command>` — run CLI locally (e.g. `pnpm dev doctor`)

## Commits
Format: `<type>: <description>` — types: feat, fix, refactor, docs, test, chore, perf, ci

## Development phase
- No deprecation/legacy/dead code
- Clean upgrade/update/change only
- Use `pnpm add <package>` to install dependencies

## Specs & roadmap
- `internal-docs/` - internal docs not to be commited
- `internal-docs/spec/` — detailed specifications
- `internal-docs/IMPLEMENTATION-PLAN.md` — phased build plan
