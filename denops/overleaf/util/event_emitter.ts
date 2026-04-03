// Minimal typed event emitter for internal pub/sub.

// deno-lint-ignore no-explicit-any
type Listener = (...args: any[]) => void;

export class EventEmitter<Events extends { [K in keyof Events]: Listener }> {
  private listeners = new Map<keyof Events, Set<Listener>>();

  on<K extends keyof Events>(event: K, fn: Events[K]): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(fn);
  }

  off<K extends keyof Events>(event: K, fn: Events[K]): void {
    this.listeners.get(event)?.delete(fn);
  }

  emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>): void {
    for (const fn of this.listeners.get(event) ?? []) {
      fn(...args);
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
