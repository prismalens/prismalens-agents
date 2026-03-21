---
name: pl-alertmanager
description: >-
  Alertmanager investigation skill for prismalens agents.
  Use when investigating firing alerts, alert storms, inhibited or silenced alerts,
  or when correlating Alertmanager data with other incident signals.
  Teaches query patterns using amtool (preferred) with curl fallback,
  alert storm detection, flapping analysis, silence auditing, and label-based correlation.
compatibility: Requires amtool CLI or curl+jq. Set ALERTMANAGER_URL env var.
---

# Alertmanager Investigation

Query and diagnose alerts from Alertmanager during incident investigations.

## Environment

```bash
# Required — set before any command
export ALERTMANAGER_URL="http://alertmanager:9093"
```

## Quick Reference

Prefer `amtool` when available. Fall back to `curl` + `jq` otherwise.

### amtool (preferred)

```bash
# All firing alerts
amtool alert query --alertmanager.url="$ALERTMANAGER_URL"

# Firing alerts for a specific service
amtool alert query service=payment-api --alertmanager.url="$ALERTMANAGER_URL"

# JSON output for programmatic parsing
amtool alert query --output=json --alertmanager.url="$ALERTMANAGER_URL"

# Include inhibited alerts (hidden by default)
amtool alert query --inhibited --alertmanager.url="$ALERTMANAGER_URL"

# Include silenced alerts (hidden by default)
amtool alert query --silenced --alertmanager.url="$ALERTMANAGER_URL"

# Active silences
amtool silence query --alertmanager.url="$ALERTMANAGER_URL"

# Routing tree
amtool config routes show --alertmanager.url="$ALERTMANAGER_URL"
```

### curl fallback

```bash
# All alerts (active, silenced, inhibited)
curl -s "$ALERTMANAGER_URL/api/v2/alerts" | jq .

# Filter by service label
curl -s "$ALERTMANAGER_URL/api/v2/alerts?filter=service%3D%22payment-api%22" | jq .

# Only active (not silenced, not inhibited)
curl -s "$ALERTMANAGER_URL/api/v2/alerts?active=true&silenced=false&inhibited=false" | jq .

# Alert groups
curl -s "$ALERTMANAGER_URL/api/v2/alerts/groups" | jq .

# Silences
curl -s "$ALERTMANAGER_URL/api/v2/silences" | jq .

# Alertmanager status and cluster info
curl -s "$ALERTMANAGER_URL/api/v2/status" | jq .
```

## Investigation Patterns

### 1. Query firing alerts by service or namespace

```bash
# amtool — matcher syntax: label=value, label=~regex
amtool alert query namespace=production service=payment-api \
  --alertmanager.url="$ALERTMANAGER_URL" --output=json

# curl — URL-encode the filter parameter
# Exact match: service="payment-api"
curl -s "$ALERTMANAGER_URL/api/v2/alerts?filter=service%3D%22payment-api%22" | jq .

# Regex match: namespace=~"prod.*"
curl -s "$ALERTMANAGER_URL/api/v2/alerts?filter=namespace%3D~%22prod.*%22" | jq .
```

### 2. Detect alert storms (>10 alerts in 60s)

When many alerts fire at once, find the shared labels to identify the upstream cause.

```bash
# Get all active alerts as JSON
ALERTS=$(amtool alert query --output=json --alertmanager.url="$ALERTMANAGER_URL")

# Count alerts that started in the last 60 seconds
echo "$ALERTS" | jq '[.[] | select(
  (.startsAt | fromdateiso8601) > (now - 60)
)] | length'

# Find shared labels across recent alerts
echo "$ALERTS" | jq '
  [.[] | select((.startsAt | fromdateiso8601) > (now - 60))]
  | map(.labels)
  | (map(to_entries) | flatten | group_by(.key + "=" + .value)
     | map({label: .[0].key, value: .[0].value, count: length})
     | sort_by(-.count))
'
```

Shared labels with count equal to total alerts point to the common upstream service or dependency.

### 3. Check inhibited alerts

Inhibited alerts are suppressed by inhibition rules because a higher-severity alert is firing. They often reveal cascade effects.

```bash
# amtool — inhibited alerts are hidden by default
amtool alert query --inhibited --alertmanager.url="$ALERTMANAGER_URL" --output=json

# curl — explicitly request inhibited
curl -s "$ALERTMANAGER_URL/api/v2/alerts?inhibited=true&active=false&silenced=false" \
  | jq '.[] | {alertname: .labels.alertname, service: .labels.service, status: .status.state}'
```

If many alerts are inhibited by a single parent alert, that parent is likely closer to the root cause.

### 4. Track flapping alerts (>3 fire/resolve cycles in 30 min)

Flapping indicates an intermittent issue. Alertmanager does not track history natively — check the `startsAt` and `endsAt` patterns, or query Prometheus for `ALERTS_FOR_STATE`.

