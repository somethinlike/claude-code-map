export interface ImportEdge {
  readonly from: string; // relative path of importing file
  readonly to: string;   // relative path of imported file
}

export interface ImportGraph {
  readonly edges: readonly ImportEdge[];
  readonly adjacency: Record<string, readonly string[]>;        // file → what it imports
  readonly reverseAdjacency: Record<string, readonly string[]>; // file → what imports it
  readonly hotFiles: readonly HotFile[];
}

export interface HotFile {
  readonly filePath: string;
  readonly importedBy: number; // in-degree
  readonly imports: number;    // out-degree
}

export interface BlastRadius {
  readonly targetFile: string;
  readonly affectedFiles: readonly string[];
  readonly depth: number;
  readonly affectedRoutes: readonly string[];
  readonly affectedModels: readonly string[];
}
