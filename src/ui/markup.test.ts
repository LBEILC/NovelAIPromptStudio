import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

it('keeps native tooltips and shortcut markup behind the shared components', () => {
  const violations: string[] = [];
  const root = path.resolve('src');
  function scan(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'ui-showcase') continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        scan(file);
        continue;
      }
      if (!/\.[jt]sx$/.test(file) || /\.test\./.test(file)) continue;
      const source = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      function visit(node: ts.Node) {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText(source);
          if (/^[a-z]/.test(tag)) {
            if (
              node.attributes.properties.some(
                (attribute) =>
                  ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'title',
              )
            )
              violations.push(`${file}: native title`);
            if (
              tag === 'kbd' &&
              path.relative(root, file).replaceAll('\\', '/') !== 'ui/ThemeProvider.tsx'
            )
              violations.push(`${file}: use Shortcut`);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  scan(root);
  expect(violations).toEqual([]);
});
