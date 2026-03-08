#!/usr/bin/env node
// Extract the largest inline <script> block from porter.py for syntax checking
const fs = require('fs');

const porterPath = process.argv[2] || '/home/lobster/documents/porter/porter.py';
const outPath = process.argv[3] || '/tmp/porter-inline.js';

const py = fs.readFileSync(porterPath, 'utf8');

const scriptMatches = [...py.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (!scriptMatches.length) {
  console.error('ERROR: no <script>...</script> found in porter.py');
  process.exit(2);
}

// Use largest script block (main UI script)
let best = scriptMatches[0][1];
for (const m of scriptMatches) {
  if ((m[1] || '').length > best.length) best = m[1];
}

fs.writeFileSync(outPath, best, 'utf8');
console.log(`Extracted ${best.length} chars -> ${outPath}`);
