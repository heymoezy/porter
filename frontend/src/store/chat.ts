import { create } from 'zustand';
import { api } from '../lib/api';

export interface Message {
  id?: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts: number;
  model_id?: string;
  attachments?: Attachment[];
}

export interface Attachment {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  created_at: number;
}

export interface ChatSession {
  id: string;
  title: string;
  model: string;
  messages: number;
  updated: string;
}

interface ChatState {
  sessions: ChatSession[];
  activeSessionId: string | null;
  messages: Message[];
  isLoading: boolean;
  error: string | null;

  fetchSessions: () => Promise<void>;
  loadSession: (sessionId: string) => Promise<void>;
  sendMessage: (prompt: string, modelId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  messages: [],
  isLoading: false,
  error: null,

  fetchSessions: async () => {
    set({ isLoading: true });
    try {
      const data = await api<{ ok: boolean; sessions: ChatSession[] }>('/api/chat/sessions', { method: 'GET' });
      if (data.ok) {
        set({ sessions: data.sessions, error: null });
      }
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  loadSession: async (sessionId: string) => {
    set({ isLoading: true, activeSessionId: sessionId });
    try {
      const data = await api<{ ok: boolean; chat: any }>('/api/chat', {
        json: { action: 'load', chat_id: sessionId }
      });
      if (data.ok) {
        set({ messages: data.chat.messages, error: null });
      }
    } catch (err: any) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  sendMessage: async (prompt: string, modelId: string) => {
    const { activeSessionId } = get();
    const chatId = activeSessionId || Math.random().toString(36).substring(2, 15);
    if (!activeSessionId) set({ activeSessionId: chatId });

    // Optimistic update
    const userMsg: Message = { role: 'user', content: prompt, ts: Date.now() / 1000 };
    set((s) => ({ messages: [...s.messages, userMsg] }));

    try {
      // We use SSE for the actual stream
      const url = `/api/chat/stream?model=${encodeURIComponent(modelId)}&chat_id=${encodeURIComponent(chatId)}&prompt=${encodeURIComponent(prompt)}`;
      const eventSource = new EventSource(url);

      let assistantMsg: Message = { role: 'assistant', content: '', ts: Date.now() / 1000, model_id: modelId };
      set((s) => ({ messages: [...s.messages, assistantMsg] }));

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.token) {
          assistantMsg.content += data.token;
          set((s) => ({
            messages: s.messages.map((m, i) => i === s.messages.length - 1 ? { ...assistantMsg } : m)
          }));
        }
        if (data.done) {
          eventSource.close();
          get().fetchSessions(); // Refresh session list
        }
        if (data.error) {
          set({ error: data.error });
          eventSource.close();
        }
      };

      eventSource.onerror = () => {
        set({ error: 'Stream disconnected' });
        eventSource.close();
      };
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  deleteSession: async (sessionId: string) => {
    try {
      await api('/api/chat', { json: { action: 'delete', chat_id: sessionId } });
      set((s) => ({
        sessions: s.sessions.filter((sess) => sess.id !== sessionId),
        activeSessionId: s.activeSessionId === sessionId ? null : s.activeSessionId,
        messages: s.activeSessionId === sessionId ? [] : s.messages,
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  renameSession: async (sessionId: string, title: string) => {
    try {
      await api('/api/chat', { json: { action: 'rename', chat_id: sessionId, title } });
      set((s) => ({
        sessions: s.sessions.map((sess) => sess.id === sessionId ? { ...sess, title } : sess)
      }));
    } catch (err: any) {
      set({ error: err.message });
    }
  },
}));
