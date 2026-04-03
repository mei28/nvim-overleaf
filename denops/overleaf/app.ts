// Application orchestrator. Wires all subsystems together.
// This is the only module that knows about both Denops and the Overleaf protocol.

import type { Denops } from '@denops/std';
import { authenticate, type Identity } from './auth/authenticator.ts';
import { OverleafConnection } from './protocol/overleaf_connection.ts';
import type { JoinProjectResponse, OverleafFolder } from './protocol/overleaf_events.ts';
import { DocumentManager } from './document/document_manager.ts';
import { Document } from './document/document.ts';
import { ProjectStore } from './project/project_store.ts';
import { readProjectConfig, writeProjectConfig } from './project/project_api.ts';
import { FileSync } from './sync/file_sync.ts';
import { onBytesToOps, parseOnBytesArgs } from './sync/buffer_tracker.ts';
import { applyRemoteOps } from './sync/remote_applier.ts';
import { debounce } from './util/debounce.ts';
import { logger } from './util/logger.ts';
import type { OpList } from './ot/types.ts';

export const AppState = {
  Disconnected: 'disconnected',
  Authenticating: 'authenticating',
  Connecting: 'connecting',
  Connected: 'connected',
  Reconnecting: 'reconnecting',
} as const;

export type AppStateValue = (typeof AppState)[keyof typeof AppState];

interface BufferBinding {
  doc: Document;
  bufnr: number;
  flushDebounced: (() => void) & { cancel: () => void };
}

export class App {
  private denops: Denops;
  private identity: Identity | null = null;
  private connection: OverleafConnection | null = null;
  private docManager: DocumentManager | null = null;
  private projectData: JoinProjectResponse | null = null;
  private projectId: string | null = null;
  private projectStore: ProjectStore | null = null;
  private fileSync: FileSync | null = null;
  private healthCheckTimer: number | null = null;
  private cwd = '';

  private bindings = new Map<number, BufferBinding>();
  private docToBuffer = new Map<string, number>();
  private _state: AppStateValue = AppState.Disconnected;

  constructor(denops: Denops) {
    this.denops = denops;
  }

  get state(): AppStateValue {
    return this._state;
  }

  // --- Public API ---

  /** Initialize a new overleaf project in cwd: auth, connect, sync files, save config. */
  async init(cookie: string, projectId: string): Promise<void> {
    this.cwd = await this.denops.call('getcwd') as string;

    await this.connect(cookie);
    await this.openProject(projectId);

    // Save config (including cookie) for future OverleafSync
    await writeProjectConfig(this.cwd, {
      projectId,
      projectName: this.projectData!.project.name,
      serverUrl: this.identity!.serverUrl,
      cookie,
    });

    // Sync all files to disk
    await this.syncFilesToDisk();

    this.notify(`Initialized. ${this.projectStore!.getDocs().length} files synced to disk.`);
  }

  /** Sync: read .overleaf/config.json, connect, sync files. Cookie is optional (uses saved). */
  async sync(cookieOverride?: string): Promise<boolean> {
    this.cwd = await this.denops.call('getcwd') as string;

    const config = await readProjectConfig(this.cwd);
    if (!config) return false;

    // Use: override > env > saved config
    const cookie = cookieOverride || config.cookie;
    if (!cookie) {
      this.notify('No cookie found. Pass cookie to :OverleafSync or re-run :OverleafInit', 'error');
      return false;
    }

    logger.info('Syncing project %s', config.projectName);
    this.notify(`Connecting to ${config.projectName}...`);

    await this.connect(cookie, config.serverUrl);
    await this.openProject(config.projectId);
    await this.syncFilesToDisk();

    // Update saved cookie if a new one was provided
    if (cookieOverride && cookieOverride !== config.cookie) {
      await writeProjectConfig(this.cwd, { ...config, cookie: cookieOverride });
    }

    this.notify(`Synced: ${config.projectName}`);
    return true;
  }

