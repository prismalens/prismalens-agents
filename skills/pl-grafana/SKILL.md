---
name: pl-grafana
description: >-
  Grafana HTTP API investigation skill for prismalens agents.
  Use when investigating incidents that require dashboard context, alert rule inspection,
  data source discovery, annotation lookup, or proxying metric/log queries through Grafana.
  Covers firing alert rules, dashboard panel extraction, datasource proxy queries,
  and annotation time-range searches. curl-only (no official CLI).
compatibility: Requires curl and jq. Grafana 9+ HTTP API. Works with any agent backend.
---

# Grafana Investigation Skill

Query Grafana's HTTP API to gather dashboard context, alert state, and proxy data source queries during incident investigations.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GRAFANA_URL` | Yes | Base URL of the Grafana instance (e.g., `https://grafana.example.com`) |
| `GRAFANA_API_KEY` | Yes | API key or service account token with appropriate permissions |

## Quick Reference

All commands use the same auth pattern:

```bash
AUTH="Authorization: Bearer $GRAFANA_API_KEY"
BASE="$GRAFANA_URL"
```

| Task | Command |
|------|---------|
| List all datasources | `curl -s -H "$AUTH" "$BASE/api/datasources" \| jq '.[] \| {id, name, type}'` |
| Search dashboards | `curl -s -H "$AUTH" "$BASE/api/search?query=payment&type=dash-db" \| jq '.[] \| {uid, title}'` |
| Get dashboard by UID | `curl -s -H "$AUTH" "$BASE/api/dashboards/uid/<uid>" \| jq '.dashboard.panels[] \| {id, title, type}'` |
| List firing alert rules | `curl -s -H "$AUTH" "$BASE/api/v1/provisioning/alert-rules" \| jq '[.[] \| select(.execErrState == "Alerting" or .noDataState == "Alerting")]'` |
| Query Prometheus via proxy | `curl -s -H "$AUTH" "$BASE/api/datasources/proxy/<ds-id>/api/v1/query?query=up" \| jq '.data.result'` |
| Annotations in time range | `curl -s -H "$AUTH" "$BASE/api/annotations?from=<epoch_ms>&to=<epoch_ms>" \| jq '.[] \| {text, tags, time}'` |

## Authentication

Grafana supports three auth methods. For automation, use API keys or service account tokens.

```bash
# API key or service account token (preferred)
curl -s -H "Authorization: Bearer $GRAFANA_API_KEY" "$GRAFANA_URL/api/org"

# Basic auth (fallback)
curl -s -u "admin:$GRAFANA_PASSWORD" "$GRAFANA_URL/api/org"
```

Verify your token works before proceeding:

```bash
curl -s -H "Authorization: Bearer $GRAFANA_API_KEY" "$GRAFANA_URL/api/org" | jq '.name'
```

If this returns a 401 or 403, the token is invalid or lacks permissions.

## Investigation Patterns

### 1. List Firing Alert Rules

Retrieve all provisioned alert rules and filter for those in a firing or error state.

```bash
# Get all alert rules
curl -s -H "Authorization: Bearer $GRAFANA_API_KEY" \
  "$GRAFANA_URL/api/v1/provisioning/alert-rules" | jq '
  [.[] | {
    title: .title,
    uid: .uid,
    folder: .folderUID,
    condition: .condition,
    labels: .labels,
    for: .for
  }]'
```

To check which alerts are actually firing right now, query the Alertmanager-compatible endpoint:

```bash
# Get currently firing alerts (Grafana's built-in Alertmanager)
curl -s -H "Authorization: Bearer $GRAFANA_API_KEY" \
  "$GRAFANA_URL/api/alertmanager/grafana/api/v2/alerts?active=true&silenced=false&inhibited=false" | jq '
  [.[] | {
    alertname: .labels.alertname,
    severity: .labels.severity,
    state: .status.state,
    startsAt: .startsAt,
    annotations: .annotations
  }]'
```

### 2. Get Dashboard Context

Dashboards provide investigation context: which metrics are monitored and how panels are configured.

```bash
# Step 1: Find the dashboard UID by searching
curl -s -H "Authorization: Bearer $GRAFANA_API_KEY" \
  "$GRAFANA_URL/api/search?query=payment-api&type=dash-db" | jq '.[] | {uid, title, url}'

# Step 2: Fetch the full dashboard by UID
curl -s -H "Authorization: Bearer $GRAFANA_API_KEY" \
  "$GRAFANA_URL/api/dashboards/uid/abc123def" | jq '{
    title: .dashboard.title,
    tags: .dashboard.tags,
    panels: [.dashboard.panels[] | {
      id: .id,
      title: .title,
      type: .type,
      datasource: .datasource,
      targets: .targets
    }]
  }'
```

Extract specific panel queries to understand what metrics the team monitors:

```bash
# Extract all PromQL expressions from a dashboard
curl -s -H "Authorization: Bearer $GRAFANA_API_KEY" \
  "$GRAFANA_URL/api/dashboards/uid/abc123def" | jq '
  [.dashboard.panels[] | .targets[]? | {
    refId: .refId,
    expr: .expr,
    legendFormat: .legendFormat
  }] | map(select(.expr != null))'
```

### 3. Proxy Queries to Data Sources

Grafana can proxy requests to configured data sources. This avoids needing direct network access to Prometheus, Loki, or other backends.

