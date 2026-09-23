type Listener = (data: string) => void;
type ClearListener = () => void;

class TerminalBus {
  private listeners = new Map<string, Set<Listener>>();
  private clearListeners = new Map<string, Set<ClearListener>>();
  private pending = new Map<string, string>();

  emit(id: string, data: string) {
    const subscribers = this.listeners.get(id);
    if (!subscribers?.size) {
      const buffered = `${this.pending.get(id) ?? ""}${data}`;
      this.pending.set(id, buffered.slice(-200_000));
      return;
    }
    for (const listener of subscribers) {
      listener(data);
    }
  }

  subscribe(id: string, listener: Listener) {
    const subscribers = this.listeners.get(id) ?? new Set<Listener>();
    subscribers.add(listener);
    this.listeners.set(id, subscribers);
    const buffered = this.pending.get(id);
    if (buffered) {
      listener(buffered);
      this.pending.delete(id);
    }
    return () => {
      const current = this.listeners.get(id);
      current?.delete(listener);
      if (!current?.size) {
        this.listeners.delete(id);
      }
    };
  }

  requestClear(id: string) {
    for (const listener of this.clearListeners.get(id) ?? []) {
      listener();
    }
  }

  onClear(id: string, listener: ClearListener) {
    const subscribers =
      this.clearListeners.get(id) ?? new Set<ClearListener>();
    subscribers.add(listener);
    this.clearListeners.set(id, subscribers);
    return () => {
      const current = this.clearListeners.get(id);
      current?.delete(listener);
      if (!current?.size) {
        this.clearListeners.delete(id);
      }
    };
  }

  forget(id: string) {
    this.listeners.delete(id);
    this.clearListeners.delete(id);
    this.pending.delete(id);
  }
}

export const terminalBus = new TerminalBus();

