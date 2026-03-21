# Sentry API Reference

API reference for Sentry endpoints used during incident investigation.

## Authentication

All requests require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <SENTRY_AUTH_TOKEN>
```

**Required token scopes:** `project:read`, `event:read`, `org:read`, `member:read`.

Generate tokens at `https://<sentry-host>/settings/account/api/auth-tokens/`.

## Base URL

```
https://sentry.io/api/0
```

For self-hosted: `https://<your-sentry-host>/api/0`

## Endpoints

### List Project Issues

```
GET /api/0/projects/{org_slug}/{project_slug}/issues/
```

Returns issues scoped to a single project.

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Sentry search syntax (see below) |
| `sort` | string | `date`, `new`, `freq`, `priority` |
| `statsPeriod` | string | Relative time window: `1h`, `24h`, `14d`, `90d` |
| `start` | string | Absolute start, ISO 8601 (mutually exclusive with `statsPeriod`) |
| `end` | string | Absolute end, ISO 8601 |
| `cursor` | string | Pagination cursor from `Link` header |
| `limit` | int | Results per page, max 100 |

**Example request:**

```bash
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/projects/my-org/my-project/issues/?query=is:unresolved&sort=freq&statsPeriod=1h&limit=5"
```

**Example response:**

```json
[
  {
    "id": "12345",
    "title": "ConnectionPoolExhausted: No connections available",
    "culprit": "db.pool.acquire",
    "status": "unresolved",
    "substatus": "escalating",
    "count": "482",
    "firstSeen": "2026-03-20T10:15:00Z",
    "lastSeen": "2026-03-21T14:32:00Z",
    "permalink": "https://sentry.io/organizations/my-org/issues/12345/",
    "project": {
      "id": "1",
      "slug": "my-project"
    },
    "metadata": {
      "type": "ConnectionPoolExhausted",
      "value": "No connections available after 30s timeout"
    },
    "stats": {
      "24h": [[1711000800, 12], [1711004400, 45]]
    }
  }
]
```

### List Organization Issues

```
GET /api/0/organizations/{org_slug}/issues/
```

Returns issues across all projects in the organization. Same parameters as project issues endpoint.

Use this for cross-service investigations where the failing service is unknown.

**Additional query parameter:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `project` | int | Filter by project ID (repeatable for multiple projects) |

### Get Issue Events

```
GET /api/0/issues/{issue_id}/events/
```

Returns the list of events (occurrences) for a specific issue.

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `full` | bool | Include full event data (default `false`) |
| `cursor` | string | Pagination cursor |
| `limit` | int | Results per page, max 100 |

**Example request:**

```bash
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/issues/12345/events/?full=true&limit=1"
```

### Get Latest Event for Issue

```
GET /api/0/issues/{issue_id}/events/latest/
```

Returns the most recent event for an issue. This is the primary endpoint for stack trace extraction.

**Example response (abbreviated):**

```json
{
  "eventID": "abc123def456",
  "dateCreated": "2026-03-21T14:32:00Z",
  "entries": [
    {
      "type": "exception",
      "data": {
        "values": [
          {
            "type": "ConnectionPoolExhausted",
            "value": "No connections available after 30s timeout",
            "stacktrace": {
              "frames": [
                {
                  "filename": "db/pool.py",
                  "function": "acquire",
                  "lineNo": 142,
                  "colNo": 12,
                  "context": [
                    [140, "    async def acquire(self, timeout=30):"],
                    [141, "        try:"],
                    [142, "            return await self._pool.acquire(timeout=timeout)"],
                    [143, "        except asyncio.TimeoutError:"],
                    [144, "            raise ConnectionPoolExhausted(f'No connections available after {timeout}s timeout')"]
                  ],
                  "inApp": true
                }
              ],
              "framesOmitted": null
            },
            "mechanism": {
              "type": "generic",
              "handled": false
            }
          }
        ]
      }
    },
    {
      "type": "breadcrumbs",
      "data": {
        "values": [
          {
            "timestamp": "2026-03-21T14:31:58Z",
            "category": "http",
            "message": "POST /api/payments/charge [500]",
            "level": "error"
          }
        ]
      }
    }
  ],
  "contexts": {
    "trace": {
      "trace_id": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
      "span_id": "1234567890abcdef",
      "op": "db.query"
    },
    "runtime": {
      "name": "CPython",
      "version": "3.11.4"
    }
  },
  "tags": [
    {"key": "environment", "value": "production"},
    {"key": "server_name", "value": "web-prod-3"}
  ]
}
```

### Get Event Details

```
GET /api/0/organizations/{org_slug}/events/{event_id}/
```

