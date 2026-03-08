/**
 * MCP Server
 *
 * Built with @mctx-ai/mcp-server. Add your tools, resources, and prompts below.
 *
 * Framework patterns:
 *   - Tools      → functions LLM clients can invoke
 *   - Resources  → data exposed via URIs
 *   - Prompts    → reusable message templates
 *
 * Docs: https://github.com/mctx-ai/mcp-server
 */

import {
  createServer,
  T,
  log,
  type ToolHandler,
} from '@mctx-ai/mcp-server';

// ─── Server ──────────────────────────────────────────────────────────────────

const server = createServer({
  instructions:
    // TODO: Describe what your MCP server offers and how to use it.
    // This text is shown to LLM clients so they know what capabilities are available.
    'An MCP server. Update this description to tell clients what this server can do.',
});

// ─── Tools ───────────────────────────────────────────────────────────────────
//
// Tools are functions that LLM clients can invoke.
// Each tool needs: a handler function, a description, and an input schema.
//
// Handler signature: (args, ask?) => string | object | Promise<string | object>
//
// TODO: Replace this example tool with your own.

const hello: ToolHandler = (args) => {
  const { name } = args as { name: string };

  log.info(`Saying hello to ${name}`);

  return `Hello, ${name}!`;
};
hello.description = 'Says hello to a person by name';
hello.input = {
  name: T.string({
    required: true,
    description: 'Name to greet',
    minLength: 1,
    maxLength: 100,
  }),
};
server.tool('hello', hello);

// TODO: Add more tools, resources, and prompts here.
// See https://github.com/mctx-ai/mcp-server for full API documentation.

// ─── Export ──────────────────────────────────────────────────────────────────
//
// The fetch handler processes JSON-RPC 2.0 requests over HTTP.
// Compatible with Cloudflare Workers and mctx hosting.

export default { fetch: server.fetch };
