# Grafana HTTP API Reference

Investigation-oriented reference for the Grafana HTTP API. Covers endpoints used during incident investigation: alerts, dashboards, datasources, and annotations.

## Authentication

All requests require authentication via one of:

### API Key (deprecated in Grafana 10+)

```
Authorization: Bearer <api-key>
```

### Service Account Token (preferred)

```
Authorization: Bearer <service-account-token>
```

Uses the same header format as API keys. Created via Grafana UI under Administration > Service Accounts.

### Basic Auth

```
Authorization: Basic <base64(user:password)>
```

```bash
curl -s -u "admin:password" "$GRAFANA_URL/api/org"
```

### Permission Levels

| Role | Dashboard read | Dashboard write | Datasource proxy | Alert rules | Annotations |
|------|---------------|----------------|-----------------|-------------|-------------|
| Viewer | Yes | No | No | Read only | Read only |
| Editor | Yes | Yes | No | Read/Write | Read/Write |
| Admin | Yes | Yes | Yes | Read/Write | Read/Write |

Datasource proxy (`/api/datasources/proxy/`) requires Admin role or explicit datasource-level permissions.

## Alert Provisioning Endpoints

### List Alert Rules

```
GET /api/v1/provisioning/alert-rules
```

Returns all provisioned alert rule definitions. Does not reflect current firing state.

**Response:**

```json
[
  {
    "id": 1,
    "uid": "rule-uid-123",
    "orgID": 1,
    "folderUID": "folder-abc",
    "ruleGroup": "payment-alerts",
    "title": "High Error Rate",
    "condition": "C",
    "data": [
      {
        "refId": "A",
        "datasourceUid": "prometheus-uid",
        "model": {
          "expr": "rate(http_requests_total{code=~\"5..\"}[5m]) > 0.05",
          "intervalMs": 1000,
          "maxDataPoints": 43200
        }
      }
    ],
    "noDataState": "NoData",
    "execErrState": "Error",
    "for": "5m",
    "labels": {
      "severity": "critical",
      "team": "payments"
    },
    "annotations": {
      "summary": "Error rate exceeds 5%"
    }
  }
]
```

### Get Single Alert Rule

```
GET /api/v1/provisioning/alert-rules/:uid
```

**Response:** Single alert rule object (same schema as list item above).

### List Contact Points

```
GET /api/v1/provisioning/contact-points
```

Returns notification destinations (Slack, PagerDuty, email, etc.).

**Response:**

```json
[
  {
    "uid": "cp-uid-456",
    "name": "payments-pagerduty",
    "type": "pagerduty",
    "settings": {
      "integrationKey": "***",
      "severity": "critical"
    },
    "disableResolveMessage": false
  }
]
```

### Get Notification Policies

```
GET /api/v1/provisioning/policies
```

Returns the notification routing tree.

**Response:**

```json
{
  "receiver": "default-receiver",
  "group_by": ["alertname", "grafana_folder"],
  "routes": [
    {
      "receiver": "payments-pagerduty",
      "matchers": ["team=payments", "severity=critical"],
      "group_wait": "30s",
      "group_interval": "5m",
      "repeat_interval": "4h"
    }
  ]
}
```

### Alertmanager-Compatible Alerts (Live State)

```
GET /api/alertmanager/grafana/api/v2/alerts
```

Returns currently firing/pending alerts from Grafana's built-in Alertmanager.

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `active` | bool | Include active (firing) alerts |
| `silenced` | bool | Include silenced alerts |
| `inhibited` | bool | Include inhibited alerts |
| `filter` | string | PromQL-style matcher (e.g., `alertname="HighErrorRate"`) |

**Response:**

```json
[
  {
    "labels": {
      "alertname": "HighErrorRate",
      "severity": "critical",
      "service": "payment-api"
    },
    "annotations": {
      "summary": "Error rate exceeds 5%"
    },
    "startsAt": "2026-03-21T10:15:00Z",
    "endsAt": "0001-01-01T00:00:00Z",
    "status": {
      "state": "active",
      "silencedBy": [],
      "inhibitedBy": []
    },
    "fingerprint": "abc123"
  }
]
```

## Dashboard Endpoints

### Search Dashboards

