---
name: pl-sentry
description: >-
  Sentry incident investigation skill for prismalens agents.
  Use when investigating application errors, exceptions, error spikes, regressions,
  or correlating deploy-related failures using Sentry data.
  Covers error spike detection, stack trace extraction, regression identification,
  deploy correlation, and cross-service trace analysis.
  CLI-first using sentry-cli with curl fallback.
compatibility: Requires SENTRY_AUTH_TOKEN env var. Optional sentry-cli for streamlined access. Works with any agent backend (claude, deepagents, opencode).
---

# Sentry Investigation

Query Sentry for error data, extract stack traces, detect regressions, and correlate errors with deployments.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SENTRY_AUTH_TOKEN` | Yes | Bearer token for API authentication |
| `SENTRY_ORG` | Yes | Organization slug |
| `SENTRY_PROJECT` | Yes | Project slug (omit for org-wide queries) |
| `SENTRY_URL` | No | Base URL, defaults to `https://sentry.io` |

## Quick Reference

### sentry-cli (preferred)

```bash
# List recent issues
sentry-cli issues list -p "$SENTRY_PROJECT" --status unresolved

# List events for a specific issue
sentry-cli issues events <ISSUE_ID>

# List releases
sentry-cli releases list -o "$SENTRY_ORG" -p "$SENTRY_PROJECT"
```

### curl fallback

All API requests use this pattern:

```bash
SENTRY_BASE="${SENTRY_URL:-https://sentry.io}/api/0"

# List project issues (unresolved, sorted by frequency)
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "$SENTRY_BASE/projects/$SENTRY_ORG/$SENTRY_PROJECT/issues/?query=is:unresolved&sort=freq&statsPeriod=1h"

# List organization-wide issues
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "$SENTRY_BASE/organizations/$SENTRY_ORG/issues/?query=is:unresolved&sort=freq&statsPeriod=1h"

# Get latest event for an issue
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "$SENTRY_BASE/issues/<ISSUE_ID>/events/latest/"

# Get event details
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "$SENTRY_BASE/organizations/$SENTRY_ORG/events/<EVENT_ID>/"

# List releases
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "$SENTRY_BASE/organizations/$SENTRY_ORG/releases/?project=$SENTRY_PROJECT"
```

## Investigation Patterns

### 1. Error Spike Detection

Identify abnormal error frequency in the last hour compared to baseline.

```bash
SENTRY_BASE="${SENTRY_URL:-https://sentry.io}/api/0"

# Current hour: top issues by frequency
CURRENT=$(curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "$SENTRY_BASE/projects/$SENTRY_ORG/$SENTRY_PROJECT/issues/?query=is:unresolved&sort=freq&statsPeriod=1h&limit=10")

# Previous 24h baseline for comparison
BASELINE=$(curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "$SENTRY_BASE/projects/$SENTRY_ORG/$SENTRY_PROJECT/issues/?query=is:unresolved&sort=freq&statsPeriod=24h&limit=10")
```

**What to compare:** Extract `count` from each issue in both responses. An issue whose last-hour count exceeds its 24h-average hourly rate by 3x or more is a spike.

Report spikes as findings immediately:

```bash
pl report finding --type observation \
  --description "Issue #12345 'ConnectionTimeout in payment-api' spiked to 450 events/hr (baseline: 30/hr)" \
  --source sentry
```

### 2. Stack Trace Extraction

Get the full exception chain from the latest event of an issue.

```bash
EVENT=$(curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "$SENTRY_BASE/issues/<ISSUE_ID>/events/latest/")
```

**Parse the response:** The exception data lives at `.entries[] | select(.type == "exception") | .data.values[]`. Each value contains:
- `type` — exception class name
- `value` — error message
- `stacktrace.frames[]` — array of frames (bottom = most recent when `stacktrace.framesOmitted` is null)

For each frame extract: `filename`, `function`, `lineNo`, `colNo`, `context` (surrounding source lines if available).

```bash
pl report finding --type observation \
  --description "Root exception: ConnectionPoolExhausted at db/pool.py:142 in acquire() — 'No connections available after 30s timeout'" \
  --source sentry
```

### 3. Regression Detection

Find issues that were resolved but have re-opened, indicating a regression.

```bash
# Query for regressed issues
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "$SENTRY_BASE/projects/$SENTRY_ORG/$SENTRY_PROJECT/issues/?query=is:regressed&sort=date&statsPeriod=24h"
```

**Key fields in response:**
- `status` — will be `"unresolved"` with `substatus` of `"regressed"`
- `firstSeen` — original occurrence (shows how old the bug is)
- `lastSeen` — when the regression surfaced
- `statusDetails.inRelease` — the release where it was marked resolved (compare to current release)

```bash
pl report finding --type observation \
  --description "Regression: Issue #9876 'NullRef in UserService.getProfile' resolved in v2.3.0, regressed in v2.3.2" \
  --source sentry
```

### 4. Deploy Correlation

Compare error rates before and after a deployment.

```bash
SENTRY_BASE="${SENTRY_URL:-https://sentry.io}/api/0"

# Step 1: List recent releases
RELEASES=$(curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "$SENTRY_BASE/organizations/$SENTRY_ORG/releases/?project=$SENTRY_PROJECT&per_page=5&sort=date")

# Step 2: Get error counts for specific release
RELEASE_VERSION="your-release-version"
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "$SENTRY_BASE/organizations/$SENTRY_ORG/releases/$RELEASE_VERSION/"
```

