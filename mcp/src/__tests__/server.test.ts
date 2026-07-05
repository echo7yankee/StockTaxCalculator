import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it, vi } from 'vitest';
import { createServer } from '../server.js';
import type { QuickTaxResult } from '../quickTax.js';

const RESULT: QuickTaxResult = {
  capitalGainsTax: 1000,
  dividendTax: 0,
  healthContribution: 3300,
  bracketLabel: '6x',
  totalOwed: 4300,
  earlyFilingDiscount: 0,
  totalAfterDiscount: 4300,
  currency: 'RON',
  taxYear: 2025,
  capitalGainsTaxRate: 0.1,
  dividendTaxRate: 0.08,
  disclaimer: 'Estimare orientativa, nu consiliere fiscala. Vezi investax.app.',
  source: 'https://investax.app',
};

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function connectedClient(fetchImpl: typeof fetch): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer({ fetchImpl });
  await server.connect(serverTransport);
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);
  return client;
}

// The MCP text-content shape, narrowed for assertions.
function firstText(result: { content: Array<{ type: string; text?: string }> }): string {
  const block = result.content.find((c) => c.type === 'text');
  return block?.text ?? '';
}

describe('InvesTax MCP server', () => {
  it('exposes exactly the quick_tax_estimate tool', async () => {
    const client = await connectedClient(vi.fn().mockResolvedValue(jsonOk(RESULT)));
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('quick_tax_estimate');
    expect(tools[0].description).toContain('Declaratia Unica');
    // Moat guardrail surfaced in the tool description itself.
    expect(tools[0].description).toContain('not exposed here');
  });

  it('calls the endpoint and returns the estimate with the disclaimer and source', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonOk(RESULT));
    const client = await connectedClient(fetchImpl);

    const result = (await client.callTool({
      name: 'quick_tax_estimate',
      arguments: {
        capitalGains: 10000,
        dividends: 2000,
        withholdingTaxPaid: 200,
        otherNonSalaryIncome: 0,
        country: 'RO',
      },
    })) as { content: Array<{ type: string; text?: string }>; isError?: boolean };

    expect(result.isError).toBeFalsy();
    const text = firstText(result);
    expect(text).toContain('Total owed');
    expect(text).toContain(RESULT.disclaimer);
    expect(text).toContain('Source: https://investax.app');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('applies the schema defaults when arguments are omitted', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonOk(RESULT));
    const client = await connectedClient(fetchImpl);

    await client.callTool({ name: 'quick_tax_estimate', arguments: {} });

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body).toEqual({
      capitalGains: 0,
      dividends: 0,
      withholdingTaxPaid: 0,
      otherNonSalaryIncome: 0,
      country: 'RO',
    });
  });

  it('reports a tool error (not a crash) when the API is unreachable', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const client = await connectedClient(fetchImpl);

    const result = (await client.callTool({
      name: 'quick_tax_estimate',
      arguments: { capitalGains: 5000 },
    })) as { content: Array<{ type: string; text?: string }>; isError?: boolean };

    expect(result.isError).toBe(true);
    expect(firstText(result)).toContain('InvesTax quick estimate failed');
  });
});
