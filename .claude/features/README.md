# Feature Backlog

Ideas and planned features organized by phase.

## Status Legend
- ⬜ Backlog (idea logged)
- 🔄 In Progress (task created)
- ✅ Shipped (archived)

---

## MVP — Must Ship

| Feature | Complexity | Value | Status |
|---------|------------|-------|--------|
| Project CRUD + Phase Approval | L | High | ✅ Shipped |
| Agent CLI (init, sync, status) | L | High | ✅ Shipped |
| JSONL + Git Parsers | M | High | ✅ Shipped |
| AI Daily Entry Generation | M | High | ✅ Shipped |
| Daily Review UI | M | High | ✅ Shipped |
| Email Notifications | M | Medium | ✅ Shipped |
| Dashboard | M | Medium | ✅ Shipped |
| Monthly Capitalization Report | L | High | ✅ Shipped |
| Unit Tests | M | High | ✅ Shipped |

## v1.0 — First Release

| Feature | Complexity | Value | Status |
|---------|------------|-------|--------|
| Project Detail Report | M | High | ✅ Shipped |
| Unconfirmed Entries Report | S | Medium | ✅ Shipped |
| Team Management (Admin) | M | Medium | ✅ Shipped |
| Excel/CSV Export | M | High | ✅ Shipped |
| Reminder Emails (bulk) | S | Medium | ✅ Shipped |
| Claude Code Hooks (real-time) | M | High | ✅ Shipped |
| MCP Server (Claude-native tools) | M | Medium | ✅ Shipped |
| Enhancement Workflow (post-impl) | L | High | ✅ Shipped |
| Date-Aware Authorization | M | High | ✅ Shipped |
| Entry Generation Guards | M | High | ✅ Shipped |
| Audit Hardening ($transaction, RBAC) | L | High | ✅ Shipped |
| Onboarding Documentation | S | Medium | ✅ Shipped |

## v1.1 — Fast Follow

| Feature | Complexity | Value | Status |
|---------|------------|-------|--------|
| VS Code/WakaTime Integration | M | Low | ⬜ Backlog |
| Agent Error Handling + Retry | M | Medium | ✅ Shipped |
| Agent Self-Update Check | S | Low | ⬜ Backlog |
| systemd Timer Templates | S | Medium | ✅ Shipped |
| Post-Sync Auto-Generation | S | High | ✅ Shipped |
| Activity-Based Pipeline Status | S | Medium | ✅ Shipped |
| App Proxy / Reverse Proxy Setup | M | Medium | ⬜ Backlog |
| phaseEffective (Manager Override) | L | High | 🔄 In Progress |

## v2.0 — Future

| Feature | Complexity | Value | Status |
|---------|------------|-------|--------|
| Project Doc Enrichment for AI Matching | S | Low | ⬜ Backlog |
| ASU 2025-06 Dual Standard Support | XL | Medium | ⬜ Backlog |
| Multi-Tenant Support | XL | Low | ⬜ Backlog |
| Real-Time Dashboard (WebSocket) | M | Low | ⬜ Backlog |
| API Documentation (OpenAPI) | M | Medium | ⬜ Backlog |

---

## Complexity Guide
- **S** — < 1 day, single file changes
- **M** — 1-3 days, multiple files
- **L** — 3-7 days, cross-cutting concerns
- **XL** — 1-2+ weeks, major subsystem
