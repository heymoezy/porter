import crypto from 'crypto';

export function createRequestId(): string {
  return crypto.randomUUID();
}

// Log structured event
export function logEvent(
  severity: string,
  domain: string,
  eventType: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  const entry = {
    ts: new Date().toISOString(),
    severity,
    domain,
    event_type: eventType,
    message,
    ...extra,
  };
  if (severity === 'error') console.error(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}
