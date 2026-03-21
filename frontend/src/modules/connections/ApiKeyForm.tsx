import { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

interface ApiKeyFormProps {
  provider: string;
  onSave: (key: string) => Promise<void>;
  onCancel: () => void;
}

export function ApiKeyForm({ provider, onSave, onCancel }: ApiKeyFormProps) {
  const [value, setValue] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!value.trim()) return;
    setSaving(true);
    try {
      await onSave(value.trim());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4 rounded-lg bg-[var(--raised)] border border-[var(--border)]">
      <label
        htmlFor={`api-key-${provider}`}
        className="text-sm font-medium text-[var(--text2)]"
      >
        API Key for {provider}
      </label>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            id={`api-key-${provider}`}
            type={revealed ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Paste API key"
            disabled={saving}
            className="w-full h-10 px-3 pr-10 rounded-md bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--text)] placeholder:text-[var(--text3)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text3)] hover:text-[var(--text2)] transition-colors"
            aria-label={revealed ? 'Hide key' : 'Reveal key'}
          >
            {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={!value.trim() || saving}
          className="min-h-[36px] px-4 rounded-md bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-h)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Save
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="min-h-[36px] px-4 rounded-md text-sm text-[var(--text2)] hover:text-[var(--text)] transition-colors disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
