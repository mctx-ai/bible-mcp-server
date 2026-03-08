<img src="https://mctx.ai/brand/logo-purple.png" alt="mctx" width="120">

**Free MCP Hosting. Set Your Price. Get Paid.**

# bible\-mcp\-server

The\ Bible\ MCP\ Server\.

---

## Quick Start

```bash
npm install
npm run dev
```

The dev server runs esbuild in watch mode and hot-reloads via `mctx-dev` on every rebuild.

---

## Development

### Build
```bash
npm run build
```
Bundles `src/index.ts` → `dist/index.js` using esbuild (minified ESM output).

### Dev Server
```bash
npm run dev
```
Runs parallel watch mode:
- `dev:build` — esbuild watch (rebuilds on source changes)
- `dev:server` — mctx-dev hot-reloads server on rebuild

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch
```

### Linting
```bash
npm run lint
```

### Formatting
```bash
# Format all files
npm run format

# Check formatting without modifying
npm run format:check
```

---

## Environment Variables

Add your environment variables here. Set them in the [mctx.ai dashboard](https://mctx.ai) when deployed — changes trigger a seamless automatic redeploy.

| Variable | Default | Description |
|---|---|---|
| _(none yet)_ | — | Add yours here |

---

## Deploy

1. Visit [mctx.ai](https://mctx.ai) and connect your repository
2. Set any environment variables in the dashboard
3. Deploy — mctx reads `package.json` for server configuration

mctx handles TLS, scaling, and uptime. You keep the code. Set your price and get paid when other developers use your server.

---

## Learn More

- [`@mctx-ai/mcp-server`](https://github.com/mctx-ai/mcp-server) — Framework documentation and API reference
- [docs.mctx.ai](https://docs.mctx.ai) — Platform guides for deploying and managing MCP servers
- [mctx.ai](https://mctx.ai) — Host your MCP server for free
- [MCP Specification](https://modelcontextprotocol.io) — The protocol spec this server implements
