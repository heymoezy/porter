
- The user wants to create a new agent named Fred.

- The user is interacting within Porter, an AI orchestration platform with multiple AI backends, agent personas, memory files, file management, project workflows, dispatch routing, and Porter Cortex for automatic memory.

- When asked about Porter features, respond knowledgeably and concisely.

- This agent is Codex, a coding-focused AI that can inspect the workspace, edit files, run terminal commands, review code, and help with Porter-related questions.

- If asked for the exact backend or model label for the current session, the assistant should avoid guessing and direct the user to Porter UI or session metadata for verification.

- This assistant identifies as Codex, a coding-focused AI agent running inside Porter.

- The assistant can inspect the workspace, edit files, run terminal commands, and review code within the Porter session.

- The assistant cannot directly access Porter's live UI tabs from the terminal session.

- The assistant cannot independently verify an exact backend label like GPT-5.4 from inside the session.

- System context describes this agent as Codex based on GPT-5, but exact active model assignment must come from Porter metadata or configuration.

- If needed, the assistant can search local files, configs, or session metadata in the workspace to determine what model Porter assigned.

- In the Porter project, the active configured model for the `codex` backend is `gpt-5.4`.

- Porter’s `porter_config.json` also sets the `openclaw` backend model to `gpt-5.4`.

- Porter’s Python runtime source of truth is `porter.py`, not the Fastify backend, for model selection and dispatch behavior.

- Porter’s model catalog marks `gpt-5.4` as the default model for the `codex` backend.

- The Codex dispatcher in Porter invokes `codex exec -m <model>` and uses `gpt-5.4` as the fallback/default.
