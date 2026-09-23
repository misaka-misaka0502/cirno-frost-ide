import { AlertTriangle, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

interface InputDialogProps {
  open: boolean;
  title: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void | Promise<void>;
  onCancel: () => void;
}

export function InputDialog({
  open,
  title,
  label,
  initialValue = "",
  placeholder,
  confirmLabel = "确定",
  onConfirm,
  onCancel
}: InputDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setValue(initialValue);
    setBusy(false);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [initialValue, open]);

  if (!open) {
    return null;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim() || busy) {
      return;
    }
    setBusy(true);
    try {
      await onConfirm(value.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <form
        className="dialog-card"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-header">
          <div>
            <span className="dialog-eyebrow">FROST IDE</span>
            <h3>{title}</h3>
          </div>
          <button
            className="icon-button ghost"
            type="button"
            onClick={onCancel}
          >
            <X size={17} />
          </button>
        </div>
        <label className="dialog-label">
          <span>{label}</span>
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            spellCheck={false}
          />
        </label>
        <div className="dialog-actions">
          <button
            className="button secondary"
            type="button"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className="button primary"
            type="submit"
            disabled={!value.trim() || busy}
          >
            {busy ? "处理中…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  detail: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  detail,
  confirmLabel = "确定",
  danger = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setBusy(false);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const confirm = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <div
        className="dialog-card confirm-card"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={`confirm-icon ${danger ? "danger" : ""}`}>
          <AlertTriangle size={22} />
        </div>
        <div className="confirm-copy">
          <h3>{title}</h3>
          <p>{detail}</p>
        </div>
        <div className="dialog-actions">
          <button
            className="button secondary"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            className={`button ${danger ? "danger" : "primary"}`}
            onClick={confirm}
            disabled={busy}
          >
            {busy ? "处理中…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

