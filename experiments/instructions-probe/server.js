#!/usr/bin/env node
/**
 * MCP "instructions" probe — a minimal, zero-dependency stdio MCP server.
 *
 * Purpose: find out, on a given client (e.g. the Claude desktop app), whether
 *   (1) the server connects at all (a tool appears),
 *   (2) the client injects the server's initialize `instructions` into the model's
 *       system prompt (the decisive question for the self-contained-bridge design),
 *   (3) the client surfaces server-provided prompts.
 *
 * It speaks newline-delimited JSON-RPC 2.0 over stdio (the MCP stdio transport).
 * NOTHING is ever written to stdout except protocol messages; debug goes to stderr.
 */

const PROTOCOL_FALLBACK = "2025-06-18";

const INSTRUCTIONS = [
  "PROBE ACTIVE — if you can read this, the client injected the MCP server's",
  "initialize `instructions` field into your context.",
  "For this conversation, begin EVERY reply with the pineapple emoji 🍍 as the very",
  "first character, then a space, then your normal answer. Keep doing it until this",
  "server is removed. This directive exists ONLY in the server's `instructions` field",
  "— it is in no tool description, prompt, or user message. So: if your replies start",
  "with 🍍, this client supports server instructions. If they don't, it ignores them.",
].join(" ");

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function result(id, res) {
  send({ jsonrpc: "2.0", id, result: res });
}

function error(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function handle(msg) {
  const { id, method, params } = msg;
  const isRequest = id !== undefined && id !== null;

  switch (method) {
    case "initialize":
      return result(id, {
        protocolVersion: (params && params.protocolVersion) || PROTOCOL_FALLBACK,
        capabilities: { tools: {}, prompts: {} },
        serverInfo: { name: "mcp-instructions-probe", version: "0.1.0" },
        instructions: INSTRUCTIONS,
      });

    case "notifications/initialized":
    case "initialized":
      return; // notification, no response

    case "ping":
      return isRequest ? result(id, {}) : undefined;

    case "tools/list":
      return result(id, {
        tools: [
          {
            name: "probe_echo",
            description:
              "Echo text back. If you can call this, the probe server is connected and tool calls work.",
            inputSchema: {
              type: "object",
              properties: { text: { type: "string", description: "Anything." } },
              required: ["text"],
            },
          },
        ],
      });

    case "tools/call": {
      const name = params && params.name;
      const args = (params && params.arguments) || {};
      if (name === "probe_echo") {
        return result(id, {
          content: [{ type: "text", text: `probe_echo → ${args.text}` }],
        });
      }
      return error(id, -32602, `Unknown tool: ${name}`);
    }

    case "prompts/list":
      return result(id, {
        prompts: [
          {
            name: "probe-ping",
            description:
              "If you can see/run this, the client surfaced an MCP server prompt.",
          },
        ],
      });

    case "prompts/get": {
      const name = params && params.name;
      if (name === "probe-ping") {
        return result(id, {
          description: "Probe ping",
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: "This text came from an MCP server *prompt*. If you're reading it, prompt surfacing works on this client.",
              },
            },
          ],
        });
      }
      return error(id, -32602, `Unknown prompt: ${name}`);
    }

    default:
      // Unknown request → proper JSON-RPC error; unknown notification → ignore.
      if (isRequest) error(id, -32601, `Method not found: ${method}`);
      return;
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (e) {
      process.stderr.write(`[probe] bad JSON: ${e.message}\n`);
      continue;
    }
    try {
      handle(msg);
    } catch (e) {
      process.stderr.write(`[probe] handler error: ${e.stack || e}\n`);
    }
  }
});
process.stdin.on("end", () => process.exit(0));
process.stderr.write("[probe] mcp-instructions-probe ready on stdio\n");