```bash
# Step 1: List datasources to find the ID
curl -s -H "Authorization: Bearer $GRAFANA_API_KEY" \
  "$GRAFANA_URL/api/datasources" | jq '.[] | {id, name, type, url}'

# Step 2: Query Prometheus through the proxy
curl -s -H "Authorization: Bearer $GRAFANA_API_KEY" \
  "$GRAFANA_URL/api/datasources/proxy/1/api/v1/query" \
  --data-urlencode 'query=rate(http_requests_total{service="payment-api",code=~"5.."}[5m])' | jq '.data.result'

# Step 3: Range query for time-series data
curl -s -H "Authorization: Bearer $GRAFANA_API_KEY" \
  "$GRAFANA_URL/api/datasources/proxy/1/api/v1/query_range" \
  --data-urlencode 'query=rate(http_requests_total{service="payment-api"}[5m])' \
  --data-urlencode "start=$(date -d '1 hour ago' +%s)" \
  --data-urlencode "end=$(date +%s)" \
  --data-urlencode 'step=60' | jq '.data.result'

# Query Loki through the proxy
curl -s -H "Authorization: Bearer $GRAFANA_API_KEY" \
  "$GRAFANA_URL/api/datasources/proxy/2/loki/api/v1/query_range" \
  --data-urlencode 'query={app="payment-api"} |= "error"' \
  --data-urlencode "start=$(date -d '1 hour ago' +%s)000000000" \
  --data-urlencode "end=$(date +%s)000000000" \
  --data-urlencode 'limit=100' | jq '.data.result'
```

### 4. List Annotations in Time Range

Annotations mark deployments, incidents, and manual events on dashboards. They are critical for correlating changes with problems.

```bash
# Get annotations in the last 2 hours
NOW_MS=$(($(date +%s) * 1000))
TWO_HOURS_AGO_MS=$(($NOW_MS - 7200000))

curl -s -H "Authorization: Bearer $GRAFANA_API_KEY" \
  "$GRAFANA_URL/api/annotations?from=$TWO_HOURS_AGO_MS&to=$NOW_MS" | jq '
  [.[] | {
    id: .id,
    text: .text,
    tags: .tags,
    time: (.time / 1000 | todate),
    dashboardUID: .dashboardUID
  }]'

# Filter annotations by tag (e.g., deploy markers)
curl -s -H "Authorization: Bearer $GRAFANA_API_KEY" \
  "$GRAFANA_URL/api/annotations?from=$TWO_HOURS_AGO_MS&to=$NOW_MS&tags=deploy" | jq '
  [.[] | {text, tags, time: (.time / 1000 | todate)}]'
```

### 5. Get Datasource Info

Discover what data sources are available and their configuration.

```bash
# List all datasources with connection details
curl -s -H "Authorization: Bearer $GRAFANA_API_KEY" \
  "$GRAFANA_URL/api/datasources" | jq '
  [.[] | {
    id: .id,
    uid: .uid,
    name: .name,
    type: .type,
    url: .url,
    isDefault: .isDefault,
    access: .access
  }]'

# Get a specific datasource by ID
curl -s -H "Authorization: Bearer $GRAFANA_API_KEY" \
  "$GRAFANA_URL/api/datasources/1" | jq '{name, type, url, access, database}'
```

## Output Parsing Patterns

### Extract panel queries from a dashboard

```bash
# Get all unique PromQL expressions across all panels
curl -s -H "Authorization: Bearer $GRAFANA_API_KEY" \
  "$GRAFANA_URL/api/dashboards/uid/<uid>" | jq '
  [.dashboard.panels[] | .targets[]? | .expr // empty] | unique'
```

### Extract alert rule conditions

```bash
# Parse alert rule data queries and conditions
curl -s -H "Authorization: Bearer $GRAFANA_API_KEY" \
  "$GRAFANA_URL/api/v1/provisioning/alert-rules" | jq '
  [.[] | {
    title: .title,
    condition: .condition,
    queries: [.data[] | {refId: .refId, model: .model.expr?}]
  }]'
```

### Map datasource UIDs to names

Dashboards reference datasources by UID. Resolve them to human-readable names:

```bash
# Build a UID-to-name lookup
curl -s -H "Authorization: Bearer $GRAFANA_API_KEY" \
  "$GRAFANA_URL/api/datasources" | jq 'map({(.uid): .name}) | add'
```

## Gotchas

- **Dashboard UID vs ID**: API endpoints use `uid` (string like `abc123def`), not the numeric `id`. The search endpoint returns both — always use `uid`.
- **Datasource proxy permissions**: The API key must have `Admin` role or specific datasource permissions to use `/api/datasources/proxy/`. Viewer tokens will get 403.
- **Datasource proxy uses numeric ID**: Unlike dashboards, the proxy endpoint `/api/datasources/proxy/<id>/` requires the numeric `id`, not the `uid`.
- **Annotation timestamps are milliseconds**: The `from` and `to` params for `/api/annotations` expect epoch milliseconds, not seconds.
- **API key scope**: API keys are scoped to an organization. If Grafana has multiple orgs, the key only accesses resources in its org.
- **Service account tokens vs API keys**: API keys are deprecated in Grafana 10+. Prefer service account tokens, which use the same `Bearer` auth header.
- **Provisioned alert rules**: `/api/v1/provisioning/alert-rules` returns rule definitions, not their current firing state. Use the Alertmanager-compatible endpoint for live alert state.
- **Rate limiting**: Large Grafana instances may enforce rate limits. Space out bulk queries. Check for `429` responses.
- **Folder permissions**: Dashboard search results are filtered by the API key's folder permissions. Missing dashboards may be a permissions issue, not absence.

## API Reference

See [references/api-reference.md](references/api-reference.md) for full endpoint documentation, request/response schemas, and authentication details.
