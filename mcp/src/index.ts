#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

// Entry point: wire the InvesTax MCP server to a stdio transport so it runs
// under Claude Desktop / any MCP client via `npx investax-mcp`. All tool logic
// lives in server.ts / quickTax.ts (unit-tested); this file is just the wire-up.
async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Never log to stdout: stdout is the MCP protocol channel. Diagnostics go to
  // stderr so they don't corrupt the JSON-RPC stream.
  console.error('InvesTax MCP server running on stdio.');
}

main().catch((err) => {
  console.error('Fatal: InvesTax MCP server failed to start.', err);
  process.exit(1);
});
