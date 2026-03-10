# Runtime And Logging Hardening Plan

## Goal

Turn runtime behavior into a first-class operator surface so PorterHQ can detect failures before users report them.

## Current Problem

Porter has many logs and event streams, but the runtime picture is fragmented:

- bridge events
- service logs
- agent logs
- workflow logs
- cortex events
- ad hoc UI errors

This makes debugging possible, but not reliable at hosted SaaS scale.

## Required Runtime Model

Every meaningful action should emit a structured event with:

- `event_type`
- `ts`
- `tenant_id` or future tenant placeholder
- `project_id`
- `persona_id`
- `run_id`
- `task_id`
- `severity`
- `backend`
- `model`
- `status`
- `error_code`
- `error_detail`
- `metadata`

The current event system is close, but not comprehensive enough.

## Event Coverage To Standardize

1. Bridge
- queued
- admitted
- dispatched
- retried
- failed
- completed
- timed_out

2. Orchestration
- planned
- step_started
- handoff
- reassigned
- blocked
- finished

3. Entity lifecycle
- project created/updated/deleted
- squad created/updated/deleted
- persona created/updated/deleted
- worker promoted/retired

4. Memory
- signal extracted
- concept promoted
- directive accepted
- contradiction detected
- memory dismissed

5. UI/runtime health
- client render error
- API handler exception
- failed background workflow
- model probe degradation

## PorterHQ Needs

PorterHQ should eventually receive sanitized event envelopes, not raw logs.

Recommended split:

- local tenant logs remain private
- sanitized event summaries replicate to PorterHQ
- no user content by default
- allow opt-in deep diagnostics for support cases

## Logging Principles

1. Structured first
- freeform strings are secondary

2. Correlatable
- every event should connect back to a run, task, or entity

3. Privacy aware
- tenant-visible content stays local unless explicitly shared

4. Actionable
- operator dashboards should be able to group by event type, version, backend, tenant, and error code

## Immediate Code Work

1. Ensure all project/squad/persona mutations emit structured events
2. Normalize bridge and orchestration error codes
3. Add a lightweight client-error event path for major UI failures
4. Record memory promotion/dismissal events
5. Add version/build metadata to all critical runtime event envelopes

## Runtime Cleanup Direction

The runtime should collapse toward four subsystems:

1. Bridge
- execution scheduling and routing

2. Orchestrator
- planning, delegation, supervision

3. Memory
- extraction, distillation, injection, review

4. Telemetry
- structured event capture, aggregation, PorterHQ export

Anything outside those lanes should be treated as legacy or transitional.
