# PromQL Investigation Patterns

Reusable query patterns for incident investigation. Replace `$SERVICE`, `$NS`, `$UPSTREAM`, and `$DEP` with actual values.

## Error Investigation

### Error rate (requests per second returning 5xx)

```promql
rate(http_requests_total{job="$SERVICE",status=~"5.."}[5m])
```

### Error ratio (fraction of total requests)

```promql
rate(http_requests_total{job="$SERVICE",status=~"5.."}[5m])
  / rate(http_requests_total{job="$SERVICE"}[5m])
```

### Error ratio by endpoint

```promql
sum by (handler, method) (rate(http_requests_total{job="$SERVICE",status=~"5.."}[5m]))
  / sum by (handler, method) (rate(http_requests_total{job="$SERVICE"}[5m]))
```

### Error spike detection (current vs 1 hour ago)

```promql
(
  rate(http_requests_total{job="$SERVICE",status=~"5.."}[5m])
  / rate(http_requests_total{job="$SERVICE"}[5m])
)
/ (
  rate(http_requests_total{job="$SERVICE",status=~"5.."}[5m] offset 1h)
  / rate(http_requests_total{job="$SERVICE"}[5m] offset 1h)
)
```

A result > 2 means error ratio doubled compared to 1 hour ago.

### Error rate by status code

```promql
sum by (status) (rate(http_requests_total{job="$SERVICE",status=~"[45].."}[5m]))
```

### gRPC error rate

```promql
sum by (grpc_method) (rate(grpc_server_handled_total{job="$SERVICE",grpc_code!="OK"}[5m]))
  / sum by (grpc_method) (rate(grpc_server_handled_total{job="$SERVICE"}[5m]))
```

## Resource Investigation

### CPU usage per pod

```promql
sum by (pod) (rate(container_cpu_usage_seconds_total{namespace="$NS",pod=~"$SERVICE.*"}[5m]))
```

### CPU throttling

```promql
sum by (pod) (rate(container_cpu_cfs_throttled_seconds_total{namespace="$NS",pod=~"$SERVICE.*"}[5m]))
  / sum by (pod) (rate(container_cpu_cfs_periods_total{namespace="$NS",pod=~"$SERVICE.*"}[5m]))
```

A ratio > 0.25 means the container is being throttled more than 25% of the time.

### Memory usage per pod

```promql
container_memory_usage_bytes{namespace="$NS",pod=~"$SERVICE.*",container!=""}
```

### Memory saturation (usage vs limit)

```promql
container_memory_usage_bytes{namespace="$NS",pod=~"$SERVICE.*",container!=""}
  / container_spec_memory_limit_bytes{namespace="$NS",pod=~"$SERVICE.*",container!=""}
```

A ratio > 0.85 indicates high memory pressure. Above 0.95 means OOM risk.

### Memory working set (more accurate than usage)

```promql
container_memory_working_set_bytes{namespace="$NS",pod=~"$SERVICE.*",container!=""}
```

### Disk usage

```promql
1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})
```

### Disk I/O

```promql
# Read throughput
sum by (instance) (rate(node_disk_read_bytes_total[5m]))

# Write throughput
sum by (instance) (rate(node_disk_written_bytes_total[5m]))

# I/O utilization
rate(node_disk_io_time_seconds_total[5m])
```

### Network traffic

```promql
# Receive rate
sum by (pod) (rate(container_network_receive_bytes_total{namespace="$NS",pod=~"$SERVICE.*"}[5m]))

# Transmit rate
sum by (pod) (rate(container_network_transmit_bytes_total{namespace="$NS",pod=~"$SERVICE.*"}[5m]))

# Receive errors
sum by (pod) (rate(container_network_receive_errors_total{namespace="$NS",pod=~"$SERVICE.*"}[5m]))

# Dropped packets
sum by (pod) (rate(container_network_receive_packets_dropped_total{namespace="$NS",pod=~"$SERVICE.*"}[5m]))
```

## Latency Investigation

### p50 / p95 / p99 latency

```promql
# p50
histogram_quantile(0.50, sum by (le) (rate(http_request_duration_seconds_bucket{job="$SERVICE"}[5m])))

# p95
histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{job="$SERVICE"}[5m])))

# p99
histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket{job="$SERVICE"}[5m])))
```

### Latency by endpoint

```promql
histogram_quantile(0.95,
  sum by (le, handler) (rate(http_request_duration_seconds_bucket{job="$SERVICE"}[5m]))
)
```

### Latency spike detection (current vs 1 hour ago)

```promql
histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{job="$SERVICE"}[5m])))
  / histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{job="$SERVICE"}[5m] offset 1h)))
```

A result > 2 means p95 latency has doubled.

### Average latency (when histograms are unavailable)

```promql
rate(http_request_duration_seconds_sum{job="$SERVICE"}[5m])
  / rate(http_request_duration_seconds_count{job="$SERVICE"}[5m])
```

### Slow requests count (exceeding SLO threshold)

```promql
# Fraction of requests slower than 500ms
1 - (
  sum(rate(http_request_duration_seconds_bucket{job="$SERVICE",le="0.5"}[5m]))
  / sum(rate(http_request_duration_seconds_count{job="$SERVICE"}[5m]))
)
```

