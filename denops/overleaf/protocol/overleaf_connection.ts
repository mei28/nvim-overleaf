// Overleaf-specific connection layer on top of Socket.IO client.
// Implements v1 and v2 connection schemes and provides typed Overleaf events.

import { SocketIOClient } from './socketio_client.ts';
import type { SocketIOClientOptions } from './socketio_types.ts';
import type {
  ApplyOtUpdatePayload,
  JoinDocResult,
  JoinProjectResponse,
  OtUpdate,
} from './overleaf_events.ts';
import type { Identity } from '../auth/authenticator.ts';
import type { OpList } from '../ot/types.ts';
import { EventEmitter } from '../util/event_emitter.ts';
import { logger } from '../util/logger.ts';
import { decodeLines, decodeLatin1 } from '../util/encoding.ts';

interface OverleafConnectionEvents {
  joinProjectResponse: (data: JoinProjectResponse) => void;
  otUpdateApplied: (update: OtUpdate) => void;
  otUpdateError: (err: string) => void;
  reciveNewDoc: (folderId: string, doc: { _id: string; name: string }) => void;
  reciveNewFile: (folderId: string, file: { _id: string; name: string }) => void;
  reciveNewFolder: (folderId: string, folder: { _id: string; name: string }) => void;
  removeEntity: (entityId: string) => void;
  disconnect: (reason: string) => void;
  connectionAccepted: (publicId: string) => void;
}

export class OverleafConnection extends EventEmitter<OverleafConnectionEvents> {
  private socket: SocketIOClient;
  projectId: string;
  publicId?: string;

  constructor(identity: Identity, projectId: string) {
    super();
    this.projectId = projectId;

    const socketOpts: SocketIOClientOptions = {
      serverUrl: identity.serverUrl,
      cookies: identity.cookieStore.toString(),
      query: { projectId },
    };

    this.socket = new SocketIOClient(socketOpts);
    this.setupEventHandlers();
  }

  /** Connect to the Overleaf project. Returns project data on success. */
  connect(): Promise<JoinProjectResponse> {
    return new Promise<JoinProjectResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout: no joinProjectResponse within 30s'));
      }, 30_000);

      // v2 scheme: projectId in query params, server responds with joinProjectResponse
      this.once('joinProjectResponse', (data) => {
        clearTimeout(timeout);
        this.publicId = data.publicId;
        resolve(data);
      });

      this.socket.connect().catch((err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /** Join a document for real-time OT collaboration. */
  joinDoc(docId: string, fromVersion?: number): Promise<JoinDocResult> {
    const args = fromVersion != null
      ? [docId, fromVersion, { encodeRanges: true }]
      : [docId, -1, { encodeRanges: true }];

    return new Promise<JoinDocResult>((resolve, reject) => {
      this.socket.emitEvent('joinDoc', args, (err, ...responseArgs) => {
        if (err) {
          reject(err);
          return;
        }
        // Response: [lines, version, ops, ranges]
        // Lines are Latin-1 encoded — decode to UTF-8
        const rawLines = responseArgs[0] as string[];
        const lines = decodeLines(rawLines);
        const version = responseArgs[1] as number;
        const ranges = responseArgs[3];
        resolve({ lines, version, ranges });
      });
    });
  }

  /** Leave a document. */
  leaveDoc(docId: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.socket.emitEvent('leaveDoc', [docId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /** Send an OT update to the server. */
  applyOtUpdate(docId: string, ops: OpList, version: number): Promise<void> {
    const payload: ApplyOtUpdatePayload = {
      doc: docId,
      op: ops,
      v: version,
    };

    return new Promise<void>((resolve, reject) => {
      this.socket.emitEvent('applyOtUpdate', [docId, payload], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /** Disconnect from the project. */
  disconnect(): void {
    this.socket.disconnect();
    this.removeAllListeners();
  }

  /** Listen for an event once, then auto-remove. */
  private once<K extends keyof OverleafConnectionEvents>(
    event: K,
    fn: OverleafConnectionEvents[K],
  ): void {
    const wrapper = ((...args: Parameters<OverleafConnectionEvents[K]>) => {
      this.off(event, wrapper as OverleafConnectionEvents[K]);
      // deno-lint-ignore no-explicit-any
      (fn as (...a: any[]) => void)(...args);
    }) as OverleafConnectionEvents[K];
    this.on(event, wrapper);
  }

  private setupEventHandlers(): void {
    this.socket.on('event', (name, args) => {
      switch (name) {
        case 'joinProjectResponse':
          this.emit('joinProjectResponse', args[0] as JoinProjectResponse);
          break;
        case 'otUpdateApplied': {
          // Decode Latin-1 in OT op text
          const update = args[0] as OtUpdate;
          if (update.op) {
            for (const op of update.op) {
              if ('i' in op) op.i = decodeLatin1(op.i);
              if ('d' in op) op.d = decodeLatin1(op.d);
            }
          }
          this.emit('otUpdateApplied', update);
          break;
        }
        case 'otUpdateError':
          this.emit('otUpdateError', args[0] as string);
          break;
        case 'reciveNewDoc':
          this.emit('reciveNewDoc', args[0] as string, args[1] as { _id: string; name: string });
          break;
        case 'reciveNewFile':
          this.emit('reciveNewFile', args[0] as string, args[1] as { _id: string; name: string });
          break;
        case 'reciveNewFolder':
          this.emit(
            'reciveNewFolder',
            args[0] as string,
            args[1] as { _id: string; name: string },
          );
          break;
        case 'removeEntity':
          this.emit('removeEntity', args[0] as string);
          break;
        case 'connectionAccepted':
          this.emit('connectionAccepted', args[0] as string);
          break;
        default:
          logger.debug('Unhandled Overleaf event: %s', name);
      }
    });

    this.socket.on('disconnect', (reason) => {
      this.emit('disconnect', reason);
    });
  }
}
