import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function loadTypescript() {
  try {
    return require("typescript");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        "The static checker requires the TypeScript package.",
        "Run `npm install --no-audit --no-fund` in frontend/ first, then run `npm run static-check`.",
        detail,
      ].join("\n")
    );
  }
}

const ts = loadTypescript();
const root = process.cwd();
const sourceRoots = ["src", "packages", "electron", "tests"];
const sourceExtensions = [".ts", ".tsx", ".d.ts", ".js", ".jsx", ".mjs", ".json"];
const aliasTargets = {
  "@local-vn/backend-client": "packages/backend-client/src/index.ts",
  "@local-vn/config": "packages/config/src/index.ts",
  "@local-vn/shared-types": "packages/shared-types/src/index.ts",
  "@local-vn/workflow-core": "packages/workflow-core/src/index.ts",
  "@local-vn/story-domain": "packages/story-domain/src/index.ts",
  "@local-vn/story-application": "packages/story-application/src/index.ts",
  "@local-vn/story-infrastructure": "packages/story-infrastructure/src/index.ts",
  "@local-vn/stores": "packages/stores/src/index.ts",
  "@local-vn/vn-ui": "packages/vn-ui/src/index.ts",
};

function walkFiles(dir, predicate, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, predicate, output);
    } else if (predicate(fullPath)) {
      output.push(fullPath);
    }
  }
  return output;
}

function importSpecifiers(sourceText) {
  const specs = [];
  const fromPattern = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;
  const barePattern = /import\s+["']([^"']+)["']/g;
  for (const pattern of [fromPattern, barePattern]) {
    let match;
    while ((match = pattern.exec(sourceText))) specs.push(match[1]);
  }
  return specs;
}

function fileExistsWithResolution(candidate) {
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return true;
  for (const extension of sourceExtensions) {
    const withExtension = `${candidate}${extension}`;
    if (fs.existsSync(withExtension) && fs.statSync(withExtension).isFile()) return true;
  }
  for (const extension of sourceExtensions) {
    const indexPath = path.join(candidate, `index${extension}`);
    if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) return true;
  }
  return false;
}

function formatDiagnostic(diagnostic, fileName) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
  if (diagnostic.file && typeof diagnostic.start === "number") {
    const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    return `${fileName}:${position.line + 1}:${position.character + 1} TS${diagnostic.code}: ${message}`;
  }
  return `${fileName} TS${diagnostic.code}: ${message}`;
}

const tsFiles = sourceRoots.flatMap((sourceRoot) =>
  walkFiles(path.join(root, sourceRoot), (fileName) => /\.(ts|tsx)$/.test(fileName) && !fileName.endsWith(".d.ts"))
);
const importFiles = sourceRoots.flatMap((sourceRoot) =>
  walkFiles(path.join(root, sourceRoot), (fileName) => /\.(ts|tsx|mjs)$/.test(fileName))
);

const syntaxErrors = [];
for (const fileName of tsFiles) {
  const sourceText = fs.readFileSync(fileName, "utf8");
  const result = ts.transpileModule(sourceText, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      isolatedModules: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
    },
  });
  for (const diagnostic of result.diagnostics ?? []) {
    if (diagnostic.category === ts.DiagnosticCategory.Error) {
      syntaxErrors.push(formatDiagnostic(diagnostic, path.relative(root, fileName)));
    }
  }
}

const importErrors = [];
for (const fileName of importFiles) {
  const sourceText = fs.readFileSync(fileName, "utf8");
  for (const specifier of importSpecifiers(sourceText)) {
    if (specifier.startsWith(".")) {
      const target = path.normalize(path.join(path.dirname(fileName), specifier));
      if (!fileExistsWithResolution(target)) {
        importErrors.push(`${path.relative(root, fileName)} -> ${specifier}`);
      }
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(aliasTargets, specifier)) {
      const target = path.join(root, aliasTargets[specifier]);
      if (!fileExistsWithResolution(target)) {
        importErrors.push(`${path.relative(root, fileName)} -> ${specifier} (${aliasTargets[specifier]})`);
      }
    }
  }
}

const aliasErrors = Object.entries(aliasTargets)
  .filter(([, target]) => !fileExistsWithResolution(path.join(root, target)))
  .map(([alias, target]) => `${alias} -> ${target}`);

const errors = [
  ...syntaxErrors.map((message) => `syntax: ${message}`),
  ...importErrors.map((message) => `import: ${message}`),
  ...aliasErrors.map((message) => `alias: ${message}`),
];

console.log(`Frontend static check`);
console.log(`- TypeScript syntax files: ${tsFiles.length}`);
console.log(`- Import graph files: ${importFiles.length}`);
console.log(`- Package aliases: ${Object.keys(aliasTargets).length}`);

if (errors.length > 0) {
  console.error(`\nFound ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("- Result: ok");
