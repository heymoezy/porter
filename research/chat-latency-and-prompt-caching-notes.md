## Chat Latency And Prompt Caching Notes

Date: 2026-03-11

Primary sources:
- OpenAI Prompt Caching: https://platform.openai.com/docs/guides/prompt-caching
- OpenAI Prompt Guidance: https://developers.openai.com/api/docs/guides/prompt-guidance
- Anthropic Prompt Caching: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching

### What matters

- Prompt caching only helps on exact stable prefixes.
- Static instructions, tools, examples, and repeated context should be at the beginning.
- Variable user input should be at the end.
- Images only benefit from caching if the same image and image settings are reused identically.
- Cache benefits usually start at long prompt thresholds, so tiny chat turns do not gain much.

### What this means for Porter

- Porter currently rebuilds each chat turn as a fresh ephemeral CLI call.
- That means Porter does not get the main API-side cache benefits that official prompt caching is designed for.
- The biggest local wins are still structural:
  - keep Porter's system prompt short and stable
  - stop resending the same attachments every turn
  - reduce carried history aggressively
  - keep runtime selection deterministic for Porter

### Best next step

- Build a warm Porter chat lane instead of spawning a fresh ephemeral Codex process for every Porter turn.
- Preserve a stable prompt prefix across turns.
- Track `time_to_first_token_ms` as the main latency metric, not only total duration.

### Practical rule

- If a context item is durable project state, it belongs in structured state or artifacts.
- If a context item is temporary chat context, keep it out of the stable prefix unless it truly repeats.
