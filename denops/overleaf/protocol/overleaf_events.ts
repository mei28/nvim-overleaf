// Typed event definitions for all Overleaf Socket.IO events.

import type { OpList } from '../ot/types.ts';

// --- Server -> Client events ---

export interface JoinProjectResponse {
  publicId: string;
  project: OverleafProject;
  permissionsLevel: 'owner' | 'readAndWrite' | 'review' | 'readOnly';
  protocolVersion: number;
}

export interface OverleafProject {
  _id: string;
  name: string;
  rootFolder: OverleafFolder[];
  owner: { _id: string };
}

export interface OverleafFolder {
  _id: string;
  name: string;
  docs: OverleafDoc[];
  fileRefs: OverleafFileRef[];
  folders: OverleafFolder[];
}

export interface OverleafDoc {
  _id: string;
  name: string;
}

export interface OverleafFileRef {
  _id: string;
  name: string;
}

export interface OtUpdate {
  doc: string; // docId
  op: OpList;
  v: number;
  meta?: { source: string; user_id?: string };
}

export interface JoinDocResult {
  lines: string[];
  version: number;
  ranges?: unknown;
}

// --- Client -> Server events ---

export interface ApplyOtUpdatePayload {
  doc: string;
  op: OpList;
  v: number;
  hash?: string;
}
