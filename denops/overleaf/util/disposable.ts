// Unified resource cleanup pattern.

export interface Disposable {
  dispose(): void | Promise<void>;
}

/** Collect disposables and clean them all up at once. */
export class DisposableStore {
  private items: Disposable[] = [];

  add<T extends Disposable>(item: T): T {
    this.items.push(item);
    return item;
  }

  async dispose(): Promise<void> {
    const items = this.items.splice(0);
    for (const item of items) {
      try {
        await item.dispose();
      } catch {
        // Swallow errors during cleanup
      }
    }
  }
}
