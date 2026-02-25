# API Contract: Return Clarity Backend

**Version:** 1.0  
**Base URL:** `http://localhost:3000/api/v1` (dev) | `https://api.returnclarity.app/api/v1` (prod)  
**Last Updated:** February 2026

---

## Overview

The Return Clarity backend provides a REST API for:
1. **Snapshot persistence** — Save policy summaries from extension
2. **History retrieval** — Fetch past snapshots for a store
3. **Feedback collection** — Submit corrections to extraction accuracy

All endpoints require **token-based authentication** (placeholder in v1, improve with JWT in v2).

---

## Authentication

### Header Format
```http
Authorization: Bearer <token>
```

### Token Management (v1 Placeholder)
- Tokens stored in `users.auth_token` column (UUID, indexed)
- Generated on user creation (manual via Rails console in v1)
- No expiration or rotation in v1 (add in v2)

### Error Response (401)
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or missing authentication token"
  }
}
```

---

## Versioning

- API versioned via URL path: `/api/v1/`, `/api/v2/`, etc.
- Breaking changes require new version
- Non-breaking changes (new fields, new endpoints) can be added to existing version
- Deprecation policy: 6 months notice for v1 → v2 migration

---

## Common Error Codes

| HTTP Status | Code | Meaning |
|-------------|------|---------|
| 200 | OK | Success |
| 201 | CREATED | Resource created |
| 400 | BAD_REQUEST | Invalid request payload |
| 401 | UNAUTHORIZED | Missing or invalid auth token |
| 404 | NOT_FOUND | Resource not found |
| 422 | UNPROCESSABLE_ENTITY | Validation error |
| 429 | RATE_LIMIT_EXCEEDED | Too many requests |
| 500 | INTERNAL_SERVER_ERROR | Server error |

---

## Endpoints

### 1. POST `/api/v1/snapshots`

**Purpose:** Save a policy snapshot from extension.

#### Request

**Headers:**
```http
Content-Type: application/json
Authorization: Bearer <token>
```

**Body:**
```json
{
  "store_domain": "example.myshopify.com",
  "policy_url": "https://example.myshopify.com/policies/refund-policy",
  "page_url": "https://example.myshopify.com/products/crewneck-sweater",
  "policy_type": "refund",
  "summary": {
    "fields": {
      "returnWindow": "30 days",
      "conditionRequirements": "Unworn with tags",
      "fees": "No restocking fee",
      "returnShipping": "Customer pays",
      "exclusions": "Final sale items"
    },
    "confidence": {
      "returnWindow": "high",
      "conditionRequirements": "medium",
      "fees": "high",
      "returnShipping": "medium",
      "exclusions": "low"
    }
  },
  "raw_text_snippet": "Returns accepted within 30 days of purchase...",
  "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...",
  "extension_version": "1.0.0"
}
```

#### Response (201 Created)

```json
{
  "id": 123,
  "status": "saved",
  "store_domain": "example.myshopify.com",
  "policy_url": "https://example.myshopify.com/policies/refund-policy",
  "page_url": "https://example.myshopify.com/products/crewneck-sweater",
  "extracted_at": "2026-02-17T10:30:00Z",
  "checksum": "a3f8b9c2d1e4f5a6b7c8d9e0f1a2b3c4",
  "created_at": "2026-02-17T10:30:15Z"
}
```

#### Error Responses

**422 Unprocessable Entity** (validation error)
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "store_domain": ["can't be blank"],
      "policy_url": ["is not a valid URL"]
    }
  }
}
```

**409 Conflict** (duplicate snapshot with same checksum)
```json
{
  "error": {
    "code": "DUPLICATE_SNAPSHOT",
    "message": "Snapshot with identical content already exists",
    "existing_snapshot_id": 122
  }
}
```

---

### 2. GET `/api/v1/snapshots`

**Purpose:** Retrieve all snapshots saved by the authenticated user (paginated).

#### Request

**URL:** `/api/v1/snapshots?page=1&per_page=10&policy_type=refund&store_domain=example.myshopify.com`

