---
name: Kraken Ticker
description: "Get real-time price, volume, VWAP for any Kraken trading pair"
homepage: https://docs.kraken.com/api/http-api-trading
metadata:
  openclaw:
    emoji: "📈"
    category: "crypto"
    requires:
      bins: ["curl"]
---

# Kraken Ticker

Fetches real-time ticker information for a cryptocurrency trading pair from the Kraken exchange.

## Usage

```bash
curl -s "https://api.kraken.com/0/public/Ticker?pair=XBTUSD"
```

## Parameters

- `pair`: Trading pair (e.g., XBTUSD, ETHUSD, SOLUSD, XBTETH)

## Response Fields

- `a`: Ask [price, whole lot volume, lot volume]
- `b`: Bid [price, whole lot volume, lot volume]
- `c`: Last trade closed [price, lot volume]
- `v`: Volume [today, last 24 hours]
- `p`: Volume weighted average price [today, last 24 hours]
- `t`: Number of trades [today, last 24 hours]
- `l`: Low [today, last 24 hours]
- `h`: High [today, last 24 hours]
- `o`: Today's opening price

## Common Pairs

- BTC/USD: `XBTUSD` or `XXBTZUSD`
- ETH/USD: `ETHUSD` or `XETHZUSD`
- SOL/USD: `SOLUSD`
- DOT/USD: `DOTUSD`

## Example

```bash
# Get BTC price
curl -s "https://api.kraken.com/0/public/Ticker?pair=XBTUSD" | python3 -c "import sys,json; d=json.load(sys.stdin); r=list(d['result'].values())[0]; print(f'BTC: \${float(r[\"c\"][0]):,.2f} | 24h Vol: {float(r[\"v\"][1]):,.1f} | VWAP: \${float(r[\"p\"][1]):,.2f}')"
```
