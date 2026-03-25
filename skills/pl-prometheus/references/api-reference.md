# Prometheus HTTP API Reference

Base URL: `$PROMETHEUS_URL/api/v1`

All responses use the JSON envelope:

```json
{
  "status": "success" | "error",
  "data": {
    "resultType": "vector" | "matrix" | "scalar" | "string",
    "result": [...]
  },
  "errorType": "...",
  "error": "...",
  "warnings": ["..."]
}
```

## Endpoints

### GET /api/v1/query

Instant query — evaluates expression at a single point in time.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `query` | Yes | PromQL expression |
| `time` | No | Evaluation timestamp (RFC3339 or Unix). Defaults to now |
| `timeout` | No | Query timeout (e.g., `30s`). Defaults to server `-query.timeout` |

```bash
curl -sG "$PROMETHEUS_URL/api/v1/query" \
  --data-urlencode 'query=up{job="payment-api"}' \
  --data-urlencode 'time=2024-01-15T10:20:00Z'
```

**Response (vector):**

```json
{
  "status": "success",
  "data": {
    "resultType": "vector",
    "result": [
      {
        "metric": {"__name__": "up", "job": "payment-api", "instance": "10.0.1.5:8080"},
        "value": [1705312800, "1"]
      }
    ]
  }
}
```

Note: `value` is `[unix_timestamp, string_value]`. The value is always a string.

### GET /api/v1/query_range

Range query — evaluates expression over a time range.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `query` | Yes | PromQL expression |
| `start` | Yes | Start timestamp (RFC3339 or Unix) |
| `end` | Yes | End timestamp (RFC3339 or Unix) |
| `step` | Yes | Resolution step (duration string, e.g., `60s`, `5m`) |
| `timeout` | No | Query timeout |

```bash
curl -sG "$PROMETHEUS_URL/api/v1/query_range" \
  --data-urlencode 'query=rate(http_requests_total{job="payment-api"}[5m])' \
  --data-urlencode 'start=2024-01-15T10:00:00Z' \
  --data-urlencode 'end=2024-01-15T11:00:00Z' \
  --data-urlencode 'step=60s'
```

**Response (matrix):**

```json
{
  "status": "success",
  "data": {
    "resultType": "matrix",
    "result": [
      {
        "metric": {"__name__": "http_requests_total", "job": "payment-api"},
        "values": [
          [1705312800, "120.5"],
          [1705312860, "125.3"]
        ]
      }
    ]
  }
}
```

Note: `values` is an array of `[unix_timestamp, string_value]` pairs.

**Step size guidance for investigations:**

| Time range | Recommended step |
|------------|-----------------|
| < 30 min | `15s` |
| 30 min - 2 hours | `30s` - `60s` |
| 2 - 6 hours | `60s` - `120s` |
| 6 - 24 hours | `300s` |
| > 24 hours | `600s` - `3600s` |

### GET /api/v1/alerts

Returns currently active alerts.

No query parameters.

```bash
curl -s "$PROMETHEUS_URL/api/v1/alerts" | jq '.data.alerts'
```

**Response:**

```json
{
  "status": "success",
  "data": {
    "alerts": [
      {
        "labels": {"alertname": "HighErrorRate", "job": "payment-api", "severity": "critical"},
        "annotations": {"summary": "Error rate above 5%", "description": "..."},
        "state": "firing",
        "activeAt": "2024-01-15T10:15:00.000Z",
        "value": "0.08"
      }
    ]
  }
}
```

`state` values: `firing`, `pending`, `inactive`.

### GET /api/v1/rules

Returns all recording and alerting rules.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `type` | No | Filter by `alert` or `record` |

```bash
# Get alerting rules only
curl -sG "$PROMETHEUS_URL/api/v1/rules" --data-urlencode 'type=alert' | jq '.data.groups'
```

**Response:**

