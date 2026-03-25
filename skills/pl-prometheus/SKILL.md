---
name: pl-prometheus
description: >-
  Prometheus metric querying skill for incident investigation agents.
  Use when investigating alerts, outages, performance degradations, or resource
  exhaustion by querying Prometheus metrics. Covers promtool CLI usage, curl
  fallback, PromQL patterns for error rates, latency percentiles, resource
  saturation, container metrics, and service dependency analysis.
  Teaches response format handling and metric correlation with alert timestamps.
compatibility: Requires promtool (preferred) or curl. Set PROMETHEUS_URL env var.
---

# Prometheus Investigation Queries

Query Prometheus metrics to gather evidence during incident investigations.

## Environment

```bash
# Required — set before any query
export PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"
```

## Quick Reference

### promtool (preferred)

```bash
# Instant query — current value
promtool query instant "$PROMETHEUS_URL" 'up{job="payment-api"}'

# Range query — time series over window
promtool query range "$PROMETHEUS_URL" \
  'rate(http_requests_total{job="payment-api",status=~"5.."}[5m])' \
  --start="2024-01-15T10:00:00Z" --end="2024-01-15T11:00:00Z" --step=60s
```

### curl fallback

```bash
# Instant query
curl -sG "$PROMETHEUS_URL/api/v1/query" \
  --data-urlencode 'query=up{job="payment-api"}' | jq '.data.result'

# Range query
curl -sG "$PROMETHEUS_URL/api/v1/query_range" \
  --data-urlencode 'query=rate(http_requests_total{job="payment-api",status=~"5.."}[5m])' \
  --data-urlencode 'start=2024-01-15T10:00:00Z' \
  --data-urlencode 'end=2024-01-15T11:00:00Z' \
  --data-urlencode 'step=60s' | jq '.data.result'
```

### Response format

All Prometheus API responses use this envelope:

```json
{"status":"success","data":{"resultType":"vector|matrix|scalar","result":[...]}}
```

| resultType | Shape | When |
|------------|-------|------|
| `vector` | `[{"metric":{...},"value":[timestamp,value]}]` | Instant queries |
| `matrix` | `[{"metric":{...},"values":[[ts,val],...]}]` | Range queries |
| `scalar` | `[timestamp, value]` | Scalar expressions |

Always pipe through `jq '.data.result'` to extract the payload.

## Investigation Queries

### Error Rate

```promql
# Overall error rate (5xx responses per second)
rate(http_requests_total{job="$SERVICE",status=~"5.."}[5m])

# Error ratio — fraction of requests that are errors
rate(http_requests_total{job="$SERVICE",status=~"5.."}[5m])
  / rate(http_requests_total{job="$SERVICE"}[5m])

# Error rate by endpoint
sum by (handler, method) (
  rate(http_requests_total{job="$SERVICE",status=~"5.."}[5m])
)

# Error spike detection — current vs 1 hour ago
rate(http_requests_total{job="$SERVICE",status=~"5.."}[5m])
  / rate(http_requests_total{job="$SERVICE",status=~"5.."}[5m] offset 1h)
```

### Latency Percentiles

```promql
# p95 latency
histogram_quantile(0.95,
  sum by (le) (rate(http_request_duration_seconds_bucket{job="$SERVICE"}[5m]))
)

# p50 / p95 / p99 side-by-side (use separate queries, compare results)
# p50:
histogram_quantile(0.50, sum by (le) (rate(http_request_duration_seconds_bucket{job="$SERVICE"}[5m])))
# p99:
histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket{job="$SERVICE"}[5m])))

# Latency by endpoint
histogram_quantile(0.95,
  sum by (le, handler) (rate(http_request_duration_seconds_bucket{job="$SERVICE"}[5m]))
)
```

### Resource Saturation

```promql
# CPU usage per pod
sum by (pod) (rate(container_cpu_usage_seconds_total{namespace="$NS",pod=~"$SERVICE.*"}[5m]))

# Memory usage per pod (bytes)
container_memory_usage_bytes{namespace="$NS",pod=~"$SERVICE.*"}

# Memory vs limit — saturation ratio
container_memory_usage_bytes{namespace="$NS",pod=~"$SERVICE.*"}
  / container_spec_memory_limit_bytes{namespace="$NS",pod=~"$SERVICE.*"}

# Disk usage
1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})

# Network receive errors
rate(node_network_receive_errs_total[5m])
```