  /** Authenticate with Overleaf. */
  async connect(cookie: string, serverUrl?: string): Promise<void> {
    this._state = AppState.Authenticating;
    this.notify('Authenticating...');

    try {
      this.identity = await authenticate({ cookie, serverUrl });
      this.notify('Authenticated with Overleaf');
    } catch (err) {
      this._state = AppState.Disconnected;
      throw err;
    }
  }

  /** Connect to a specific Overleaf project. */
  async openProject(projectId: string): Promise<void> {
    if (!this.identity) {
      throw new Error('Not authenticated. Call :OverleafConnect first');
    }

    this.disconnectProject();
    this._state = AppState.Connecting;
    this.projectId = projectId;
    if (!this.cwd) {
      this.cwd = await this.denops.call('getcwd') as string;
    }

    try {
      this.connection = new OverleafConnection(this.identity, projectId);
      this.projectData = await this.connection.connect();
      this.docManager = new DocumentManager(this.connection);
      this._state = AppState.Connected;

      // Build project store
      this.projectStore = new ProjectStore(this.cwd);
      this.projectStore.buildTree(this.projectData.project.rootFolder);

      // Set up file sync
      this.fileSync = new FileSync(this.projectStore, this.docManager);

      this.connection.on('disconnect', (_reason) => {
        if (this._state === AppState.Connected) {
          this.handleDisconnect();
        }
      });

      this.startHealthCheck();

      const name = this.projectData.project.name;
      logger.info('Opened project "%s" (%d docs)', name, this.projectStore.getDocs().length);
    } catch (err) {
      this._state = AppState.Disconnected;
      throw err;
    }
  }

  /** Sync all project documents to local disk and keep them joined for live updates. */
  async syncFilesToDisk(): Promise<void> {
    if (!this.docManager || !this.projectStore || !this.fileSync) {
      throw new Error('No project open');
    }

    const docs = this.projectStore.getDocs();
    logger.info('Syncing %d documents to disk', docs.length);
    this.notify(`Syncing ${docs.length} files...`);

    for (const mapping of docs) {
      try {
        // Join via DocumentManager — stays joined for live OT updates
        const doc = await this.docManager.join(mapping.entityId);

        // Write initial content to disk
        await this.fileSync.writeFile(mapping.localPath, doc.localContent);

        // When remote changes arrive, write updated content to disk
        doc.onRemoteApply = () => {
          this.fileSync?.writeFile(mapping.localPath, doc.localContent).catch((err) => {
            logger.error('Failed to write remote change for %s: %s', mapping.remotePath, err);
          });
        };
      } catch (err) {
        logger.error('Failed to sync %s: %s', mapping.remotePath, err);
      }
    }

    // Start watching for local file saves
    this.fileSync.startWatching();
  }

  /** Open a document in a Neovim buffer (from a local file path or doc ID). */
  async openDoc(docId: string, path: string): Promise<void> {
    if (!this.docManager) {
      throw new Error('No project open');
    }

    const doc = await this.docManager.join(docId);

    // Check if there's a local file and use its path for the buffer name
    const localPath = this.projectStore?.getById(docId)?.localPath;
    const bufName = localPath ?? `overleaf://${path}`;

    const bufnr = await this.denops.call('nvim_create_buf', true, false) as number;
    await this.denops.call('nvim_buf_set_name', bufnr, bufName);
    await this.denops.call('nvim_buf_set_option', bufnr, 'buftype', 'acwrite');

    // Detect filetype from extension
    const ext = path.split('.').pop() ?? '';
    const ftMap: Record<string, string> = {
      tex: 'tex',
      bib: 'bib',
      sty: 'tex',
      cls: 'tex',
      txt: 'text',
    };
    const ft = ftMap[ext] ?? 'tex';
    await this.denops.call('nvim_buf_set_option', bufnr, 'filetype', ft);

    const lines = doc.localContent.split('\n');
    await this.denops.call('nvim_buf_set_lines', bufnr, 0, -1, false, lines);
    await this.denops.call('nvim_buf_set_option', bufnr, 'modified', false);

    const flushDebounced = debounce(() => doc.flush(), 100);
    const binding: BufferBinding = { doc, bufnr, flushDebounced };
    this.bindings.set(bufnr, binding);
    this.docToBuffer.set(docId, bufnr);

    doc.onRemoteApply = (ops) => this.handleRemoteOps(bufnr, ops);
    doc.onError = (msg) => {
      logger.error('Document error for %s: %s', docId, msg);
      this.rejoinDoc(docId);
    };

    await this.denops.cmd(
      `lua require('overleaf.bridge').attach(${bufnr}, '${this.denops.name}')`,
    );
    await this.denops.cmd(`buffer ${bufnr}`);
    logger.info('Opened document %s in buffer %d', path, bufnr);
  }

