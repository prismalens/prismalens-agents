# pl Command Reference

Complete reference for prismalens CLI commands available to investigation agents.

## pl report

Append investigation output to `findings.jsonl`. Every call creates one event. `agentId` and `timestamp` are added automatically.

### pl report finding

```bash
# Report a hypothesis
pl report finding --type hypothesis --description "OOM after deploy" --confidence 0.8

# Report evidence linked to a hypothesis
pl report finding --type evidence --description "Memory spike at 10:20" --source prometheus --related-to f-001

# Report an observation
pl report finding --type observation --description "No recent config changes"

# Report a recommendation
pl report finding --type recommendation --description "Add connection pool monitoring" --priority immediate
```

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--type` | `hypothesis\|evidence\|observation\|recommendation` | Yes | Finding type |
| `--description` | string | Yes | What was found |
| `--confidence` | float (0.0-1.0) | No | Confidence level (required for `hypothesis`) |
| `--source` | string | No | Where this came from (e.g., `prometheus`, `github`) |
| `--priority` | `immediate\|preventive\|monitoring` | No | For `recommendation` type |
| `--related-to` | string | No | ID of another finding this relates to |

**Output:** Finding ID to stdout (e.g., `f-001`).

### pl report status

Update investigation lifecycle phase.

```bash
pl report status gathering
pl report status analyzing
pl report status resolving
```

### pl report complete

Complete the investigation with root cause.

```bash
pl report complete --root-cause "Deploy v2.3.1 introduced pg-pool-v2 with default 5 connections" --confidence 0.85
```

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--root-cause` | string | Yes | Identified root cause |
| `--confidence` | float (0.0-1.0) | Yes | Confidence in root cause |

### pl report error

Report a non-fatal error or blocker.

```bash
pl report error "Unable to access Alertmanager: connection refused"
```

## pl dispatch

Spawn and manage investigation sub-agents. Only callable by the orchestrator.

### Spawn a sub-agent

```bash
pl dispatch --role gatherer --task "Check Alertmanager for firing alerts related to payment-api"
pl dispatch --role analyst --task "Analyze commit abc123 for connection pool changes"
pl dispatch --role resolver --task "Draft rollback plan for v2.3.1"
```

| Flag | Type | Required | Description |
|------|------|----------|-------------|
| `--role` | `gatherer\|analyst\|resolver` | Yes | Agent role |
| `--task` | string | Yes | Task description |
| `--timeout` | number | No | Agent timeout in seconds (default: 120) |

**Output:** Agent ID to stdout (e.g., `agent-001`).

### List sub-agents

```bash
pl dispatch --list
```

Returns JSON array with `agentId`, `role`, `task`, `status`, `pid`, `startedAt`, `durationMs`, `findingsCount`.

### Read sub-agent output

```bash
pl dispatch --output agent-001
```

Returns findings from `findings.jsonl` matching `agentId: "agent-001"`.

### Kill a sub-agent

```bash
pl dispatch --kill agent-001
```

## pl status

Show investigation budget and progress.

```bash
pl status
```

Returns: budget remaining (tokens, time), active sub-agents count, elapsed time, findings count.

Use this before each dispatch round to check remaining budget.
