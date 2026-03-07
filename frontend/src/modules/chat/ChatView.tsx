import { useState, useEffect, useRef } from 'react';
import { Send, History, BrainCircuit, Trash2, Paperclip, Download } from 'lucide-react';
import { useChatStore } from '../../store/chat';

export function ChatView() {
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('auto');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { 
    sessions, activeSessionId, messages, isLoading, 
    fetchSessions, loadSession, sendMessage, deleteSession 
  } = useChatStore();

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input, selectedModel);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeSessionId) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64Data = (reader.result as string).split(',')[1];
      try {
        const res = await fetch('/api/chat/attachments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'upload',
            chat_id: activeSessionId,
            filename: file.name,
            content_type: file.type,
            data: base64Data
          })
        });
        const data = await res.json();
        if (data.ok) {
          // Refresh session to see new attachments
          loadSession(activeSessionId);
        }
      } catch (err) {
        console.error('Upload failed', err);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex h-full bg-neutral-900/30">
      {/* Sessions Sidebar */}
      <aside className="w-64 border-r border-neutral-800 flex flex-col hidden lg:flex">
        <div className="p-4 border-b border-neutral-800 flex items-center justify-between text-xs font-semibold text-neutral-500 uppercase tracking-wider">
          <span>Recent Sessions</span>
          <History className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.map((session) => (
            <div 
              key={session.id}
              onClick={() => loadSession(session.id)}
              className={`group p-3 rounded-lg text-sm cursor-pointer transition-all border ${
                activeSessionId === session.id 
                  ? 'bg-neutral-800/50 text-neutral-200 border-neutral-700/50 shadow-sm' 
                  : 'text-neutral-400 hover:bg-neutral-800/30 border-transparent hover:border-neutral-800/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate flex-1">{session.title}</span>
                <div className="hidden group-hover:flex items-center gap-1">
                  <button onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }} className="p-1 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="mt-1 text-[10px] text-neutral-600 flex items-center justify-between">
                <span>{session.model}</span>
                <span>{session.messages} msgs</span>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative min-w-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-64 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
                  <BrainCircuit className="w-6 h-6 text-orange-500" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-medium text-neutral-200">New Conversation</h3>
                  <p className="text-xs text-neutral-500 max-w-[240px]">
                    Select a model and start typing to begin a new session with Porter.
                  </p>
                </div>
              </div>
            )}
            
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border ${
                  msg.role === 'assistant' 
                    ? 'bg-orange-500/10 border-orange-500/20' 
                    : 'bg-neutral-800 border-neutral-700'
                }`}>
                  {msg.role === 'assistant' ? (
                    <BrainCircuit className="w-5 h-5 text-orange-500" />
                  ) : (
                    <span className="text-[10px] font-bold text-neutral-500">YOU</span>
                  )}
                </div>
                <div className={`space-y-1.5 max-w-[85%] ${msg.role === 'user' ? 'text-right' : ''}`}>
                  <p className="text-sm font-medium text-neutral-200 capitalize">{msg.role}</p>
                  <div className={`text-sm leading-relaxed p-4 rounded-2xl border ${
                    msg.role === 'assistant'
                      ? 'text-neutral-300 bg-neutral-800/20 rounded-tl-none border-neutral-800/50'
                      : 'text-neutral-200 bg-orange-500/10 rounded-tr-none border-orange-500/20'
                  }`}>
                    {msg.content}
                    
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-neutral-800 space-y-2">
                        {msg.attachments.map((att) => (
                          <div key={att.id} className="flex items-center justify-between p-2 rounded-lg bg-black/20 border border-white/5">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <Paperclip className="w-3 h-3 text-neutral-500 flex-shrink-0" />
                              <span className="text-xs truncate text-neutral-400">{att.filename}</span>
                              <span className="text-[10px] text-neutral-600">({(att.size / 1024).toFixed(1)} KB)</span>
                            </div>
                            <a 
                              href={`/api/chat/attachments/download?id=${att.id}`}
                              className="p-1 hover:text-orange-500 transition-colors"
                              title="Download"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Input area */}
        <div className="p-6">
          <div className="max-w-3xl mx-auto relative group">
            <div className="absolute inset-0 bg-orange-500/5 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity rounded-full"></div>
            
            <div className="relative flex flex-col bg-neutral-800/50 border border-neutral-700/50 focus-within:border-orange-500/50 rounded-2xl transition-all shadow-lg backdrop-blur-sm">
              <div className="flex items-center px-4 py-2 border-b border-neutral-800/50 gap-4">
                <select 
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="bg-transparent border-none focus:ring-0 text-[10px] text-neutral-500 uppercase font-bold p-0 cursor-pointer"
                >
                  <option value="auto">Auto Router</option>
                  <option value="openclaw-gateway">OpenClaw</option>
                  <option value="claude-cli">Claude CLI</option>
                  <option value="gemini-cli-auto">Gemini CLI</option>
                </select>
                <div className="flex-1"></div>
                {activeSessionId && (
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1 text-neutral-500 hover:text-neutral-300 transition-colors"
                    title="Attach file"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                )}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  className="hidden" 
                />
              </div>

              <div className="flex items-end gap-2 p-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Message Porter... (type / for commands, @ for models)"
                  className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 px-3 resize-none min-h-[44px] max-h-48 text-neutral-200"
                  rows={1}
                />
                <button 
                  onClick={handleSend}
                  className="p-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-all disabled:opacity-50 disabled:grayscale shadow-lg shadow-orange-500/20"
                  disabled={!input.trim() || isLoading}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-neutral-500 font-mono">
              <span>Enter to send</span>
              <span className="w-1 h-1 rounded-full bg-neutral-700"></span>
              <span>Shift + Enter for new line</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
