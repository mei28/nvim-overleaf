// Project entity types and file mapping.

export interface EntityMapping {
  entityId: string;
  entityType: 'doc' | 'file' | 'folder';
  remotePath: string; // e.g., "chapters/intro.tex"
  localPath: string; // absolute path on disk
}
