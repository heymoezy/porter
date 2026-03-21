interface DisconnectDialogProps {
  open: boolean;
  serviceName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DisconnectDialog({ open, serviceName, onConfirm, onCancel }: DisconnectDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="disconnect-dialog-title"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onCancel}
      />

      {/* Dialog card */}
      <div className="relative z-10 w-full max-w-sm mx-4 rounded-lg bg-[var(--surface)] border border-[var(--border)] p-6 flex flex-col gap-4">
        <div>
          <h2
            id="disconnect-dialog-title"
            className="text-lg font-semibold text-[var(--text)]"
          >
            Disconnect {serviceName}?
          </h2>
          <p className="mt-2 text-sm text-[var(--text2)]">
            Connected agents will lose access. Active jobs will be paused.
          </p>
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="min-h-[40px] px-4 rounded-md border border-[var(--border)] text-sm text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--raised)] transition-colors"
          >
            Keep Connected
          </button>
          <button
            onClick={onConfirm}
            className="min-h-[40px] px-4 rounded-md bg-[var(--danger)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
