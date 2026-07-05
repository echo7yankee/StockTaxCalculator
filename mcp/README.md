# InvesTax MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets Claude and other
agent products call [InvesTax](https://investax.app) by name for a **deterministic Romanian
investment-tax estimate** (capital gains, dividends net of the foreign-withholding credit, and
the CASS health contribution) for the Declaratia Unica.

It wraps the free, public quick-calc endpoint. The paid moat, parsing a real broker statement
(Trading 212, Revolut, IBKR) into the exact Declaratia Unica figures, is **not** exposed here.

## Tool

### `quick_tax_estimate`

Computes the estimate from manual figures. All amounts are in RON.

| Argument | Type | Default | Description |
|---|---|---|---|
| `capitalGains` | number | `0` | Net capital gains for the year. Use 0 for a net loss. |
| `dividends` | number | `0` | Gross dividends received. |
| `withholdingTaxPaid` | number | `0` | Foreign withholding tax already paid at source. |
| `otherNonSalaryIncome` | number | `0` | Other non-salary income counting toward the CASS ceiling. |
| `country` | string | `"RO"` | ISO 3166-1 alpha-2 code. Only `RO` is supported. |

Returns a human-readable summary including the per-component tax, the total owed, the standard
"estimate, not tax advice" disclaimer, and a link to https://investax.app for the full
statement-based calculation.

## Usage

Run it with `npx` (no install needed):

```bash
npx investax-mcp
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "investax": {
      "command": "npx",
      "args": ["-y", "investax-mcp"]
    }
  }
}
```

### Configuration

| Env var | Default | Purpose |
|---|---|---|
| `INVESTAX_API_URL` | `https://investax.app/api` | Override the API base (used for local testing). |

## Notes

- Tax rules are Romania-specific and scoped to the supported tax year. The endpoint reports the
  `taxYear` it used, so the answer stays correct as the year advances.
- This is a manual **estimate**, not tax advice. For numbers with legal weight (the ones you file
  in the Declaratia Unica), use the statement-based calculation at https://investax.app.

## License

MIT
