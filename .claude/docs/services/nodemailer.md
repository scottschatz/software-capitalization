# Nodemailer (SMTP Email)

## Purpose
Sends daily review emails and phase change approval notifications with JWT-signed quick-action buttons.

## Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| `SMTP_HOST` | Yes | SMTP server hostname |
| `SMTP_PORT` | Yes | SMTP port (typically 587) |
| `SMTP_USER` | Yes | SMTP username |
| `SMTP_PASS` | Yes | SMTP password |
| `SMTP_SECURE` | No | "true" for TLS (default: false) |
| `EMAIL_FROM` | Yes | Sender address |
| `EMAIL_JWT_SECRET` | No | JWT secret for action tokens (falls back to NEXTAUTH_SECRET) |

## Files Where Used
- `web/src/lib/email/mailer.ts` — Nodemailer transport singleton
- `web/src/lib/email/templates.ts` — HTML email template builders
- `web/src/lib/email/tokens.ts` — JWT token creation/verification (72h expiry)
- `web/src/lib/jobs/send-daily-emails.ts` — Daily email job (8 AM systemd timer)
- `web/src/app/api/email-reply/approve/route.ts` — GET handler for email action buttons
- `web/src/app/api/email-reply/inbound/route.ts` — POST handler for AI reply processing

## Email Types
1. **Daily Review** — Activity summary with "Approve All" + "Review & Edit" buttons
2. **Phase Change Approval** — "Approve" + "Reject" + "Review Details" buttons

## Official Docs
- [Nodemailer Docs](https://nodemailer.com/)
- [jsonwebtoken on npm](https://www.npmjs.com/package/jsonwebtoken)

## Gotchas
- Email action buttons use GET requests (not POST) for email client compatibility
- JWTs expire after 72 hours — users must use web UI after that
- JWT secret falls back to `NEXTAUTH_SECRET` then to `'dev-secret'` (dev only)
