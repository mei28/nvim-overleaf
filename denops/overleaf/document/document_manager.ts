// Registry of active Document instances.
// Routes incoming OT events to the correct document.

import { Document } from './document.ts';
import type { OverleafConnection } from '../protocol/overleaf_connection.ts';
import type { JoinDocResult, OtUpdate } from '../protocol/overleaf_events.ts';
import type { OpList } from '../ot/types.ts';
import { logger } from '../util/logger.ts';

export class DocumentManager {
  private documents = new Map<string, Document>();
  private connection: OverleafConnection;

  constructor(connection: OverleafConnection) {
    this.connection = connection;
    this.setupEventHandlers();
  }

  /** Join a document and start tracking it. */
  async join(docId: string): Promise<Document> {
    if (this.documents.has(docId)) {
      return this.documents.get(docId)!;
    }

    const result: JoinDocResult = await this.connection.joinDoc(docId);
    const content = result.lines.join('\n');
    const doc = new Document(docId, content, result.version);

    // Wire up send callback
    doc.onSend = async (ops: OpList, version: number) => {
      try {
        await this.connection.applyOtUpdate(docId, ops, version);
        doc.onAck();
      } catch (err) {
        logger.error('Failed to send OT update for %s: %s', docId, err);
        doc.onError?.(`Send failed: ${err}`);
      }
    };

    this.documents.set(docId, doc);
    return doc;
  }

  /** Leave a document and stop tracking it. */
  async leave(docId: string): Promise<void> {
    const doc = this.documents.get(docId);
    if (!doc) return;

    this.documents.delete(docId);
    await this.connection.leaveDoc(docId);
  }

  /** Get a tracked document by ID. */
  get(docId: string): Document | undefined {
    return this.documents.get(docId);
  }

  /** Get all tracked documents. */
  getAll(): Map<string, Document> {
    return this.documents;
  }

  /** Rejoin a document (fetch fresh state from server). */
  async rejoin(docId: string): Promise<void> {
    const doc = this.documents.get(docId);
    if (!doc) return;

    try {
      await this.connection.leaveDoc(docId);
      const result = await this.connection.joinDoc(docId);
      const content = result.lines.join('\n');
      doc.reset(content, result.version);
      logger.info('Rejoined document %s at version %d', docId, result.version);
    } catch (err) {
      logger.error('Rejoin failed for %s: %s', docId, err);
    }
  }

  /** Clean up all documents. */
  dispose(): void {
    this.documents.clear();
  }

  private setupEventHandlers(): void {
    this.connection.on('otUpdateApplied', (update: OtUpdate) => {
      const doc = this.documents.get(update.doc);
      if (doc) {
        doc.onRemoteOp({ op: update.op, v: update.v });
      }
    });

    this.connection.on('otUpdateError', (err: string) => {
      logger.error('Server OT error: %s', err);
    });
  }
}
