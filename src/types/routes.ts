export interface ExtractedRoute {
  readonly method: string; // GET, POST, PUT, PATCH, DELETE, ALL, USE
  readonly path: string;
  readonly filePath: string;
  readonly line: number;
  readonly handler: string;
  readonly auth: boolean;
  readonly framework: string;
}
