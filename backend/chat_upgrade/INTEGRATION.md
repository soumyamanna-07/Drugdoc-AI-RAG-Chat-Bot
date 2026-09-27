# Backend chat upgrade

This package is deliberately domain-neutral. It adds authenticated,
user-specific chat history and latency instrumentation without changing the
domain/RAG answer policy.

## What it fixes

### 1. Login-specific memory

Every chat row contains both `session_id` and the authenticated `user_id`.
The server obtains `user_id` from the existing signed bearer token, not from:

- browser local storage
- IP address
- device ID
- a frontend-supplied user ID

The frontend therefore only needs to send:

`Authorization: Bearer <token>`

Do not let the browser choose the `user_id`.

### 2. New chat + previous chats

The frontend can use:

- `POST /api/chats` — create a new conversation
- `GET /api/chats` — list this user's previous conversations
- `GET /api/chats/{session_id}` — reopen a conversation
- `PATCH /api/chats/{session_id}` — rename
- `DELETE /api/chats/{session_id}` — delete
- `POST /api/chats/{session_id}/messages` — persist a generic message

When a user clicks an item in search, the frontend should create a new chat
and navigate to it. The history button can then call `GET /api/chats`.

### 3. Latency measurement

`GET /health/latency` exposes rolling request timing. Use this before
changing retrieval/model settings. A single average latency number is not
enough; p95 and the slowest routes are much more useful.

## Important integration point

Apply `integration_patch.diff` to the repository's current `backend/main.py`.

The existing `/query` handler should then be updated separately so that its
internal conversation/RAG state is keyed by the authenticated user's ID
rather than a browser-generated session alone.

Conceptually:

    scoped_session_id = f"{current_user['id']}:{req.session_id}"

Then pass that scoped ID into the existing session/memory layer.

Do NOT accept a raw `user_id` from the browser.

## Persistence

The default database is:

`data/chat_history.sqlite3`

For deployment, set:

`CHAT_DB_PATH=/path/to/chat_history.sqlite3`

The database uses SQLite WAL mode and indexed `(user_id, updated_at)` and
`(session_id, id)` lookups.

## Frontend contract

The frontend owns navigation/UI. The backend only supplies the data:

1. Search result clicked
2. `POST /api/chats` -> receive `session_id`
3. Open the new chat
4. On history button, `GET /api/chats`
5. Selecting a previous chat -> `GET /api/chats/{session_id}`

The backend does not prescribe the visual design.

## Security

Because chat history may contain sensitive user-entered information:

- require authentication on all chat-history endpoints
- never expose another user's session by ID
- never use local-device IDs as ownership
- keep `AUTH_SECRET` out of source control
- use HTTPS in deployment
