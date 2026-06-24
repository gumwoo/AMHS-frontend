# AGENTS.md

This repository uses a CI-based development harness for the AMHS/OHT transfer control frontend.

## First Rule

Do not read every harness document for every task.

Classify the task first. If the parent AMHS workspace provides `.md/` harness documents, read only the relevant ones for the current task.

## Document Routing

Frontend UI or interaction work:

- `.md/02_API_CONTRACT.md`
- `.md/04_FRONTEND_CODING_RULES.md`
- `.md/05_DESIGN_RULES.md`
- `.md/07_DONE_DEFINITION.md`

Frontend API integration or realtime event handling work:

- `.md/02_API_CONTRACT.md`
- `.md/04_FRONTEND_CODING_RULES.md`
- `.md/07_DONE_DEFINITION.md`

Performance-sensitive frontend work:

- `.md/08_PERFORMANCE_VALIDATION.md`
- `.md/04_FRONTEND_CODING_RULES.md`
- `.md/07_DONE_DEFINITION.md`

Documentation or portfolio work:

- actual frontend code being described
- actual backend/API contract being referenced
- measurement results being claimed

## Hard Constraints

- Do not invent status values, API paths, SSE event names, or error codes.
- Do not introduce Kafka, RabbitMQ, WebSocket clients, global state libraries, or server-state libraries unless explicitly requested.
- Keep frontend status types, API client paths, and SSE subscriptions synchronized with backend contracts.
- Do not commit internal `.md/` harness documents unless explicitly requested.
- Keep API calls centralized in `src/api.ts`; do not call `fetch` directly from components.

## Verification

Run these before claiming frontend work is complete:

```powershell
npm run harness:check
npm run lint
npm run build
```

## Feedback Loop

If verification fails, do not only fix the immediate code.

Check whether the failure should become one of these:

- document rule
- frontend type or parser test
- harness-check rule
- API/SSE contract update
- backend/frontend synchronization rule

Promote a failure into the harness only when it can recur or affects API contracts, SSE events, frontend/backend type synchronization, UI consistency, or performance claims.
