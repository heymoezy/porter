---
name: Kraken OHLC
description: "Get OHLC candle data for technical analysis on any Kraken pair"
homepage: https://docs.kraken.com/api/http-api-trading
metadata:
  openclaw:
    emoji: "🕯️"
    category: "crypto"
    requires:
      bins: ["curl"]
---

# Kraken OHLC

Fetches OHLC (Open/High/Low/Close) candlestick data for technical analysis.

## Usage

```bash
curl -s "https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=60"
```

## Parameters

- `pair`: Trading pair (e.g., XBTUSD)
- `interval`: Candle interval in minutes (1, 5, 15, 30, 60, 240, 1440, 10080, 21600)
- `since`: Return data since given UNIX timestamp (optional)

## Response

Array of candle entries: [time, open, high, low, close, vwap, volume, count]

## Intervals

| Value | Period |
|-------|--------|
| 1 | 1 minute |
| 5 | 5 minutes |
| 15 | 15 minutes |
| 60 | 1 hour |
| 240 | 4 hours |
| 1440 | 1 day |
| 10080 | 1 week |
