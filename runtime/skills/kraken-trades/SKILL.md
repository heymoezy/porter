---
name: Kraken Recent Trades
description: "Get recent public trades for order flow analysis"
homepage: https://docs.kraken.com/api/http-api-trading
metadata:
  openclaw:
    emoji: "⏱️"
    category: "crypto"
    requires:
      bins: ["curl"]
---

# Kraken Recent Trades

Fetches recent public trades for a pair, useful for order flow analysis.

## Usage

```bash
curl -s "https://api.kraken.com/0/public/Trades?pair=XBTUSD"
```

## Parameters

- `pair`: Trading pair
- `since`: Return trades since timestamp (optional)
- `count`: Max trades to return (optional, default 1000)

## Response

Array of [price, volume, time, buy/sell, market/limit, miscellaneous] entries.
