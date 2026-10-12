import ts from 'typescript';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function undefinedJsNames(root = process.cwd()) {
  const configPath = path.join(root, 'tsconfig.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, {
    allowJs: true,
    checkJs: true,
    noEmit: true,
  });
  if (parsed.errors.length)
    throw Error(ts.formatDiagnosticsWithColorAndContext(parsed.errors, host));
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  return program.getSemanticDiagnostics().filter((diagnostic) => {
    if (![2304, 2552].includes(diagnostic.code) || !diagnostic.file) return false;
    const relative = path.relative(root, diagnostic.file.fileName).split(path.sep).join('/');
    return /^(src|electron)\/.*\.(js|jsx|mjs|cjs)$/.test(relative);
  });
}

const host = {
  getCanonicalFileName: (file) => file,
  getCurrentDirectory: ts.sys.getCurrentDirectory,
  getNewLine: () => '\n',
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const diagnostics = undefinedJsNames();
  if (diagnostics.length) {
    console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, host));
    process.exitCode = 1;
  } else console.log('JS undefined-name check passed (TS2304 / TS2552).');
}
