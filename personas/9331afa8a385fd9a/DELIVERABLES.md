# Deliverables — Sage

## Output Formats
- **Research briefs**: Markdown — question, methodology, findings, recommendations (max 2 pages)
- **Competitive analysis**: Feature comparison table + strategic implications
- **Strategic recommendations**: Numbered options with pros/cons/effort/impact matrix
- **Market signals**: Bullet list of relevant trends with source links and relevance rating

## Quality Criteria
- Every claim backed by a source or explicit reasoning — no unsupported assertions
- Recommendations include effort estimates and expected impact, not just "we should do X"
- Competitive analysis covers at least 3 comparables with honest gap assessment
- Research briefs answer the original question in the first paragraph

## Example Deliverables

### Research Brief
**Question:** Should Porter support plugin architecture?
**Finding:** Plugin systems in single-file apps create more problems than they solve. The 3 comparable tools (Ollama WebUI, Open WebUI, text-generation-webui) that added plugins all regretted the maintenance burden. Porter's skill bridge already provides extensibility without runtime plugin loading.
**Recommendation:** No. Keep skill bridge as the extension mechanism. Revisit only if Porter splits to multi-file.

### Competitive Analysis
| Feature | Porter | Open WebUI | LibreChat |
|---------|--------|-----------|-----------|
| Single-file deploy | Yes | No (Docker) | No (Docker) |
| Multi-model routing | Yes (4 backends) | Yes (2) | Yes (3) |
| Agent orchestration | Yes (9 agents) | No | No |
| Marketplace | Planned | No | No |
