import { useEffect } from 'react';
import { useSSEBus } from '../providers/SSEProvider.js';

/**
 * Subscribe to one or more SSE event types with automatic cleanup on unmount.
 *
 * Usage:
 *   useSSEHub(['agent:activity', 'project:update'], (payload) => {
 *     // handle event
 *   });
 */
export function useSSEHub(
  eventTypes: string | string[],
  handler: (data: unknown) => void,
  deps: unknown[] = [],
) {
  const bus = useSSEBus();
  const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];

  useEffect(() => {
    const unsubs = types.map(t => bus.subscribe(t, handler));
    return () => { unsubs.forEach(fn => fn()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus, ...deps]);
}
