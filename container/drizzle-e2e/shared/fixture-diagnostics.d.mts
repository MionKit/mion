export function annotateFixtureDiagnostics(
  tree: string,
  diagnostics: readonly {
    code: string;
    downgraded?: boolean;
    site: {filePath: string; startLine: number};
  }[]
): number;
