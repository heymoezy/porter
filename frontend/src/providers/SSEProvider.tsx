import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';

type Handler = (data: unknown) => void;

interface SSEBus {
  subscribe: (eventType: string, handler: Handler) => () => void;
}

const SSEContext = createContext<SSEBus | null>(null);

// All known SSE event types -- listeners registered for each
const TYPED_EVENTS = [
  'agent:status', 'agent:activity', 'system:health',
  'decision:made', 'project:update', 'memory:change',
];

export function SSEProvider({ children }: { children: ReactNode }) {
  const listenersRef = useRef<Map<string, Set<Handler>>>(new Map());
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource('/api/events');
    esRef.current = es;

    // Generic message handler (for events without explicit type field in SSE)
    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        const type: string = payload.type || 'unknown';
        listenersRef.current.get(type)?.forEach(fn => fn(payload));
        listenersRef.current.get('*')?.forEach(fn => fn(payload));
      } catch { /* ignore parse errors */ }
    };

    // Named event listeners -- SSE `event:` field triggers these
    TYPED_EVENTS.forEach(type => {
      es.addEventListener(type, ((e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          listenersRef.current.get(type)?.forEach(fn => fn(payload));
        } catch { /* ignore */ }
      }) as EventListener);
    });

    es.onerror = () => {
      // EventSource auto-reconnects -- just log for debugging
      console.debug('[SSEProvider] Connection error, auto-reconnecting...');
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  const bus: SSEBus = {
    subscribe: (eventType, handler) => {
      if (!listenersRef.current.has(eventType)) {
        listenersRef.current.set(eventType, new Set());
      }
      listenersRef.current.get(eventType)!.add(handler);
      return () => { listenersRef.current.get(eventType)?.delete(handler); };
    },
  };

  return <SSEContext.Provider value={bus}>{children}</SSEContext.Provider>;
}

export function useSSEBus(): SSEBus {
  const ctx = useContext(SSEContext);
  if (!ctx) throw new Error('useSSEBus must be used within SSEProvider');
  return ctx;
}
