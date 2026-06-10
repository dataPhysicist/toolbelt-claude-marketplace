# Toolbelt OAuth Gateway

Gives Toolbelt's MCP endpoints real **MCP OAuth** (discovery, dynamic client registration,
PKCE) with **zero Toolbelt source changes** and zero npm dependencies. Users sign in once on
a web page with their Toolbelt API key; Claude only ever holds opaque AES-256-GCM-sealed
tokens. Stateless — no database; rotating `GATEWAY_SECRET` revokes everything.

## Run

```bash
GATEWAY_SECRET="$(openssl rand -hex 32)" \
PUBLIC_URL="https://connect.apexti.com" \
node gateway/index.js          # PORT=8787 by default
```

Deploy anywhere that gives you HTTPS + Node 18+ (Fly.io, Render, Railway, a VPS behind
Caddy). `PUBLIC_URL` must be the exact public origin — it is baked into the OAuth metadata.

## Connect from Claude

Use this URL as a **remote MCP connector** (claude.ai custom connector, Cowork "Add
connector", or a plugin `.mcp.json` with `"type": "http"`):

```
https://connect.apexti.com/workspaces/<workspace_id>/mcp
```

Claude will discover OAuth, open the sign-in page, the user enters their Toolbelt API key
once, and everything works — no key in chat, no key in Claude's logs, works on claude.ai
web too (which can't run local extensions at all).

## Security notes

- Access tokens (30d) and refresh tokens (90d) carry the sealed key; the gateway holds no state.
- Revocation: rotate `GATEWAY_SECRET` (global) — per-user revocation = rotate that user's
  Toolbelt API key in Toolbelt, which invalidates what their tokens unseal to.
- The key-entry POST validates against Toolbelt and rejects 401/403 keys.
- Until Toolbelt ships native OAuth, this is the standard bridge pattern; swap the key-entry
  page for a real Toolbelt login when that lands and nothing else changes for users.

## Test

`node test/gateway.test.mjs` in `toolbelt-assistant-mcpb/` — full PKCE flow, tamper
rejection, and an end-to-end MCP call through the gateway against a mock Toolbelt.
