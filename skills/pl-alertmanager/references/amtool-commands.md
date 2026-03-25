# amtool Command Reference

Investigation-oriented reference for `amtool`, the Alertmanager CLI.

## Configuration

### Alertmanager URL

Set once per session or pass with every command:

```bash
# Environment variable (recommended)
export ALERTMANAGER_URL="http://alertmanager:9093"

# Per-command flag (overrides env var)
amtool alert query --alertmanager.url="http://alertmanager:9093"

# Config file (~/.config/amtool/config.yml)
# alertmanager.url: http://alertmanager:9093
```

Priority: `--alertmanager.url` flag > config file > `$ALERTMANAGER_URL` env var.

## amtool alert query

Query alerts from Alertmanager. Primary investigation command.

### Basic Usage

```bash
# All firing alerts (default: hides silenced and inhibited)
amtool alert query

# Formatted table output (default)
Alertname        Starts At                Summary
HighErrorRate    2024-03-15 10:20:00 UTC  Error rate above 10% for payment-api
HighLatency      2024-03-15 10:18:00 UTC  P99 latency above 500ms for payment-api
```

### Label Matchers

Matchers filter alerts by labels. Multiple matchers use AND logic.

```bash
# Exact match
amtool alert query service=payment-api

# Multiple matchers (AND)
amtool alert query service=payment-api severity=critical

# Regex match
amtool alert query namespace=~"prod.*"

# Negative match
amtool alert query service!=test-service

# Negative regex
amtool alert query namespace!~"dev.*|staging.*"
```

### Flags

| Flag | Description |
|------|-------------|
| `--inhibited` | Include inhibited alerts (excluded by default) |
| `--silenced` | Include silenced alerts (excluded by default) |
| `--active` | Include active alerts (included by default) |
| `--output=json` | JSON output for programmatic parsing |
| `--output=simple` | Simplified table output |
| `--alertmanager.url` | Alertmanager URL |

### JSON Output

```bash
amtool alert query --output=json
```

Returns the same JSON structure as `/api/v2/alerts`:

```json
[
  {
    "labels": {
      "alertname": "HighErrorRate",
      "service": "payment-api",
      "severity": "critical"
    },
    "annotations": {
      "summary": "Error rate above 10%"
    },
    "startsAt": "2024-03-15T10:20:00.000Z",
    "endsAt": "0001-01-01T00:00:00.000Z",
    "generatorURL": "http://prometheus:9090/graph?g0.expr=...",
    "fingerprint": "a1b2c3d4e5f6",
    "status": {
      "state": "active",
      "silencedBy": [],
      "inhibitedBy": []
    }
  }
]
```

### Investigation Examples

```bash
# Full sweep — all alerts including suppressed
amtool alert query --inhibited --silenced --output=json

# Critical alerts in production
amtool alert query severity=critical namespace=production --output=json

# All alerts for a team
amtool alert query team=payments --output=json

# Pipe to jq for targeted extraction
amtool alert query --output=json | jq '.[] | {
  alert: .labels.alertname,
  service: .labels.service,
  state: .status.state,
  since: .startsAt
}'
```

## amtool silence

Manage silences. Useful for auditing what is being suppressed during an investigation.

### amtool silence query

List active silences.

```bash
# All active silences
amtool silence query

# Output
ID                                    Matchers                 Ends At                  Created By       Comment
silence-uuid-1234                     service=payment-api      2024-03-15 12:00:00 UTC  oncall@example   Maintenance window
```

```bash
# Filter silences by matcher
amtool silence query service=payment-api

# JSON output
amtool silence query --output=json
```

### amtool silence add

Create a silence. Useful during investigation to temporarily suppress alert noise while working on a known issue.

```bash
# Silence alerts for a service for 2 hours
amtool silence add service=payment-api \
  --author="investigator@example.com" \
  --comment="Silencing during active investigation, ticket INC-1234" \
  --duration=2h

# Silence with expiry time
amtool silence add service=payment-api \
  --author="investigator@example.com" \
  --comment="Maintenance window" \
  --expires="2024-03-15T12:00:00Z"

# Output: silence ID
# silence-uuid-5678
```

### amtool silence expire

Remove a silence immediately.

```bash
# Expire a specific silence by ID
amtool silence expire silence-uuid-1234

# Expire all silences (use with caution)
amtool silence expire $(amtool silence query -q)
```

## amtool config routes

Inspect alert routing configuration. Useful to understand why an alert is or is not reaching a specific receiver.

### amtool config routes show

Display the routing tree.

```bash
amtool config routes show
```

Output:

```
Routing tree:
.
└── default-route  receiver: default
    ├── {severity="critical"}  receiver: pagerduty-critical
    ├── {severity="warning"}  receiver: slack-warnings
    └── {alertname=~"Watchdog.*"}  receiver: null
```

### amtool config routes test

Test which receiver an alert would be routed to.

```bash
# Test routing for a specific label set
amtool config routes test service=payment-api severity=critical

# Output
pagerduty-critical
```

**Investigation use:** If an alert is not reaching the expected notification channel, test its label set against the routing tree to identify misconfigured routes.

## Common Patterns

### Full investigation sweep

```bash
# Capture everything — active, silenced, inhibited — in JSON
amtool alert query --inhibited --silenced --output=json > /tmp/all-alerts.json

# Count by state
cat /tmp/all-alerts.json | jq 'group_by(.status.state) | map({state: .[0].status.state, count: length})'

# Count by severity
cat /tmp/all-alerts.json | jq 'group_by(.labels.severity) | map({severity: .[0].labels.severity, count: length})'

# List unique affected services
cat /tmp/all-alerts.json | jq '[.[].labels.service] | unique'
```

### Check if an alert is being silenced

```bash
# Query the specific alert including silenced state
amtool alert query alertname=HighErrorRate service=payment-api --silenced --output=json \
  | jq '.[] | {alert: .labels.alertname, state: .status.state, silencedBy: .status.silencedBy}'
```

### Verify routing

```bash
# Where would this alert go?
amtool config routes test severity=critical namespace=production service=payment-api
```
