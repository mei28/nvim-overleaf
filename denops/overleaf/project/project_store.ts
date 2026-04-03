// In-memory project tree with bidirectional entity ID <-> path mapping.

import type { OverleafFolder } from '../protocol/overleaf_events.ts';
import type { EntityMapping } from './project_types.ts';

export class ProjectStore {
  private byId = new Map<string, EntityMapping>();
  private byLocalPath = new Map<string, EntityMapping>();
  private byRemotePath = new Map<string, EntityMapping>();
  readonly syncRoot: string;

  constructor(syncRoot: string) {
    this.syncRoot = syncRoot;
  }

  /** Build the mapping from an Overleaf project folder tree. */
  buildTree(rootFolders: OverleafFolder[]): void {
    this.byId.clear();
    this.byLocalPath.clear();
    this.byRemotePath.clear();

    for (const root of rootFolders) {
      this.walkFolder(root, '');
    }
  }

  private walkFolder(folder: OverleafFolder, prefix: string): void {
    for (const doc of folder.docs) {
      const remotePath = prefix + doc.name;
      const localPath = this.syncRoot + '/' + remotePath;
      const mapping: EntityMapping = {
        entityId: doc._id,
        entityType: 'doc',
        remotePath,
        localPath,
      };
      this.byId.set(doc._id, mapping);
      this.byLocalPath.set(localPath, mapping);
      this.byRemotePath.set(remotePath, mapping);
    }

    for (const file of folder.fileRefs) {
      const remotePath = prefix + file.name;
      const localPath = this.syncRoot + '/' + remotePath;
      const mapping: EntityMapping = {
        entityId: file._id,
        entityType: 'file',
        remotePath,
        localPath,
      };
      this.byId.set(file._id, mapping);
      this.byLocalPath.set(localPath, mapping);
      this.byRemotePath.set(remotePath, mapping);
    }

    for (const sub of folder.folders) {
      this.walkFolder(sub, prefix + sub.name + '/');
    }
  }

  getById(id: string): EntityMapping | undefined {
    return this.byId.get(id);
  }

  getByLocalPath(path: string): EntityMapping | undefined {
    return this.byLocalPath.get(path);
  }

  getByRemotePath(path: string): EntityMapping | undefined {
    return this.byRemotePath.get(path);
  }

  /** Get all document entities (for sync). */
  getDocs(): EntityMapping[] {
    return [...this.byId.values()].filter((e) => e.entityType === 'doc');
  }

  /** Get all entities. */
  getAll(): EntityMapping[] {
    return [...this.byId.values()];
  }
}
