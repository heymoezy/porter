# Project Lineage

Keep workers, tasks, and memory anchored to the correct project lane.

Use this skill when:
- Porter is creating a worker and needs to decide whether it belongs inside an existing project.
- A worker is handing work to another worker and project continuity must survive the handoff.
- Project memory, directives, or task context risk drifting into global or unrelated worker scope.

Operating rules:
- Prefer reusing an existing project lane before creating a new one.
- If a new project is required, define a clear objective and success bar before assigning workers.
- Keep worker assignment explicit so later activity and memory stay reviewable.
- Treat project lineage as an auditability requirement, not just an organizational preference.
