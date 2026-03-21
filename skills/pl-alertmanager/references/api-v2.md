# Alertmanager API v2 Reference

Investigation-oriented reference for the Alertmanager HTTP API v2 endpoints.

Base URL: `$ALERTMANAGER_URL/api/v2`

## Authentication

Alertmanager has no built-in authentication. It is typically deployed behind a reverse proxy (nginx, Traefik, OAuth2 Proxy) that handles auth. If requests return 401 or 403, the issue is at the proxy layer, not Alertmanager.

## GET /api/v2/status

Alertmanager instance status and cluster membership.

```bash
curl -s "$ALERTMANAGER_URL/api/v2/status" | jq .
```

Response:

```json
{
  "cluster": {
    "name": "01HQXYZ...",
    "status": "ready",
    "peers": [
      {
        "name": "alertmanager-0",
        "address": "10.0.0.1:9094"
      },
      {
        "name": "alertmanager-1",
        "address": "10.0.0.2:9094"
      }
    ]
  },
  "versionInfo": {
    "version": "0.27.0",
    "branch": "HEAD",
    "buildDate": "2024-02-28T14:22:00Z",
    "goVersion": "go1.21.7"
  },
  "config": {
    "original": "route:\n  receiver: default\n  ..."
  },
  "uptime": "2024-03-01T08:00:00.000Z"
}
```

**Investigation use:** Check cluster health and peer count. If peers are missing, alerts may not be deduplicated properly.

## GET /api/v2/alerts

Retrieve alerts. This is the primary investigation endpoint.

```bash
curl -s "$ALERTMANAGER_URL/api/v2/alerts" | jq .
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `active` | bool | `true` | Include active (firing) alerts |
| `silenced` | bool | `true` | Include silenced alerts |
| `inhibited` | bool | `true` | Include inhibited alerts |
| `unprocessed` | bool | `true` | Include unprocessed alerts |
| `filter` | string[] | — | PromQL-style label matchers. Repeat for multiple filters. |
| `receiver` | string | — | Filter by receiver name |

### Filter Syntax

Filters use PromQL matcher syntax, URL-encoded:

| Matcher | Meaning | URL-encoded |
|---------|---------|-------------|
| `service="payment-api"` | Exact match | `filter=service%3D%22payment-api%22` |
| `service!="payment-api"` | Not equal | `filter=service%21%3D%22payment-api%22` |
| `namespace=~"prod.*"` | Regex match | `filter=namespace%3D~%22prod.*%22` |
| `namespace!~"test.*"` | Negative regex | `filter=namespace%21~%22test.*%22` |

Multiple filters (AND logic):

```bash
curl -s "$ALERTMANAGER_URL/api/v2/alerts?filter=service%3D%22payment-api%22&filter=severity%3D%22critical%22"
```

### Response Format

Array of alert objects:

```json
[
  {
    "annotations": {
      "summary": "High error rate on payment-api",
      "description": "Error rate is 15% for the last 5 minutes",
      "runbook_url": "https://runbooks.example.com/high-error-rate"
    },
    "endsAt": "0001-01-01T00:00:00.000Z",
    "startsAt": "2024-03-15T10:20:00.000Z",
    "updatedAt": "2024-03-15T10:25:00.000Z",
    "fingerprint": "a]b1c2d3e4f5",
    "receivers": [
      { "name": "pagerduty-critical" }
    ],
    "status": {
      "state": "active",
      "silencedBy": [],
      "inhibitedBy": []
    },
    "labels": {
      "alertname": "HighErrorRate",
      "service": "payment-api",
      "namespace": "production",
      "severity": "critical",
      "team": "payments"
    },
    "generatorURL": "http://prometheus:9090/graph?g0.expr=rate(http_errors_total[5m])>0.1"
  }
]
```

### Key Response Fields

| Field | Description |
|-------|-------------|
| `labels` | Full label set. Used for matching, grouping, and correlation. |
| `labels.alertname` | Name of the alerting rule that fired. |
| `annotations` | Human-readable context: summary, description, runbook URL. |
| `status.state` | `active` (firing), `suppressed` (silenced or inhibited), `unprocessed` (pending). |
| `status.silencedBy` | Array of silence IDs suppressing this alert. Empty if not silenced. |
| `status.inhibitedBy` | Array of alert fingerprints inhibiting this alert. Empty if not inhibited. |
| `startsAt` | ISO 8601 timestamp when the alert started firing. |
| `endsAt` | ISO 8601 timestamp. `0001-01-01T00:00:00.000Z` means still firing. A future time means auto-resolve deadline. |
| `fingerprint` | Hash of the label set. Unique identifier for this alert instance. |
| `generatorURL` | Link to the Prometheus expression that generated the alert. |
| `receivers` | Which receivers this alert was routed to. |

### Common Investigation Queries

```bash
# Only active, non-silenced, non-inhibited alerts
curl -s "$ALERTMANAGER_URL/api/v2/alerts?active=true&silenced=false&inhibited=false" | jq .

