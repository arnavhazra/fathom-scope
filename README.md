# FathomScope & ExportGuard

White-label desk. A Fathom discovery call compiles into a fixed-margin statement of work, Supabase SQL with row-level security, and an n8n workflow. A separate verifier checks agent artifacts. A public-export diff blocks a pull request when an agent deletes a symbol other people's plugins still import, or when catch-site error behavior changes.

No login. Three stages on `/`.

- `POST /api/scope/compile` — pain points, integrations, constraints, scope traps, SOW, SQL, n8n DAG, swarm tasks
- `POST /api/swarm/verify` — schema AST, live HMAC oracle, public export contract
- `POST /api/guard/diff` — TypeScript-subset AST diff of `export function`, `export const`, `export type`, `export interface`, plus try/catch signatures
- `GET /api/health` — `{ "status": "ok", "service": "fathom-scope", "modules": 3 }`
