// Document state machine for OT synchronization.
// Tracks: version, server/local content, inflight/pending operations.

import type { OpList } from '../ot/types.ts';
import { apply } from '../ot/apply.ts';
import { transformOps } from '../ot/transform.ts';
import { logger } from '../util/logger.ts';

export const DocumentState = {
  Idle: 'idle',
  Pending: 'pending',
  Inflight: 'inflight',
  InflightPending: 'inflight_pending',
} as const;

export type DocumentStateValue = (typeof DocumentState)[keyof typeof DocumentState];

interface RemoteUpdate {
  op: OpList;
  v: number;
}

export class Document {
  readonly docId: string;

  /** Content as the server knows it (after all ACKed ops). */
  serverContent: string;

  /** Content including all local unACKed changes. */
  localContent: string;

  /** Current server-side version number. */
  version: number;

  /** Op sent to server, awaiting ACK. */
  private inflightOp: OpList | null = null;

  /** Ops accumulated locally, not yet sent. */
  private pendingOps: OpList | null = null;

  /** Callback: send ops to the server. */
  onSend: ((ops: OpList, version: number) => void) | null = null;

  /** Callback: apply transformed remote ops to the buffer. */
  onRemoteApply: ((ops: OpList) => void) | null = null;

  /** Callback: unrecoverable error (version mismatch, OT failure). */
  onError: ((message: string) => void) | null = null;

  constructor(docId: string, content: string, version: number) {
    this.docId = docId;
    this.serverContent = content;
    this.localContent = content;
    this.version = version;
  }

  get state(): DocumentStateValue {
    if (this.inflightOp && this.pendingOps) return DocumentState.InflightPending;
    if (this.inflightOp) return DocumentState.Inflight;
    if (this.pendingOps) return DocumentState.Pending;
    return DocumentState.Idle;
  }

  /** Submit a local edit as OT operations. */
  submitOp(ops: OpList): void {
    if (ops.length === 0) return;

    // Apply to local content
    this.localContent = apply(this.localContent, ops);

    // Accumulate in pending
    if (this.pendingOps) {
      this.pendingOps = [...this.pendingOps, ...ops];
    } else {
      this.pendingOps = [...ops];
    }
  }

  /** Flush pending ops: move to inflight and send. */
  flush(): void {
    if (!this.pendingOps || this.inflightOp) return;

    this.inflightOp = this.pendingOps;
    this.pendingOps = null;

    if (this.onSend) {
      this.onSend(this.inflightOp, this.version);
    }
  }

  /** Server acknowledged our inflight op. */
  onAck(): void {
    if (!this.inflightOp) {
      logger.warn('Received ACK but no inflight op');
      return;
    }

    // Update server content
    this.serverContent = apply(this.serverContent, this.inflightOp);
    this.version++;
    this.inflightOp = null;

    // If there are pending ops, flush them immediately
    if (this.pendingOps) {
      this.flush();
    }
  }

  /** Handle a remote OT update from another client. */
  onRemoteOp(update: RemoteUpdate): void {
    if (update.v !== this.version) {
      const msg = `version mismatch: expected ${this.version}, got ${update.v}`;
      logger.error('Remote op %s', msg);
      this.onError?.(msg);
      return;
    }

    const remoteOps = update.op;

    try {
      // Apply to server content (always succeeds for well-formed ops)
      this.serverContent = apply(this.serverContent, remoteOps);

      // Transform remote ops against inflight and pending
      let opsToApply = remoteOps;

      if (this.inflightOp) {
        opsToApply = transformOps(remoteOps, this.inflightOp, 'right');
        this.inflightOp = transformOps(this.inflightOp, remoteOps, 'left');
      }

      if (this.pendingOps) {
        opsToApply = transformOps(opsToApply, this.pendingOps, 'right');
        this.pendingOps = transformOps(this.pendingOps, opsToApply, 'left');
      }

      // Apply transformed ops to local content
      this.localContent = apply(this.localContent, opsToApply);
      this.version++;

      // Notify buffer to apply the transformed ops
      this.onRemoteApply?.(opsToApply);
    } catch (err) {
      logger.error('OT error: %s', err);
      this.onError?.(`OT transform failed: ${err}`);
    }
  }

  /** Reset to a fresh state (used after rejoin). */
  reset(content: string, version: number): void {
    this.serverContent = content;
    this.localContent = content;
    this.version = version;
    this.inflightOp = null;
    this.pendingOps = null;
  }
}