**Headers:**
```http
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number (1-indexed) |
| `per_page` | integer | 10 | Items per page (max 100) |
| `policy_type` | string | all | Optional policy type filter |
| `store_domain` | string | all | Optional store domain filter |

#### Response (200 OK)

```json
{
  "snapshots": [
    {
      "id": 125,
      "store": {
        "domain": "example.myshopify.com",
        "name": "Example Store",
        "platform": "shopify"
      },
      "policy_url": "https://example.myshopify.com/policies/refund-policy",
      "page_url": "https://example.myshopify.com/products/crewneck-sweater",
      "policy_type": "refund",
      "summary": { /* ... */ },
      "extracted_at": "2026-02-17T10:30:00Z",
      "created_at": "2026-02-17T10:30:15Z"
    }
  ],
  "pagination": {
    "current_page": 1,
    "total_pages": 3,
    "total_count": 25,
    "per_page": 10
  }
}
```

#### Error Responses

**401 Unauthorized**
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or missing authentication token"
  }
}
```

---

### 3. GET `/api/v1/stores/:domain/latest`

**Purpose:** Retrieve the most recent snapshot for a store.

#### Request

**URL:** `/api/v1/stores/example.myshopify.com/latest`

**Headers:**
```http
Authorization: Bearer <token>
```

#### Response (200 OK)

```json
{
  "id": 123,
  "store": {
    "domain": "example.myshopify.com",
    "name": "Example Store",
    "platform": "shopify"
  },
  "policy_url": "https://example.myshopify.com/policies/refund-policy",
  "policy_type": "refund",
  "summary": {
    "fields": {
      "returnWindow": "30 days",
      "conditionRequirements": "Unworn with tags",
      "fees": "No restocking fee",
      "returnShipping": "Customer pays",
      "exclusions": "Final sale items"
    },
    "confidence": {
      "returnWindow": "high",
      "conditionRequirements": "medium",
      "fees": "high",
      "returnShipping": "medium",
      "exclusions": "low"
    }
  },
  "extracted_at": "2026-02-17T10:30:00Z",
  "created_at": "2026-02-17T10:30:15Z"
}
```

#### Error Responses

**404 Not Found**
```json
{
  "error": {
    "code": "STORE_NOT_FOUND",
    "message": "No snapshots found for domain: example.myshopify.com"
  }
}
```

---

### 4. GET `/api/v1/stores/:domain/history`

**Purpose:** Retrieve all snapshots for a store (paginated).

#### Request

**URL:** `/api/v1/stores/example.myshopify.com/history?page=1&per_page=10`

**Headers:**
```http
Authorization: Bearer <token>
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number (1-indexed) |
| `per_page` | integer | 10 | Items per page (max 100) |
| `policy_type` | string | all | Filter by policy type: `refund`, `shipping`, `privacy`, etc. |

#### Response (200 OK)

```json
{
  "store": {
    "domain": "example.myshopify.com",
    "name": "Example Store",
    "platform": "shopify"
  },
  "snapshots": [
    {
      "id": 125,
      "policy_url": "https://example.myshopify.com/policies/refund-policy",
      "policy_type": "refund",
      "summary": { /* ... */ },
      "extracted_at": "2026-02-17T10:30:00Z",
      "created_at": "2026-02-17T10:30:15Z",
      "has_changes": false
    },
    {
      "id": 123,
      "policy_url": "https://example.myshopify.com/policies/refund-policy",
      "policy_type": "refund",
      "summary": { /* ... */ },
      "extracted_at": "2026-02-10T14:20:00Z",
      "created_at": "2026-02-10T14:20:30Z",
      "has_changes": true
    }
  ],
  "pagination": {
    "current_page": 1,
    "total_pages": 3,
    "total_count": 25,
    "per_page": 10
  }
}
```

#### Error Responses

**404 Not Found**
```json
{
  "error": {
    "code": "STORE_NOT_FOUND",
    "message": "No snapshots found for domain: example.myshopify.com"
  }
}
```

---

### 5. POST `/api/v1/feedback`

**Purpose:** Submit user feedback on extraction accuracy.

#### Request

**Headers:**
```http
Content-Type: application/json
Authorization: Bearer <token>
```

**Body:**
```json
{
  "snapshot_id": 123,
  "field_name": "returnWindow",
  "correction": "60 days (not 30 days)",
  "comment": "Policy changed last week, current site shows 60 days"
}
```

#### Response (201 Created)

```json
{
  "id": 456,
  "status": "received",
  "snapshot_id": 123,
  "field_name": "returnWindow",
  "created_at": "2026-02-17T11:00:00Z",
  "message": "Thank you for your feedback! We'll review and improve our extraction."
}
```

#### Error Responses

**404 Not Found**
```json
{
  "error": {
    "code": "SNAPSHOT_NOT_FOUND",
    "message": "Snapshot ID 123 not found"
  }
}
```

**422 Unprocessable Entity**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "field_name": ["must be one of: returnWindow, conditionRequirements, fees, returnShipping, exclusions"]
    }
  }
}
```