**Correlation approach:**
1. Get the release `dateCreated` timestamp
2. Query issues with `statsPeriod=1h` using `firstSeen` after the release timestamp
3. Issues where `firstSeen` falls within 30 minutes after deploy are deploy-correlated candidates

```bash
# New issues since a specific timestamp
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "$SENTRY_BASE/projects/$SENTRY_ORG/$SENTRY_PROJECT/issues/?query=is:unresolved+firstSeen:-1h&sort=date"
```

```bash
pl report finding --type hypothesis \
  --description "Deploy v2.3.2 (merged 10:15 UTC) correlates with 3 new Sentry issues first seen between 10:17-10:22 UTC" \
  --confidence 0.7
```

### 5. Cross-Service Error Tracing

Trace error propagation across microservices using Sentry's trace data.

```bash
# Step 1: Get event with trace context
EVENT=$(curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "$SENTRY_BASE/issues/<ISSUE_ID>/events/latest/")
```

**Extract trace ID:** Parse `.contexts.trace.trace_id` from the event response.

```bash
# Step 2: Find all events sharing the same trace
TRACE_ID="<extracted-trace-id>"
curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "$SENTRY_BASE/organizations/$SENTRY_ORG/events/?query=trace:$TRACE_ID&field=title&field=project&field=timestamp&sort=-timestamp"
```

This returns events across all projects in the org that share the trace, showing the propagation path. Look for the earliest event in the trace — that is the originating service.

```bash
pl report finding --type observation \
  --description "Trace abc123: error originated in auth-service (10:20:01), propagated to user-api (10:20:02), then payment-api (10:20:03)" \
  --source sentry
```

### 6. Rate Limit Handling

Sentry API enforces rate limits that vary by plan. Detect and handle them.

```bash
RESPONSE=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "$SENTRY_BASE/projects/$SENTRY_ORG/$SENTRY_PROJECT/issues/?query=is:unresolved")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "429" ]; then
  # Extract Retry-After header (seconds to wait)
  RETRY_AFTER=$(curl -s -I -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
    "$SENTRY_BASE/projects/$SENTRY_ORG/$SENTRY_PROJECT/issues/" | grep -i "Retry-After" | awk '{print $2}' | tr -d '\r')
  echo "Rate limited. Retry after ${RETRY_AFTER}s"
  sleep "$RETRY_AFTER"
fi
```

Always check for `X-Sentry-Rate-Limits` header in responses — it provides granular per-category limits before you hit a hard 429.

## Output Parsing

Key fields to extract from issue list responses:

| Field | Description | Use |
|-------|-------------|-----|
| `id` | Issue ID | Fetch events, link findings |
| `title` | Error type + message | Finding description |
| `count` | Total event count | Frequency analysis |
| `firstSeen` | ISO timestamp of first occurrence | Age, deploy correlation |
| `lastSeen` | ISO timestamp of most recent event | Recency, active vs stale |
| `culprit` | Function/module where error occurred | Quick root cause hint |
| `permalink` | Direct link to issue in Sentry UI | Include in reports |
| `status` | `resolved`, `unresolved`, `ignored` | Filter relevant issues |
| `substatus` | `new`, `regressed`, `escalating`, `ongoing` | Regression detection |

```bash
# Example: extract key fields with jq
echo "$RESPONSE" | jq -r '.[] | "\(.id) | \(.title) | count=\(.count) | first=\(.firstSeen) | last=\(.lastSeen) | \(.culprit) | \(.permalink)"'
```

## Gotchas

- **statsPeriod vs start/end:** Use `statsPeriod=1h` for relative windows. Use `start` and `end` ISO timestamps for absolute ranges. Do not mix them — the API ignores `statsPeriod` when `start`/`end` are present.
- **Pagination is mandatory for large result sets.** Responses include a `Link` header with cursor values. Always check for `rel="next"; results="true"` and follow the cursor. Default page size is 100; max is 100.
- **Issue count vs event count:** The `count` field on an issue is the total event count, not the count within your `statsPeriod`. Use the `stats` parameter or the events endpoint for time-windowed counts.
- **Project vs org endpoints:** Project-scoped endpoints (`/projects/{org}/{project}/issues/`) return only that project's data. Org-scoped endpoints (`/organizations/{org}/issues/`) search across all projects — use org-scoped for cross-service investigations.
- **sentry-cli auth:** sentry-cli reads `SENTRY_AUTH_TOKEN` automatically. If using a `.sentryclirc` file, the env var takes precedence.
- **DSN vs auth token:** DSNs are for sending events from applications. API investigation requires an auth token with `project:read`, `event:read`, and `org:read` scopes.
- **Rate limits vary by plan:** Self-hosted Sentry may have no rate limits. SaaS plans enforce per-endpoint limits. Always implement retry logic.
- **Event retention:** Events are retained based on your Sentry plan (30-90 days typically). Queries for older data return empty results without error.
- **Timezone awareness:** All Sentry timestamps are UTC. Convert to local time only for display, never for queries.

## API Reference

See [references/api-reference.md](references/api-reference.md) for full endpoint documentation, query parameters, response formats, and pagination details.
