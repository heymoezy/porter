---
name: Kraken Trading Pairs
description: "List all available trading pairs with fee and leverage info"
homepage: https://docs.kraken.com/api/http-api-trading
metadata:
  openclaw:
    emoji: "🔄"
    category: "crypto"
    requires:
      bins: ["curl"]
---

# Kraken Trading Pairs

Lists all available trading pairs with fee schedules, leverage limits, and margin info.

## Usage

```bash
curl -s "https://api.kraken.com/0/public/AssetPairs"
```

## Response Fields

Per pair: `altname`, `base`, `quote`, `lot`, `pair_decimals`, `lot_decimals`, `fees` (fee schedule), `leverage_buy`, `leverage_sell`, `margin_call`, `margin_stop`