# Only silenced alerts (find what's being hidden)
curl -s "$ALERTMANAGER_URL/api/v2/alerts?active=false&silenced=true&inhibited=false" | jq .

# Only inhibited alerts (find cascade effects)
curl -s "$ALERTMANAGER_URL/api/v2/alerts?active=false&silenced=false&inhibited=true" | jq .

# Alerts for a specific receiver
curl -s "$ALERTMANAGER_URL/api/v2/alerts?receiver=pagerduty-critical" | jq .

# Critical alerts in production namespace
curl -s "$ALERTMANAGER_URL/api/v2/alerts?filter=severity%3D%22critical%22&filter=namespace%3D%22production%22" | jq .
```

## GET /api/v2/alerts/groups

Alerts organized by grouping labels (as configured in Alertmanager's `group_by`).

```bash
curl -s "$ALERTMANAGER_URL/api/v2/alerts/groups" | jq .
```

### Query Parameters

Same as `/api/v2/alerts`: `active`, `silenced`, `inhibited`, `unprocessed`, `filter`, `receiver`.

### Response Format

```json
[
  {
    "labels": {
      "alertname": "HighErrorRate",
      "namespace": "production"
    },
    "receiver": {
      "name": "pagerduty-critical"
    },
    "alerts": [
      {
        "labels": { "alertname": "HighErrorRate", "service": "payment-api", "namespace": "production" },
        "status": { "state": "active", "silencedBy": [], "inhibitedBy": [] },
        "startsAt": "2024-03-15T10:20:00.000Z",
        "endsAt": "0001-01-01T00:00:00.000Z",
        "fingerprint": "a1b2c3d4e5f6"
      }
    ]
  }
]
```

**Investigation use:** See how Alertmanager groups alerts for notification. Alerts in the same group share `group_by` labels and are sent as a single notification. Useful for understanding alert routing behavior.

## GET /api/v2/silences

List all silences (active, pending, and expired).

```bash
curl -s "$ALERTMANAGER_URL/api/v2/silences" | jq .
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `filter` | string[] | — | PromQL-style label matchers to match against silence matchers |

### Response Format

```json
[
  {
    "id": "silence-uuid-1234",
    "status": {
      "state": "active"
    },
    "updatedAt": "2024-03-15T09:00:00.000Z",
    "comment": "Silencing during maintenance window",
    "createdBy": "oncall@example.com",
    "startsAt": "2024-03-15T09:00:00.000Z",
    "endsAt": "2024-03-15T12:00:00.000Z",
    "matchers": [
      {
        "name": "service",
        "value": "payment-api",
        "isRegex": false,
        "isEqual": true
      },
      {
        "name": "namespace",
        "value": "production",
        "isRegex": false,
        "isEqual": true
      }
    ]
  }
]
```

### Silence States

| State | Meaning |
|-------|---------|
| `active` | Currently suppressing matching alerts |
| `pending` | Scheduled but not yet active (`startsAt` is in the future) |
| `expired` | Past `endsAt` or manually expired |

### Key Fields

| Field | Description |
|-------|-------------|
| `matchers` | Label matchers defining which alerts this silence suppresses. |
| `matchers[].isRegex` | If `true`, `value` is a regex pattern. |
| `matchers[].isEqual` | If `true`, match equals. If `false`, match not-equals. |
| `createdBy` | Who created the silence. Useful for tracing back to a person or automation. |
| `comment` | Reason for the silence. Check for maintenance windows or known-issue markers. |

**Investigation use:** Active silences may hide alerts relevant to the incident. Always check if the service under investigation has active silences. Note `createdBy` and `comment` for context.

## GET /api/v2/receivers

List all configured receivers.

```bash
curl -s "$ALERTMANAGER_URL/api/v2/receivers" | jq .
```

### Response Format

```json
[
  { "name": "default" },
  { "name": "pagerduty-critical" },
  { "name": "slack-warnings" },
  { "name": "null" }
]
```

**Investigation use:** Verify that the expected receiver exists. If alerts are not reaching the expected channel, check routing rules with `amtool config routes show` or inspect the full config from `/api/v2/status`.
