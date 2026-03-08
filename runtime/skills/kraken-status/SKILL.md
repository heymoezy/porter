---
name: Kraken System Status
description: "Check if Kraken exchange is online and operational"
homepage: https://docs.kraken.com/api/http-api-trading
metadata:
  openclaw:
    emoji: "💚"
    category: "crypto"
    requires:
      bins: ["curl"]
---

# Kraken System Status

Checks current Kraken exchange system status.

## Usage

```bash
curl -s "https://api.kraken.com/0/public/SystemStatus"
```

## Response

- `status`: "online", "maintenance", "cancel_only", "post_only"
- `timestamp`: ISO 8601 timestamp

## Example

```bash
curl -s "https://api.kraken.com/0/public/SystemStatus" | python3 -c "import sys,json; d=json.load(sys.stdin)['result']; print(f'Kraken: {d[\"status\"]} ({d[\"timestamp\"]})')"
```
