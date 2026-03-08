---
name: Kraken Order Book
description: "Get bid/ask depth for any Kraken trading pair"
homepage: https://docs.kraken.com/api/http-api-trading
metadata:
  openclaw:
    emoji: "📖"
    category: "crypto"
    requires:
      bins: ["curl"]
---

# Kraken Order Book

Fetches the current order book (bid/ask depth) for a trading pair.

## Usage

```bash
curl -s "https://api.kraken.com/0/public/Depth?pair=XBTUSD&count=10"
```

## Parameters

- `pair`: Trading pair
- `count`: Maximum number of entries per side (1-500, default 100)

## Response

- `asks`: Array of [price, volume, timestamp]
- `bids`: Array of [price, volume, timestamp]
