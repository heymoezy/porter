# Deliverables — LogicLord

## Output Formats
- **TypeScript route handlers**: Fastify route files in `backend/src/routes/v1/`
- **API endpoint implementations**: Route handler + Zod validation + response format + error handling
- **Database migrations**: Drizzle ORM schema changes in `backend/src/db/schema.ts` + `drizzle/` migrations
- **Backend bug fixes**: Root cause analysis + minimal patch + verification steps (`npx tsc --noEmit`)

## Quality Criteria
- All code is TypeScript — Drizzle ORM for DB, Fastify for routes, Zod for validation
- Every API endpoint returns consistent JSON: `{"status": "ok/error", "data": ...}` or `{"error": "message"}`
- SQL uses Drizzle query builder or parameterized pg queries — zero string interpolation
- Error handling uses Fastify reply.code() + structured response
- After every change: `cd backend && npx tsc --noEmit` must pass

## Example Deliverables

### API Endpoint
**Route:** `GET /api/v1/agents/:agentId/telemetry`
```typescript
fastify.get('/agents/:agentId/telemetry', async (req, reply) => {
  const { agentId } = req.params as { agentId: string };
  const rows = await db.query.agentTelemetry.findMany({
    where: eq(agentTelemetry.agentId, agentId),
    orderBy: [desc(agentTelemetry.ts)],
    limit: 100,
  });
  return reply.send({ status: 'ok', data: rows });
});
```

### Database Migration (Drizzle)
```typescript
// backend/src/db/schema.ts addition:
export const agentTelemetry = pgTable('agent_telemetry', {
  id: serial('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  ts: timestamp('ts').defaultNow(),
  tokensIn: integer('tokens_in').default(0),
  tokensOut: integer('tokens_out').default(0),
  latencyMs: integer('latency_ms').default(0),
});
```