---

## Rate Limiting

### v1 (Simple)
- **Per user:** 100 requests/hour
- **Per IP:** 1000 requests/hour
- Enforced via `rack-attack` gem

### Headers (Included in all responses)
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1709123456
```

### Error Response (429)
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Retry after 2026-02-17T12:00:00Z",
    "retry_after": "2026-02-17T12:00:00Z"
  }
}
```

---

## CORS Configuration

### Allowed Origins (via env var)
```
ALLOWED_ORIGINS=chrome-extension://EXTENSION_ID_HERE,http://localhost:3000
```

### Headers
```http
Access-Control-Allow-Origin: chrome-extension://EXTENSION_ID_HERE
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Max-Age: 86400
```

---

## Pagination Format

All paginated endpoints follow this format:

**Request:** `?page=2&per_page=20`

**Response:**
```json
{
  "snapshots": [ /* ... */ ],
  "pagination": {
    "current_page": 2,
    "total_pages": 5,
    "total_count": 87,
    "per_page": 20
  }
}
```

---

## Data Types

### PolicySummary (JSONB)
```json
{
  "fields": {
    "returnWindow": "string | null",
    "conditionRequirements": "string | null",
    "fees": "string | null",
    "returnShipping": "string | null",
    "exclusions": "string | null"
  },
  "confidence": {
    "returnWindow": "low | medium | high",
    "conditionRequirements": "low | medium | high",
    "fees": "low | medium | high",
    "returnShipping": "low | medium | high",
    "exclusions": "low | medium | high"
  }
}
```

### Store
```json
{
  "domain": "string (unique, indexed)",
  "name": "string | null",
  "platform": "shopify | other"
}
```

### PolicySnapshot
```json
{
  "id": "integer",
  "store_id": "integer (FK)",
  "user_id": "integer (FK)",
  "policy_type": "refund | shipping | privacy | terms | subscription",
  "policy_url": "string (URL)",
  "page_url": "string (URL) | null",
  "summary": "JSONB (PolicySummary)",
  "raw_text_snippet": "string (first 500 chars)",
  "checksum": "string (SHA256)",
  "extracted_at": "datetime (ISO 8601)",
  "created_at": "datetime (ISO 8601)",
  "updated_at": "datetime (ISO 8601)"
}
```

### Feedback
```json
{
  "id": "integer",
  "policy_snapshot_id": "integer (FK)",
  "user_id": "integer (FK)",
  "field_name": "returnWindow | conditionRequirements | fees | returnShipping | exclusions",
  "correction": "string",
  "comment": "string | null",
  "created_at": "datetime (ISO 8601)"
}
```

---

## Future Endpoints (v2+)

### GET `/api/v1/users/me`
Retrieve current user profile (requires JWT auth)

### GET `/api/v1/stores/:domain/diff?from=:id&to=:id`
Compare two snapshots and return structured diff

### POST `/api/v1/stores/:domain/subscribe`
Subscribe to email alerts for policy changes

### GET `/api/v1/policy-cards/:id`
Public shareable policy card (no auth required)

---

## Changelog

### v1.0.0 (2026-02-17)
- Initial API specification
- 5 core endpoints: create snapshot, user snapshots index, latest, history, feedback
- Token-based auth placeholder
- JSONB for policy summaries