```bash
# From Prometheus (if available) — count state transitions
# ALERTS{alertname="HighErrorRate", service="payment-api"}

# From Alertmanager — check if endsAt is in the past but alert is active again
# (indicates a re-fire after resolution)
curl -s "$ALERTMANAGER_URL/api/v2/alerts?filter=alertname%3D%22HighErrorRate%22" | jq '
  .[] | {
    alertname: .labels.alertname,
    service: .labels.service,
    startsAt: .startsAt,
    endsAt: .endsAt,
    state: .status.state,
    fingerprint: .fingerprint
  }
'
```

Multiple alerts with the same fingerprint but different `startsAt` values confirm flapping. Report this pattern as a finding — the flap interval itself is diagnostic data.

### 5. Find related alerts by label matching

When investigating a specific alert, find others sharing the same service, namespace, or team.

```bash
# Extract labels from the triggering alert, then query for peers
SERVICE=$(echo "$ALERT" | jq -r '.labels.service')
NAMESPACE=$(echo "$ALERT" | jq -r '.labels.namespace')

# All alerts for the same service
amtool alert query service="$SERVICE" \
  --alertmanager.url="$ALERTMANAGER_URL" --output=json

# All alerts in the same namespace (broader search)
amtool alert query namespace="$NAMESPACE" \
  --alertmanager.url="$ALERTMANAGER_URL" --output=json

# curl equivalent
curl -s "$ALERTMANAGER_URL/api/v2/alerts?filter=service%3D%22${SERVICE}%22" | jq .
```

### 6. Check silences that might hide relevant alerts

Active silences can mask related alerts. Always audit silences during investigation.

```bash
# List all active silences
amtool silence query --alertmanager.url="$ALERTMANAGER_URL"

# JSON output with matcher details
curl -s "$ALERTMANAGER_URL/api/v2/silences" | jq '
  [.[] | select(.status.state == "active")] | map({
    id: .id,
    createdBy: .createdBy,
    comment: .comment,
    matchers: .matchers,
    startsAt: .startsAt,
    endsAt: .endsAt
  })
'

# Check if a specific service has active silences
curl -s "$ALERTMANAGER_URL/api/v2/silences" | jq '
  [.[] | select(.status.state == "active")
   | select(.matchers[] | .name == "service" and .value == "payment-api")]
'
```

If a silence covers the service under investigation, note it as a finding — the silenced alerts may contain critical signals.

## Output Parsing

Alertmanager API v2 returns alerts as JSON arrays. Key fields to extract:

```bash
curl -s "$ALERTMANAGER_URL/api/v2/alerts" | jq '.[] | {
  alertname:    .labels.alertname,
  service:      .labels.service,
  namespace:    .labels.namespace,
  severity:     .labels.severity,
  state:        .status.state,
  startsAt:     .startsAt,
  endsAt:       .endsAt,
  generatorURL: .generatorURL,
  fingerprint:  .fingerprint
}'
```

| Field | Use |
|-------|-----|
| `labels.alertname` | What alert fired |
| `labels.service` | Which service is affected |
| `labels.severity` | Triage priority (critical > warning > info) |
| `status.state` | Current state: `active`, `suppressed`, `unprocessed` |
| `startsAt` | When the alert began firing (ISO 8601) |
| `endsAt` | When resolved, or `0001-01-01T00:00:00.000Z` if still firing |
| `generatorURL` | Link back to the Prometheus query that generated this alert |
| `fingerprint` | Unique hash of the alert's label set — use to track identity across fire/resolve cycles |

## Gotchas

- **amtool hides inhibited and silenced alerts by default.** Always pass `--inhibited` and `--silenced` flags when doing a full investigation sweep. Without these, you will miss suppressed alerts that may be relevant.
- **`endsAt` does not mean resolved.** A future `endsAt` value means "Alertmanager will auto-resolve at this time if no update is received." Only a past `endsAt` with `status.state != "active"` means actually resolved.
- **Filter syntax is URL-encoded in curl.** `=` becomes `%3D`, `"` becomes `%22`, `=~` becomes `%3D~`. Get this wrong and you get unfiltered results with no error.
- **Alertmanager has no built-in auth.** It is typically behind a reverse proxy. If you get 401/403, check proxy auth headers or network policies — not Alertmanager config.
- **Alert history is not stored.** Alertmanager only knows current state. For historical alert data, query Prometheus `ALERTS` or `ALERTS_FOR_STATE` metrics, or check the notification log.
- **Cluster mode returns duplicates.** When Alertmanager runs in HA cluster mode, querying individual instances may return the same alert from each peer. Query through the load balancer or deduplicate by `fingerprint`.
- **`generatorURL` can be stale.** If Prometheus was reconfigured or the recording rule changed, the URL may point to a modified or deleted query. Verify the query still works before relying on it.

## References

- [Alertmanager API v2 reference](references/api-v2.md)
- [amtool command reference](references/amtool-commands.md)
