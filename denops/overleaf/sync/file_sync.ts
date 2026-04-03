// Disk file synchronization.
// Writes remote changes to disk. Detects local file saves and pushes changes via OT.

import { EchoGuard } from './echo_guard.ts';
import type { ProjectStore } from '../project/project_store.ts';
import type { DocumentManager } from '../document/document_manager.ts';
import type { OpList } from '../ot/types.ts';
import { logger } from '../util/logger.ts';

export class FileSync {
  private store: ProjectStore;
  private docManager: DocumentManager;
  private echoGuard = new EchoGuard();
  private watcher: Deno.FsWatcher | null = null;
  private watching = false;
  private syncing = new Set<string>();
  private debounceTimers = new Map<string, number>();

  constructor(store: ProjectStore, docManager: DocumentManager) {
    this.store = store;
    this.docManager = docManager;
  }

  /** Write a single file to disk with echo guard. */
  async writeFile(path: string, content: string): Promise<void> {
    const dir = path.substring(0, path.lastIndexOf('/'));
    await Deno.mkdir(dir, { recursive: true });
    this.echoGuard.register(path, content);
    await Deno.writeTextFile(path, content);
  }

  /** Start watching the sync directory for file saves. */
  startWatching(): void {
    if (this.watching) return;
    this.watching = true;
    logger.info('Watching %s for changes', this.store.syncRoot);
    this.watcher = Deno.watchFs(this.store.syncRoot, { recursive: true });
    this.watchLoop();
  }

  private async watchLoop(): Promise<void> {
    if (!this.watcher) return;
    try {
      for await (const event of this.watcher) {
        if (!this.watching) break;
        if (event.kind !== 'modify' && event.kind !== 'create') continue;
        for (const path of event.paths) {
          this.scheduleSync(path);
        }
      }
    } catch (err) {
      if (this.watching) {
        logger.error('File watcher error: %s', err);
      }
    }
  }

  private scheduleSync(path: string): void {
    const existing = this.debounceTimers.get(path);
    if (existing != null) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.debounceTimers.delete(path);
      this.onFileChanged(path);
    }, 500);
    this.debounceTimers.set(path, timer);
  }

  /** Handle a local file save. Use the already-joined Document to send OT ops. */
  private async onFileChanged(path: string): Promise<void> {
    const mapping = this.store.getByLocalPath(path);
    if (!mapping || mapping.entityType !== 'doc') return;
    if (path.includes('/.overleaf/')) return;
    if (this.syncing.has(path)) return;
    this.syncing.add(path);

    try {
      const content = await Deno.readTextFile(path);
      if (this.echoGuard.isOwnWrite(path, content)) return;

      // Get the already-joined document
      const doc = this.docManager.get(mapping.entityId);
      if (!doc) {
        logger.warn('Document %s not joined, skipping sync', mapping.remotePath);
        return;
      }

      // Compare with what the document currently has
      if (content === doc.localContent) return;

      logger.info('Syncing local change: %s', mapping.remotePath);

      // Build OT ops: delete current content, insert new content
      const currentContent = doc.localContent;
      const ops: OpList = [];
      if (currentContent.length > 0) {
        ops.push({ d: currentContent, p: 0 });
      }
      if (content.length > 0) {
        ops.push({ i: content, p: 0 });
      }

      // Submit through the Document state machine (handles version, inflight, etc.)
      doc.submitOp(ops);
      doc.flush();

      logger.info('Synced %s', mapping.remotePath);
    } catch (err) {
      logger.error('Failed to sync %s: %s', mapping.remotePath, err);
    } finally {
      this.syncing.delete(path);
    }
  }

  dispose(): void {
    this.watching = false;
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
