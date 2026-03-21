---
name: pl-methodology
description: >-
  Structured incident investigation methodology for the prismalens orchestrator agent.
  Use when investigating alerts, errors, outages, or performance degradations.
  Teaches phased investigation (gather, correlate, hypothesize, validate, report),
  sub-agent dispatch strategy, convergence criteria, and root cause reporting format.
compatibility: Requires prismalens-agents CLI (pl) installed. Works with any agent backend (claude, deepagents, opencode).
---

# Investigation Methodology

Systematic approach to incident investigation using the prismalens orchestrator.

## Investigation Phases

### Phase 1: Gather

Collect raw data from all available sources before forming conclusions.

1. Read `context.json` to understand what triggered this investigation
2. Identify all configured alert sources and their availability
3. Query each available source for related signals within ±30 minutes of the trigger
4. Report each data point as a finding immediately — never batch

```bash
# Report raw observations as you find them
pl report finding --type observation --description "Memory usage at 95% since 10:20" --source prometheus
pl report finding --type observation --description "Deploy v2.3.1 merged at 10:15" --source github
```

### Phase 2: Correlate

Connect signals across sources to identify patterns.

**Correlation strategies:**

| Strategy | How | Example |
|----------|-----|---------|
| Label matching | Same service/namespace across sources | Alertmanager `service=payment-api` + Sentry `project=payment-api` |
| Time window | Events within ±30 min of trigger | OOM at 10:20 + deploy at 10:15 |
| Dependency chain | Upstream/downstream of affected service | payment-api depends on postgres → check postgres |
| Deploy correlation | Recent deploys to affected service | Deploy v2.3.1 at 10:15, errors at 10:20 |

### Phase 3: Hypothesize

Form testable hypotheses from correlated data.

```bash
# Each hypothesis MUST include what evidence would confirm or refute it
pl report finding --type hypothesis \
  --description "Deploy v2.3.1 introduced connection pool regression — new dependency pg-pool-v2 defaults to 5 connections vs previous 20" \
  --confidence 0.6
```

**Good hypothesis:** Specific, testable, references concrete evidence.
**Bad hypothesis:** Vague ("something is wrong with the database").

### Phase 4: Validate

Test each hypothesis by gathering targeted evidence.

- Dispatch focused sub-agents to validate specific hypotheses
- Each validation task should target one hypothesis
- Report evidence with `--related-to` linking to the hypothesis ID

```bash
pl dispatch --role analyst --task "Compare pg-pool connection settings between v2.3.0 and v2.3.1 in org/payment-api"
```

### Phase 5: Report

Synthesize validated findings into a root cause report.

```bash
pl report complete \
  --root-cause "Deploy v2.3.1 introduced pg-pool-v2 with default 5 connections (previous pg-pool defaulted to 20), causing connection exhaustion under load" \
  --confidence 0.85
```

## Sub-Agent Dispatch Strategy

### When to dispatch

- Data gathering from external sources (logs, metrics, commits, alerts)
- Focused analysis of a specific data source
- Resolving contradictory findings from prior agents

### When to handle directly

- Reasoning over existing findings
- Deciding what to investigate next
- Synthesizing root cause from confirmed hypotheses
- Checking budget (`pl status`)

### Parallel vs sequential

**Parallel** — independent data gathering from different sources:
```bash
pl dispatch --role gatherer --task "Query Alertmanager for firing alerts on payment-api"
pl dispatch --role gatherer --task "Query Prometheus for error rate and resource metrics on payment-api"
pl dispatch --role gatherer --task "Check GitHub for recent deploys and commits to org/payment-api"
```

**Sequential** — when task B depends on task A:
```bash
# First: identify the deploy
pl dispatch --role gatherer --task "Find most recent deploy to payment-api"
# After results: analyze the specific commit
pl dispatch --role analyst --task "Analyze commit abc123 for connection pool changes"
```

## Stopping Conditions

Stop investigating when ANY condition is met:

| Condition | Action |
|-----------|--------|
| Root cause confidence >= 0.85 | Report immediately |
| Confidence 0.7-0.84 with 2+ corroborating sources | Report |
| All checklist items resolved | Synthesize and report |
| 3 rounds with no new information | Convergence — report with available findings |
| Budget below 5% | Report with best available hypothesis |

## Handling Contradictions

When sub-agents return contradictory findings:

1. Do not ignore the contradiction
2. Dispatch a focused sub-agent to investigate the discrepancy directly
3. The resolution often reveals the actual root cause

Example: logs say "no errors" but metrics show error rate spike → investigate metric source directly (wrong service label? different time window? different error classification?).

## Alert Storm Handling

When >10 alerts fire within 60 seconds:

1. Find shared labels across alerts (common service, namespace, or dependency)
2. Identify the upstream cause — investigate the shared dependency, not each downstream symptom
3. Single investigation task for the root service, not 50 separate tasks

## Gotchas

- Always check `pl status` before dispatching — budget awareness prevents wasted work
- Report findings immediately as discovered — the orchestrator and UI consume them in real-time
- Use `--related-to` to link evidence to hypotheses — this enables automated correlation
- A self-healing incident (alert resolves mid-investigation) still needs root cause analysis — the resolution timing itself is evidence
- Flapping alerts (>3 fire/resolve cycles in 30 min) indicate an intermittent issue — investigate the pattern, not individual occurrences

## pl Command Reference

See [references/pl-commands.md](references/pl-commands.md) for full `pl report`, `pl dispatch`, and `pl status` usage with examples.