Returns full details for a specific event by its ID.

### List Releases

```
GET /api/0/organizations/{org_slug}/releases/
```

Returns releases for the organization, optionally filtered by project.

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `project` | int | Filter by project ID |
| `per_page` | int | Results per page, max 100 |
| `sort` | string | `date` (default), `sessions` |
| `status` | string | `open`, `archived` |
| `query` | string | Filter by release version substring |

**Example response (abbreviated):**

```json
[
  {
    "version": "v2.3.2",
    "dateCreated": "2026-03-21T10:15:00Z",
    "dateReleased": "2026-03-21T10:15:00Z",
    "firstEvent": "2026-03-21T10:17:00Z",
    "lastEvent": "2026-03-21T14:32:00Z",
    "newGroups": 3,
    "projects": [
      {"slug": "payment-api", "id": 1}
    ],
    "authors": [
      {"email": "dev@example.com", "name": "Developer"}
    ]
  }
]
```

**Key fields for deploy correlation:**
- `dateCreated` — when the release was created in Sentry
- `firstEvent` — when the first error event was seen for this release
- `newGroups` — number of new issues introduced by this release (0 = clean deploy)

## Sentry Search Syntax

The `query` parameter supports Sentry's search syntax:

| Query | Description |
|-------|-------------|
| `is:unresolved` | Unresolved issues only |
| `is:resolved` | Resolved issues |
| `is:regressed` | Issues that were resolved then re-opened |
| `assigned:me` | Assigned to the token owner |
| `assigned:#team-name` | Assigned to a team |
| `firstSeen:-1h` | First seen within the last hour |
| `lastSeen:-24h` | Last seen within the last 24 hours |
| `times_seen:>100` | More than 100 occurrences |
| `level:error` | Error level events only |
| `release:v2.3.2` | Issues in a specific release |
| `environment:production` | Production environment only |
| `platform:python` | Specific platform |
| `trace:abc123...` | Events sharing a trace ID |
| `title:ConnectionPool*` | Title wildcard match |

Combine with spaces (implicit AND):
```
is:unresolved level:error firstSeen:-1h environment:production
```

## Pagination

All list endpoints use cursor-based pagination via the `Link` header.

**Response header example:**

```
Link: <https://sentry.io/api/0/projects/my-org/my-project/issues/?cursor=1234567890:0:0>; rel="next"; results="true"; cursor="1234567890:0:0",
      <https://sentry.io/api/0/projects/my-org/my-project/issues/?cursor=1234567890:1:0>; rel="previous"; results="false"; cursor="1234567890:1:0"
```

**Pagination logic:**

1. Make initial request without `cursor`
2. Parse the `Link` header from the response
3. Check the entry with `rel="next"`: if `results="true"`, more pages exist
4. Extract the `cursor` value and append `&cursor=<value>` to the next request
5. Repeat until `results="false"` for `rel="next"`

```bash
# Extract next cursor from Link header
NEXT_CURSOR=$(echo "$LINK_HEADER" | grep -o 'cursor="[^"]*"' | head -1 | cut -d'"' -f2)
HAS_NEXT=$(echo "$LINK_HEADER" | grep 'rel="next"' | grep -o 'results="[^"]*"' | cut -d'"' -f2)

if [ "$HAS_NEXT" = "true" ]; then
  # Fetch next page with &cursor=$NEXT_CURSOR
fi
```

## Rate Limiting

Sentry enforces rate limits that vary by plan and endpoint.

**Headers to monitor:**

| Header | Description |
|--------|-------------|
| `X-Sentry-Rate-Limits` | Granular per-category limits (present before hitting 429) |
| `X-Sentry-Rate-Limit-Remaining` | Requests remaining in current window |
| `X-Sentry-Rate-Limit-Limit` | Total requests allowed in window |
| `X-Sentry-Rate-Limit-Reset` | Unix timestamp when limit resets |
| `Retry-After` | Seconds to wait (present on 429 responses) |

**`X-Sentry-Rate-Limits` format:**

```
X-Sentry-Rate-Limits: 60:events:key, 10:transactions:organization
```

Format: `retry_after:categories:scope` (comma-separated). Categories include `events`, `transactions`, `attachments`, `default`.

**Handling 429 responses:**

1. Read the `Retry-After` header (value in seconds)
2. Wait the specified duration before retrying
3. Use exponential backoff if multiple 429s occur in sequence
4. Log rate limit encounters as findings — they may indicate misconfigured alerting that generates excessive API calls

**Self-hosted Sentry:** Rate limits may be disabled or configured differently. Check your instance configuration.
