---
name: Kraken Assets
description: "List all tradeable assets and their metadata on Kraken"
homepage: https://docs.kraken.com/api/http-api-trading
metadata:
  openclaw:
    emoji: "🪙"
    category: "crypto"
    requires:
      bins: ["curl"]
---

# Kraken Assets

Lists all available assets on the Kraken exchange with metadata.

## Usage

```bash
curl -s "https://api.kraken.com/0/public/Assets"
```

## Response Fields

Per asset: `aclass` (asset class), `altname` (display name), `decimals`, `display_decimals`, `status` (enabled/disabled)
