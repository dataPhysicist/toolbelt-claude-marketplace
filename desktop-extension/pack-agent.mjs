#!/usr/bin/env node
/**
 * Build a per-AGENT branded .mcpb — one extension that brings a single Toolbelt agent
 * (its tools + persona) into Claude, named in the Settings list.
 *
 *   node pack-agent.mjs --agent "Chief-of-Staff" --workspace <id> [--out CoS.mcpb]
 *
 * --agent      Required. Stamped into display_name ("Toolbelt — Chief-of-Staff") and baked
 *              into TOOLBELT_AGENT_NAME (names the act_as_<agent> prompt; not asked at install).
 * --workspace  The agent's workspace ID. Baked into the endpoint so the customer only enters
 *              their API key at install. (Omit to let them enter it.)
 * --context    Optional comma-separated storage files to auto-load into context at connect
 *              (e.g. "Memory/OpenLoops.md,Config/identity.json"). Default (if omitted): the
 *              bridge auto-loads files under Memory/ and Config/.
 * --out        Optional output filename (default: <slug>.mcpb).
 *
 * Requires `npm install` to have run in this folder (the bundled SDK is packed in).
 */
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { execSync } from "node:child_process";

const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) opt[argv[i].slice(2)] = argv[i + 1];
}
const agent = opt.agent;
if (!agent) {
  console.error('Usage: node pack-agent.mjs --agent "Name" --workspace <id> [--out file.mcpb]');
  process.exit(1);
}
const slug = agent.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "agent";
const out = opt.out || `${slug}.mcpb`;

const original = readFileSync("manifest.json", "utf8");
const m = JSON.parse(original);

m.display_name = `Toolbelt — ${agent}`;
m.name = `toolbelt-${slug}`;
m.server.mcp_config.env.TOOLBELT_AGENT_NAME = agent; // bake the agent name
delete m.user_config.toolbelt_agent_name; // …so it isn't asked at install
if (opt.workspace) {
  m.server.mcp_config.env.TOOLBELT_MCP_URL = `https://toolbelt.apexti.com/api/workspaces/${opt.workspace}/mcp`;
  delete m.user_config.toolbelt_workspace_id; // baked in → only the API key remains
}
if (opt.context) {
  m.server.mcp_config.env.TOOLBELT_CONTEXT_FILES = opt.context; // explicit memory/config files to preload
}

try {
  writeFileSync("manifest.json", JSON.stringify(m, null, 2) + "\n");
  execSync("npx -y @anthropic-ai/mcpb pack", { stdio: "inherit" });
  renameSync("desktop-extension.mcpb", out); // default pack output → branded name
  console.log(
    `\n✓ Built ${out}  ·  display name "Toolbelt — ${agent}"` +
      (opt.workspace ? "  ·  workspace baked in (only API key needed at install)" : ""),
  );
} finally {
  writeFileSync("manifest.json", original); // always restore the base manifest
}
