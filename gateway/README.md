# Toolbelt OAuth Gateway — the lowest-friction way to connect Claude to a Toolbelt agent

Gives Toolbelt's MCP endpoints real **MCP OAuth** (discovery, dynamic client registration,
PKCE) with **zero Toolbelt source changes** and **zero npm dependencies**. The end-user
experience is the shortest possible: **Add connector → paste a URL → sign in.** No file to
download, no plugin to install, no API key typed into a chat, no workspace ID to look up
(it's in the URL). Works in Claude Desktop, Cowork, **and claude.ai web**.

The user enters their Toolbelt API key once on the gateway's sign-in page; the gateway
seals it into AES-256-GCM tokens, so Claude only ever holds opaque tokens. Stateless — no
database; rotating `GATEWAY_SECRET` revokes everything.

---

## Deploy it once (Render — easiest, ~5 minutes)

1. Push this repo to GitHub (public or private — Render supports both).
2. In [Render](https://dashboard.render.com): **New → Blueprint** → connect this repo.
   It reads `render.yaml` and provisions the gateway. `GATEWAY_SECRET` is auto-generated
   and persisted; `PUBLIC_URL` auto-detects. Click **Apply**.
3. When it's live, note the URL (e.g. `https://toolbelt-oauth-gateway.onrender.com`) and
   verify:
   - `https://<your-gateway>/health` → `{"ok":true,...}`
   - `https://<your-gateway>/.well-known/oauth-authorization-server` → JSON with `S256`
4. (Recommended) Custom domain: add `connect.apexti.com` in Render → one CNAME. Set
   `PUBLIC_URL` to `https://connect.apexti.com` and redeploy.
5. (Recommended) Use the **Starter** plan ($7/mo) so it stays warm — the free tier
   cold-starts (~50s) which makes the first connect feel slow.

**Any other host works too** (the `Dockerfile` is zero-dependency): Fly.io, Railway, Cloud
Run, or a VPS behind Caddy. Just set `GATEWAY_SECRET` (any 32+ hex chars) and `PUBLIC_URL`
(the exact public origin).

## Connect from Claude (what each end user does)

1. Settings → **Connectors → Add connector** (or "+" → Add connector in a chat).
2. Paste the agent's URL:
   `https://<your-gateway>/workspaces/<workspace_id>/mcp`
3. Claude opens the gateway sign-in page → paste your Toolbelt API key once → done.

That's it — the agent's tools load, namespaced and self-routing (the connector recognizes
itself, so the marketplace routing skill is optional but still nice for proactive
"talk to my Chief-of-Staff" phrasing).

## For operators distributing to customers

Each agent is one URL: `https://<gateway>/workspaces/<that agent's workspace id>/mcp`.
Hand your customer the URLs for the agents they should have (or a one-page list). Their
employees add the connector and sign in with their own Toolbelt keys — so per-user access
and IT/Security's server-side tool policy both apply. Pair with the marketplace routing
skills for the best in-chat experience.

## Security notes

- Access tokens (30d) + refresh tokens (90d) carry the sealed key; the gateway holds no state.
- Global revocation: rotate `GATEWAY_SECRET`. Per-user revocation: rotate that user's
  Toolbelt API key in Toolbelt.
- The sign-in page validates the key against Toolbelt (`GET /api/workspaces`) and rejects
  only keys Toolbelt reports invalid (401).
- When Toolbelt ships native OAuth, swap the key-entry page for a real Toolbelt login and
  nothing changes for users.

## Test

`node ../../toolbelt-assistant-mcpb/test/gateway.test.mjs` — full PKCE flow, tamper
rejection, and an end-to-end MCP call through the gateway against a mock Toolbelt.