  /** Handle on_bytes event from the Lua bridge. */
  async handleOnBytes(args: unknown[]): Promise<void> {
    const params = parseOnBytesArgs(args);
    const binding = this.bindings.get(params.bufnr);
    if (!binding) return;

    let insertedText = '';
    if (params.newEndByte > 0) {
      const endRow = params.startRow + params.newEndRow;
      const endCol = params.newEndRow === 0
        ? params.startCol + params.newEndByte
        : params.newEndCol;
      const lines = await this.denops.call(
        'nvim_buf_get_text',
        params.bufnr,
        params.startRow,
        params.startCol,
        endRow,
        endCol,
        {},
      ) as string[];
      insertedText = lines.join('\n');
    }

    const contentBefore = binding.doc.localContent;
    const ops = onBytesToOps(params, contentBefore, insertedText);

    if (ops.length > 0) {
      binding.doc.submitOp(ops);
      binding.flushDebounced();
    }
  }

  handleOnDetach(args: unknown[]): void {
    const bufnr = args[0] as number;
    const binding = this.bindings.get(bufnr);
    if (binding) {
      binding.flushDebounced.cancel();
      this.bindings.delete(bufnr);
      this.docToBuffer.delete(binding.doc.docId);
    }
  }

  getFileTree(): Array<{ id: string; name: string; path: string; type: 'doc' | 'file' }> {
    if (!this.projectData) return [];
    const result: Array<{ id: string; name: string; path: string; type: 'doc' | 'file' }> = [];
    const walk = (folder: OverleafFolder, prefix: string) => {
      for (const doc of folder.docs) {
        result.push({ id: doc._id, name: doc.name, path: prefix + doc.name, type: 'doc' });
      }
      for (const file of folder.fileRefs) {
        result.push({ id: file._id, name: file.name, path: prefix + file.name, type: 'file' });
      }
      for (const sub of folder.folders) {
        walk(sub, prefix + sub.name + '/');
      }
    };
    for (const root of this.projectData.project.rootFolder) {
      walk(root, '');
    }
    return result;
  }

  getStatus(): Record<string, unknown> {
    return {
      state: this._state,
      projectName: this.projectData?.project.name ?? null,
      projectId: this.projectId,
      openDocs: this.bindings.size,
      syncedFiles: this.projectStore?.getDocs().length ?? 0,
      permissions: this.projectData?.permissionsLevel ?? null,
      cwd: this.cwd,
    };
  }

  disconnectProject(): void {
    this.stopHealthCheck();
    for (const [, binding] of this.bindings) {
      binding.flushDebounced.cancel();
    }
    this.bindings.clear();
    this.docToBuffer.clear();
    this.fileSync?.dispose();
    this.fileSync = null;
    this.projectStore = null;
    this.docManager?.dispose();
    this.connection?.disconnect();
    this.connection = null;
    this.docManager = null;
    this.projectData = null;
    this.projectId = null;
  }

  disconnect(): void {
    this.disconnectProject();
    this.identity = null;
    this._state = AppState.Disconnected;
    this.notify('Disconnected');
  }

  // --- Private ---

  private handleDisconnect(): void {
    this._state = AppState.Reconnecting;
    this.stopHealthCheck();
    this.notify('Disconnected. Reconnecting...', 'warn');
    this.attemptReconnect(0);
  }