## Saturation Patterns

### Queue depth

```promql
# Current queue size
queue_length{job="$SERVICE"}

# Queue growth rate
deriv(queue_length{job="$SERVICE"}[5m])
```

Positive `deriv()` means the queue is growing — producers outpace consumers.

### Connection pool usage

```promql
# Active connections vs max pool size
db_connections_active{job="$SERVICE"}
  / db_connections_max{job="$SERVICE"}

# Waiting for connection (pool exhaustion indicator)
db_connections_waiting{job="$SERVICE"}
```

A ratio > 0.8 on active/max indicates near-exhaustion.

### Thread pool saturation

```promql
# Active threads vs max
thread_pool_active{job="$SERVICE"}
  / thread_pool_max{job="$SERVICE"}

# Queued tasks waiting for a thread
thread_pool_queue_size{job="$SERVICE"}
```

### File descriptor usage

```promql
process_open_fds{job="$SERVICE"}
  / process_max_fds{job="$SERVICE"}
```

## Comparison Patterns

### Current vs 1 hour ago

```promql
rate(http_requests_total{job="$SERVICE"}[5m])
  / rate(http_requests_total{job="$SERVICE"}[5m] offset 1h)
```

### Current vs yesterday (same time)

```promql
rate(http_requests_total{job="$SERVICE"}[5m])
  / rate(http_requests_total{job="$SERVICE"}[5m] offset 1d)
```

### Deviation from average (last 24h)

```promql
(
  rate(http_requests_total{job="$SERVICE"}[5m])
  - avg_over_time(rate(http_requests_total{job="$SERVICE"}[5m])[24h:5m])
)
/ stddev_over_time(rate(http_requests_total{job="$SERVICE"}[5m])[24h:5m])
```

A result > 3 or < -3 indicates the current value is more than 3 standard deviations from the 24h mean.

### Predict remaining time (linear projection)

```promql
# Hours until disk is full (based on 4h trend)
(node_filesystem_avail_bytes{mountpoint="/"})
  / (-deriv(node_filesystem_avail_bytes{mountpoint="/"}[4h]) > 0)
  / 3600
```

## Container and Kubernetes Patterns

### Pod restart count (recent)

```promql
# Restarts in last hour
increase(kube_pod_container_status_restarts_total{namespace="$NS",pod=~"$SERVICE.*"}[1h])

# Restarts in last 24 hours
increase(kube_pod_container_status_restarts_total{namespace="$NS",pod=~"$SERVICE.*"}[24h])
```

### OOM killed containers

```promql
# Currently in OOMKilled state
kube_pod_container_status_last_terminated_reason{reason="OOMKilled",namespace="$NS"}

# OOM events over time (count increases)
changes(kube_pod_container_status_restarts_total{namespace="$NS",pod=~"$SERVICE.*"}[1h])
```

Cross-reference OOM kills with memory saturation queries above.

### Pods not ready

```promql
kube_pod_status_ready{namespace="$NS",condition="true",pod=~"$SERVICE.*"} == 0
```

### Resource requests vs actual usage

```promql
# CPU: actual vs requested
sum by (pod) (rate(container_cpu_usage_seconds_total{namespace="$NS",pod=~"$SERVICE.*"}[5m]))
  / on(pod) kube_pod_container_resource_requests{resource="cpu",namespace="$NS",pod=~"$SERVICE.*"}

# Memory: actual vs requested
container_memory_usage_bytes{namespace="$NS",pod=~"$SERVICE.*",container!=""}
  / on(pod,container) kube_pod_container_resource_requests{resource="memory",namespace="$NS",pod=~"$SERVICE.*"}
```

A ratio >> 1 means the pod is using far more than requested, risking eviction.

### Resource limits vs actual usage

```promql
# CPU: actual vs limit
sum by (pod) (rate(container_cpu_usage_seconds_total{namespace="$NS",pod=~"$SERVICE.*"}[5m]))
  / on(pod) kube_pod_container_resource_limits{resource="cpu",namespace="$NS",pod=~"$SERVICE.*"}

# Memory: actual vs limit
container_memory_usage_bytes{namespace="$NS",pod=~"$SERVICE.*",container!=""}
  / on(pod,container) kube_pod_container_resource_limits{resource="memory",namespace="$NS",pod=~"$SERVICE.*"}
```

### HPA (Horizontal Pod Autoscaler) status

```promql
# Current replicas vs desired
kube_horizontalpodautoscaler_status_current_replicas{namespace="$NS",horizontalpodautoscaler=~"$SERVICE.*"}

# Are we at max replicas?
kube_horizontalpodautoscaler_status_current_replicas{namespace="$NS"}
  == kube_horizontalpodautoscaler_spec_max_replicas{namespace="$NS"}
```

If current == max, the service cannot scale further.

### Deployment rollout status

```promql
# Unavailable replicas during rollout
kube_deployment_status_replicas_unavailable{namespace="$NS",deployment="$SERVICE"}

# Rollout progress
kube_deployment_status_replicas_updated{namespace="$NS",deployment="$SERVICE"}
  / kube_deployment_spec_replicas{namespace="$NS",deployment="$SERVICE"}
```
