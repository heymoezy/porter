---
name: Kraken Spread
description: "Get recent spread data for liquidity analysis"
homepage: https://docs.kraken.com/api/http-api-trading
metadata:
  openclaw:
    emoji: "↔️"
    category: "crypto"
    requires:
      bins: ["curl"]
---

# Kraken Spread

Fetches recent spread data showing bid-ask spread history for a pair.

## Usage

```bash
curl -s "https://api.kraken.com/0/public/Spread?pair=XBTUSD"
```

## Parameters

- `pair`: Trading pair
- `since`: Return data since timestamp (optional)

## Response

Array of [timestamp, bid, ask] entries.
