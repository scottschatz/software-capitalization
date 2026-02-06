# Azure AD (Microsoft Entra ID)

## Purpose
SSO authentication for the web UI via NextAuth v4.

## Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| `AZURE_AD_CLIENT_ID` | Prod | App registration client ID |
| `AZURE_AD_CLIENT_SECRET` | Prod | App registration client secret |
| `AZURE_AD_TENANT_ID` | Prod | `a473edd8-ba25-4f04-a0a8-e8ad25c19632` (Townsquare) |

## Files Where Used
- `web/src/lib/auth.ts` — AzureADProvider configuration
- `web/src/middleware.ts` — Route protection via NextAuth

## Configuration
- **Tenant**: Townsquare Media (`a473edd8-ba25-4f04-a0a8-e8ad25c19632`)
- **Scopes**: `openid`, `email`, `profile`, `User.Read`
- **Domain validation**: Only `@townsquaremedia.com` emails allowed
- **Auto-provisioning**: Developer records created on first login

## Dev Bypass
Set `DEV_AUTH_BYPASS=true` to use CredentialsProvider instead (any email, admin role).

## Official Docs
- [NextAuth Azure AD Provider](https://next-auth.js.org/providers/azure-ad)
- [Microsoft Identity Platform](https://learn.microsoft.com/en-us/entra/identity-platform/)

## Gotchas
- Needs a separate app registration from other Townsquare apps (e.g., invoice-bot)
- Session strategy is `jwt` in dev mode, `database` in production