### Container and Kubernetes Metrics

```promql
# Pod restart count (last hour)
increase(kube_pod_container_status_restarts_total{namespace="$NS",pod=~"$SERVICE.*"}[1h])

# OOM killed containers
kube_pod_container_status_last_terminated_reason{reason="OOMKilled",namespace="$NS"}

# Pods not ready
kube_pod_status_ready{namespace="$NS",condition="true"} == 0

# Container resource requests vs actual usage
container_memory_usage_bytes{namespace="$NS",pod=~"$SERVICE.*"}
  / kube_pod_container_resource_requests{resource="memory",namespace="$NS",pod=~"$SERVICE.*"}
```

### Service Dependencies

```promql
# Error rate on upstream dependency
rate(http_requests_total{job="$UPSTREAM_SERVICE",status=~"5.."}[5m])

# Latency to downstream service
histogram_quantile(0.95,
  sum by (le) (rate(http_request_duration_seconds_bucket{job="$SERVICE",downstream="$DEP"}[5m]))
)

# Connection pool usage (if exposed)
sum by (pool) (db_connections_active{job="$SERVICE"})
  / sum by (pool) (db_connections_max{job="$SERVICE"})
```

## Correlating Metrics with Alert Timestamps

When an alert fires at time `T`:

1. **Query the alert window** — use range query from `T - 30m` to `T + 10m` with step `30s`
2. **Find the inflection point** — look for the timestamp where the metric crossed the threshold
3. **Correlate with deploys/events** — compare inflection timestamp against deploy times, config changes

```bash
# Example: alert fired at 10:20, query ±30 min window
ALERT_TIME="2024-01-15T10:20:00Z"
curl -sG "$PROMETHEUS_URL/api/v1/query_range" \
  --data-urlencode "query=rate(http_requests_total{job=\"payment-api\",status=~\"5..\"}[5m])" \
  --data-urlencode "start=2024-01-15T09:50:00Z" \
  --data-urlencode "end=2024-01-15T10:30:00Z" \
  --data-urlencode "step=30s" | jq '.data.result'
```

```bash
# Check currently firing alerts
curl -s "$PROMETHEUS_URL/api/v1/alerts" | jq '.data.alerts[] | select(.state=="firing")'

# Check alert rules and their thresholds
curl -s "$PROMETHEUS_URL/api/v1/rules" | jq '.data.groups[].rules[] | select(.type=="alerting")'
```

## Reporting Findings

Report each metric observation immediately:

```bash
pl report finding --type observation \
  --description "Error rate for payment-api spiked to 15% at 10:18, up from baseline 0.2%" \
  --source prometheus

pl report finding --type evidence \
  --description "Memory usage hit 94% of limit at 10:17, 3 minutes before first alert" \
  --source prometheus \
  --related-to f-001
```

## Gotchas

| Pitfall | Why it matters | What to do |
|---------|---------------|------------|
| `rate()` on a gauge | `rate()` computes per-second increase — meaningless on gauges | Use `rate()` only on counters; use raw value or `deriv()` for gauges |
| `irate()` vs `rate()` | `irate()` uses last two samples only — very spiky, not suitable for alerting thresholds | Use `rate()` for investigation (smoother); `irate()` only for spotting instantaneous bursts |
| Counter resets | Container restarts reset counters to 0 | `rate()` and `increase()` handle resets automatically; raw counter values do not |
| Missing `le` label in `histogram_quantile` | Aggregation must preserve `le` | Always include `le` in `by` clause: `sum by (le, ...)` |
| Label matching in binary ops | Both sides must have identical label sets | Use `on()` or `ignoring()` to control matching: `metric_a / on(instance) metric_b` |
| Stale time series | Series go stale 5 min after last scrape | Filter with `up{job="..."}` to confirm target is being scraped |
| Range vector window too small | `[1m]` with 30s scrape interval = only 2 data points | Use at least `[5m]` for stable rates; minimum 4x the scrape interval |
| `absent()` returns `{}` when series exists | `absent()` returns 1 when series is missing, empty when it exists | Use `absent(up{job="..."})` to detect down targets |

## Reference

- [API Reference](references/api-reference.md) — endpoints, parameters, response shapes, error codes
- [PromQL Patterns](references/promql-patterns.md) — comprehensive investigation query patterns
