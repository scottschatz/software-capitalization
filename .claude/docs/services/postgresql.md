# PostgreSQL

## Purpose
Primary data store. 21 tables managed by Prisma 7, with database-level immutability triggers.

## Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Connection string (e.g., `postgresql://user:pass@localhost:5432/software_capitalization`) |

## Files Where Used
- `web/prisma/schema.prisma` — Schema definition (21 models)
- `web/prisma.config.ts` — Prisma 7 configuration
- `web/prisma/immutability_triggers.sql` — BEFORE UPDATE/DELETE triggers on raw_* tables
- `web/prisma/migrations/` — Migration files
- `web/src/lib/prisma.ts` — PrismaClient singleton with PrismaPg adapter

## Configuration
- **Version**: PostgreSQL 16
- **Database name**: `software_capitalization`
- **ORM**: Prisma 7.3.0 with `@prisma/adapter-pg`

## Immutability Triggers
Three tables are protected by `BEFORE UPDATE OR DELETE` triggers that `RAISE EXCEPTION`:
- `raw_sessions`
- `raw_commits`
- `raw_vscode_activity`

These must be applied manually: `psql -f web/prisma/immutability_triggers.sql`

## Official Docs
- [Prisma 7 Docs](https://www.prisma.io/docs)
- [PostgreSQL 16 Docs](https://www.postgresql.org/docs/16/)

## Gotchas
- Prisma 7 requires `prisma-client` generator (not `prisma-client-js`)
- No `url` in datasource block — configured via `prisma.config.ts` + `@prisma/adapter-pg`
- `PrismaClient({ adapter })` required — no zero-arg constructor
- `$use` middleware removed in Prisma 7 — rely on DB triggers for immutability
