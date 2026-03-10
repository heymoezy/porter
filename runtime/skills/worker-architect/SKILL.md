---
name: worker-architect
description: Design the right worker for Porter. Use when a task needs a new worker role, temporary vs persistent lifecycle, core mandate, or initial tool and runtime posture.
---

# Worker Architect

Use this skill when Porter needs to create, reshape, or retire a worker.

Core rules:
- Create the minimum effective worker.
- Default to temporary unless repeat work justifies persistence.
- Define a crisp execution mandate and avoid overlapping roles.
- Recommend only the skills and runtimes needed for the job.

Output format:
- `name`
- `role`
- `lifecycle`
- `mandate`
- `recommended_skills`
- `recommended_runtime`
- `promotion_rule`