```json
{
  "status": "success",
  "data": {
    "groups": [
      {
        "name": "payment-api-alerts",
        "file": "/etc/prometheus/rules/payment-api.yml",
        "rules": [
          {
            "name": "HighErrorRate",
            "query": "rate(http_requests_total{status=~\"5..\"}[5m]) / rate(http_requests_total[5m]) > 0.05",
            "duration": 300,
            "labels": {"severity": "critical"},
            "annotations": {"summary": "Error rate above 5%"},
            "state": "firing",
            "type": "alerting"
          }
        ]
      }
    ]
  }
}
```

Use this to understand alert thresholds and for expressions during investigation.

### GET /api/v1/targets

Returns scrape target status and health.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `state` | No | Filter by `active`, `dropped`, or `any` |

```bash
# Check if a specific target is being scraped
curl -sG "$PROMETHEUS_URL/api/v1/targets" --data-urlencode 'state=active' \
  | jq '.data.activeTargets[] | select(.labels.job=="payment-api")'
```

**Response (per target):**

```json
{
  "discoveredLabels": {"__address__": "10.0.1.5:8080", "job": "payment-api"},
  "labels": {"instance": "10.0.1.5:8080", "job": "payment-api"},
  "scrapePool": "payment-api",
  "scrapeUrl": "http://10.0.1.5:8080/metrics",
  "lastError": "",
  "lastScrape": "2024-01-15T10:19:45.123Z",
  "lastScrapeDuration": 0.015,
  "health": "up"
}
```

`health` values: `up`, `down`, `unknown`.

Use this to verify targets are being scraped before assuming metric absence means zero.

### GET /api/v1/series

Returns time series matching label selectors. Useful for discovering available metrics.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `match[]` | Yes | Series selector (can repeat for OR logic) |
| `start` | No | Start timestamp |
| `end` | No | End timestamp |

```bash
# Discover all metrics for a service
curl -sG "$PROMETHEUS_URL/api/v1/series" \
  --data-urlencode 'match[]={job="payment-api"}' \
  --data-urlencode 'start=2024-01-15T10:00:00Z' \
  --data-urlencode 'end=2024-01-15T11:00:00Z' | jq '.data'
```

**Response:**

```json
{
  "status": "success",
  "data": [
    {"__name__": "http_requests_total", "job": "payment-api", "status": "200"},
    {"__name__": "http_requests_total", "job": "payment-api", "status": "500"},
    {"__name__": "http_request_duration_seconds_bucket", "job": "payment-api", "le": "0.1"}
  ]
}
```

### GET /api/v1/labels

Returns all label names. Useful for understanding what dimensions are available.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `match[]` | No | Restrict to series matching this selector |
| `start` | No | Start timestamp |
| `end` | No | End timestamp |

```bash
# All labels for a service
curl -sG "$PROMETHEUS_URL/api/v1/labels" \
  --data-urlencode 'match[]={job="payment-api"}' | jq '.data'
```

**Response:**

```json
{
  "status": "success",
  "data": ["__name__", "handler", "instance", "job", "method", "namespace", "pod", "status"]
}
```

### GET /api/v1/label/{label_name}/values

Returns values for a specific label.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `match[]` | No | Restrict to series matching this selector |
| `start` | No | Start timestamp |
| `end` | No | End timestamp |

```bash
# All status codes for a service
curl -sG "$PROMETHEUS_URL/api/v1/label/status/values" \
  --data-urlencode 'match[]={job="payment-api"}' | jq '.data'
```

## HTTP Error Codes

| Code | Meaning | Investigation action |
|------|---------|---------------------|
| `200` | Success | Parse `.data.result` |
| `400` | Bad request — missing or invalid parameters | Check query syntax and parameter names |
| `422` | Unprocessable — PromQL expression error | Fix expression syntax; check metric/label names with `/api/v1/series` |
| `503` | Service unavailable — query timeout or overloaded | Reduce time range, increase step, or simplify expression |

Error response body:

```json
{
  "status": "error",
  "errorType": "bad_data" | "execution" | "timeout" | "canceled",
  "error": "human-readable error message"
}
```

When a query returns 422, use `/api/v1/series` and `/api/v1/labels` to verify metric and label names exist before retrying.
