import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useIDEStore } from "../store/useIDEStore";

export function ToastStack() {
  const toasts = useIDEStore((state) => state.toasts);
  const dismissToast = useIDEStore((state) => state.dismissToast);

  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => {
        const Icon =
          toast.tone === "success"
            ? CheckCircle2
            : toast.tone === "error"
              ? AlertCircle
              : Info;
        return (
          <div
            className={`toast toast-${toast.tone}`}
            key={toast.id}
          >
            <Icon size={18} />
            <div className="toast-copy">
              <strong>{toast.title}</strong>
              {toast.detail && <span>{toast.detail}</span>}
            </div>
            <button
              className="icon-button ghost tiny"
              onClick={() => dismissToast(toast.id)}
              aria-label="关闭提示"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

