#!/bin/sh
# Find a working python3 (skip the broken macOS Xcode shim)
PYTHON=""
for p in /opt/homebrew/bin/python3 /usr/local/bin/python3 /opt/local/bin/python3; do
  if [ -x "$p" ]; then
    PYTHON="$p"
    break
  fi
done
if [ -z "$PYTHON" ]; then
  echo "No Homebrew/MacPorts python3 found. Trying system python3..."
  PYTHON="python3"
fi
echo "Using: $PYTHON"
$PYTHON ~/porter-agent.py --hub http://100.85.184.74:8877 --token TfVk6krjsOPbqxQBC51gw23mtE_p-5Xw --node-id moes-macbook-air --paths ~/Documents ~/Desktop