```
GET /api/search
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `query` | string | Search term (title match) |
| `tag` | string[] | Filter by tags (repeat for multiple: `tag=prod&tag=payments`) |
| `type` | string | `dash-db` for dashboards, `dash-folder` for folders |
| `folderIds` | int[] | Limit to specific folders |
| `starred` | bool | Only starred dashboards |
| `limit` | int | Max results (default 1000) |

**Response:**

```json
[
  {
    "id": 42,
    "uid": "abc123def",
    "title": "Payment API Overview",
    "uri": "db/payment-api-overview",
    "url": "/d/abc123def/payment-api-overview",
    "type": "dash-db",
    "tags": ["payments", "production"],
    "isStarred": false,
    "folderUid": "folder-abc",
    "folderTitle": "Payment Team"
  }
]
```

### Get Dashboard by UID

```
GET /api/dashboards/uid/:uid
```

Returns the full dashboard model including all panels, queries, and templating variables.

**Response:**

```json
{
  "meta": {
    "isStarred": false,
    "slug": "payment-api-overview",
    "url": "/d/abc123def/payment-api-overview",
    "folderId": 5,
    "folderUid": "folder-abc",
    "folderTitle": "Payment Team",
    "created": "2025-01-15T10:00:00Z",
    "updated": "2026-03-20T14:30:00Z",
    "createdBy": "admin",
    "updatedBy": "admin"
  },
  "dashboard": {
    "id": 42,
    "uid": "abc123def",
    "title": "Payment API Overview",
    "tags": ["payments", "production"],
    "timezone": "browser",
    "panels": [
      {
        "id": 1,
        "title": "Request Rate",
        "type": "timeseries",
        "datasource": {
          "type": "prometheus",
          "uid": "prometheus-uid"
        },
        "targets": [
          {
            "refId": "A",
            "expr": "rate(http_requests_total{service=\"payment-api\"}[5m])",
            "legendFormat": "{{method}} {{code}}"
          }
        ],
        "gridPos": {"h": 8, "w": 12, "x": 0, "y": 0}
      }
    ],
    "templating": {
      "list": [
        {
          "name": "namespace",
          "type": "query",
          "datasource": {"type": "prometheus", "uid": "prometheus-uid"},
          "query": "label_values(kube_namespace_created, namespace)"
        }
      ]
    }
  }
}
```

## Datasource Endpoints

### List All Datasources

```
GET /api/datasources
```

**Response:**

```json
[
  {
    "id": 1,
    "uid": "prometheus-uid",
    "orgId": 1,
    "name": "Prometheus",
    "type": "prometheus",
    "access": "proxy",
    "url": "http://prometheus:9090",
    "isDefault": true,
    "database": "",
    "readOnly": false
  },
  {
    "id": 2,
    "uid": "loki-uid",
    "orgId": 1,
    "name": "Loki",
    "type": "loki",
    "access": "proxy",
    "url": "http://loki:3100",
    "isDefault": false,
    "database": "",
    "readOnly": false
  }
]
```

### Get Datasource by ID

```
GET /api/datasources/:id
```

**Response:** Single datasource object (same schema as list item).

### Get Datasource by UID

```
GET /api/datasources/uid/:uid
```

**Response:** Single datasource object (same schema as list item).

### Datasource Proxy

```
GET /api/datasources/proxy/:id/*
POST /api/datasources/proxy/:id/*
```

Proxies requests to the underlying datasource. The path after the datasource ID is forwarded directly.

**Important:** Uses the numeric `id`, not the `uid`.

**Prometheus examples:**

```
GET  /api/datasources/proxy/1/api/v1/query?query=up
GET  /api/datasources/proxy/1/api/v1/query_range?query=up&start=1711000000&end=1711003600&step=60
GET  /api/datasources/proxy/1/api/v1/labels
GET  /api/datasources/proxy/1/api/v1/label/job/values
POST /api/datasources/proxy/1/api/v1/query  (body: query=up)
```

**Loki examples:**

```
GET /api/datasources/proxy/2/loki/api/v1/query_range?query={app="payment-api"}&start=1711000000000000000&end=1711003600000000000&limit=100
GET /api/datasources/proxy/2/loki/api/v1/labels
GET /api/datasources/proxy/2/loki/api/v1/label/app/values
```

**Permissions:** Requires Admin role or explicit datasource-level permissions on the service account.

## Annotation Endpoints

### List Annotations

```
GET /api/annotations
```

**Query Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `from` | int | Start time in epoch milliseconds |
| `to` | int | End time in epoch milliseconds |
| `alertId` | int | Filter by alert ID |
| `dashboardId` | int | Filter by dashboard numeric ID |
| `dashboardUID` | string | Filter by dashboard UID |
| `panelId` | int | Filter by panel ID |
| `tags` | string[] | Filter by tags (repeat param: `tags=deploy&tags=prod`) |
| `type` | string | `alert` for alert annotations, `annotation` for manual |
| `limit` | int | Max results (default 100) |

**Response:**

```json
[
  {
    "id": 1,
    "alertId": 0,
    "dashboardId": 42,
    "dashboardUID": "abc123def",
    "panelId": 1,
    "time": 1711015200000,
    "timeEnd": 1711015200000,
    "text": "Deploy v2.3.1 to payment-api",
    "tags": ["deploy", "payment-api"],
    "login": "deploy-bot",
    "email": "deploy-bot@example.com",
    "created": 1711015200000,
    "updated": 1711015200000
  }
]
```

### Create Annotation

```
POST /api/annotations
Content-Type: application/json
```

**Request Body:**

```json
{
  "dashboardUID": "abc123def",
  "panelId": 1,
  "time": 1711015200000,
  "timeEnd": 1711015200000,
  "text": "Investigation started for incident INC-456",
  "tags": ["incident", "investigation"]
}
```

**Response:**

```json
{
  "id": 2,
  "message": "Annotation added"
}
```

## Common Response Codes

| Code | Meaning | Common Cause |
|------|---------|-------------|
| 200 | Success | Request completed |
| 401 | Unauthorized | Invalid or missing API key |
| 403 | Forbidden | Token lacks required permissions |
| 404 | Not Found | Wrong UID/ID or resource doesn't exist |
| 412 | Precondition Failed | Version conflict on dashboard save |
| 422 | Unprocessable | Invalid request body |
| 429 | Too Many Requests | Rate limited |

## Pagination

Most list endpoints support `limit` and `page` (1-indexed) parameters:

```
GET /api/search?limit=50&page=2
```

The `/api/annotations` endpoint uses `limit` only (no pagination offset; filter by time range instead).

## Health Check

```
GET /api/health
```

**Response:**

```json
{
  "commit": "abc1234",
  "database": "ok",
  "version": "10.2.0"
}
```

No authentication required. Use to verify Grafana is reachable before running investigation queries.