  private attemptReconnect(attempt: number): void {
    const maxAttempts = 10;
    if (attempt >= maxAttempts || !this.projectId || !this.identity) {
      this._state = AppState.Disconnected;
      this.notify('Reconnection failed after ' + maxAttempts + ' attempts', 'error');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, attempt), 16000);
    logger.info('Reconnect attempt %d in %dms', attempt + 1, delay);

    setTimeout(async () => {
      if (this._state !== AppState.Reconnecting) return;
      try {
        this.docManager?.dispose();
        this.connection?.disconnect();

        this.connection = new OverleafConnection(this.identity!, this.projectId!);
        this.projectData = await this.connection.connect();
        this.docManager = new DocumentManager(this.connection);

        // Rebuild file sync with new docManager
        if (this.projectStore) {
          this.fileSync?.dispose();
          this.fileSync = new FileSync(this.projectStore, this.docManager);
          this.fileSync.startWatching();
        }

        this.connection.on('disconnect', () => {
          if (this._state === AppState.Connected) this.handleDisconnect();
        });

        await this.rejoinAllDocs();
        this._state = AppState.Connected;
        this.startHealthCheck();
        this.notify('Reconnected');
      } catch (err) {
        logger.warn('Reconnect attempt %d failed: %s', attempt + 1, err);
        this.attemptReconnect(attempt + 1);
      }
    }, delay);
  }

  private async rejoinAllDocs(): Promise<void> {
    if (!this.docManager) return;
    for (const [bufnr, binding] of this.bindings) {
      try {
        const doc = await this.docManager.join(binding.doc.docId);
        doc.onRemoteApply = (ops) => this.handleRemoteOps(bufnr, ops);
        doc.onError = (msg) => {
          logger.error('Document error for %s: %s', doc.docId, msg);
          this.rejoinDoc(doc.docId);
        };
        const lines = doc.localContent.split('\n');
        await this.denops.cmd(`lua require('overleaf.bridge').set_applying_remote(${bufnr}, true)`);
        await this.denops.call('nvim_buf_set_lines', bufnr, 0, -1, false, lines);
        await this.denops.cmd(
          `lua require('overleaf.bridge').set_applying_remote(${bufnr}, false)`,
        );
        binding.doc = doc;
        binding.flushDebounced = debounce(() => doc.flush(), 100);
      } catch (err) {
        logger.error('Failed to rejoin document %s: %s', binding.doc.docId, err);
      }
    }
  }

  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthCheckTimer = setInterval(() => {
      if (this._state !== AppState.Connected) return;
      for (const [, binding] of this.bindings) {
        if (
          binding.doc.state === 'idle' && binding.doc.serverContent !== binding.doc.localContent
        ) {
          logger.warn('Content drift detected for %s', binding.doc.docId);
          this.rejoinDoc(binding.doc.docId);
        }
      }
    }, 30_000);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer != null) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  private handleRemoteOps(bufnr: number, ops: OpList): void {
    const binding = this.bindings.get(bufnr);
    if (!binding) return;
    applyRemoteOps(this.denops, bufnr, ops, binding.doc.localContent).catch((err) => {
      logger.error('Failed to apply remote ops to buffer %d: %s', bufnr, err);
    });
  }

  private async rejoinDoc(docId: string): Promise<void> {
    if (!this.docManager) return;
    const bufnr = this.docToBuffer.get(docId);
    await this.docManager.rejoin(docId);
    if (bufnr != null) {
      const binding = this.bindings.get(bufnr);
      if (binding) {
        const lines = binding.doc.localContent.split('\n');
        await this.denops.cmd(`lua require('overleaf.bridge').set_applying_remote(${bufnr}, true)`);
        await this.denops.call('nvim_buf_set_lines', bufnr, 0, -1, false, lines);
        await this.denops.cmd(
          `lua require('overleaf.bridge').set_applying_remote(${bufnr}, false)`,
        );
      }
    }
  }

  private notify(msg: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    const lvlMap = { info: 2, warn: 3, error: 4 };
    this.denops.cmd(
      `lua vim.notify("[overleaf] ${msg.replace(/"/g, '\\"')}", ${lvlMap[level]})`,
    ).catch(() => {});
  }
}
