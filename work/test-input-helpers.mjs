import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transformWithOxc } from "vite";
import { normalizePythonFileName } from "../electron/python-file-name.mjs";

assert.equal(normalizePythonFileName("hello"), "hello.py");
assert.equal(normalizePythonFileName("hello.py"), "hello.py");
assert.equal(normalizePythonFileName("hello.PY"), "hello.py");
assert.equal(normalizePythonFileName("a."), "a.py");
assert.equal(normalizePythonFileName("archive.tar"), "archive.tar.py");
assert.throws(() => normalizePythonFileName(".py"));
assert.throws(() => normalizePythonFileName("CON"));
assert.throws(() => normalizePythonFileName("bad:name"));

const helperPath = new URL(
  "../src/lib/pairedTerminalInput.ts",
  import.meta.url
);
const source = await readFile(helperPath, "utf8");
const compiled = await transformWithOxc(source, helperPath.pathname, {
  lang: "ts",
  format: "esm",
  target: "es2022"
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(
  compiled.code
).toString("base64")}`;
const { createPairedTerminalInput } = await import(moduleUrl);

const writes = [];
const input = createPairedTerminalInput((data) => writes.push(data));
for (const key of ["p", "r", "i", "n", "t", "(", '"', "x", '"', ")", "\r"]) {
  input.handle(key);
}
assert.deepEqual(writes, [
  "p",
  "r",
  "i",
  "n",
  "t",
  "()\x1b[D",
  '""\x1b[D',
  "x",
  "\x1b[C",
  "\x1b[C",
  "\r"
]);

const deletionWrites = [];
const deletionInput = createPairedTerminalInput((data) =>
  deletionWrites.push(data)
);
deletionInput.handle("[");
deletionInput.handle("\x7f");
assert.deepEqual(deletionWrites, ["[]\x1b[D", "\x7f\x1b[3~"]);

console.log("Filename normalization and paired terminal input passed");

const editorSource = await readFile(
  new URL("../src/components/EditorWorkspace.tsx", import.meta.url),
  "utf8"
);
const lspSource = await readFile(
  new URL("../src/lib/lsp.ts", import.meta.url),
  "utf8"
);
const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8"
);
const explorerSource = await readFile(
  new URL("../src/components/Explorer.tsx", import.meta.url),
  "utf8"
);
const editorSourceForRun = await readFile(
  new URL("../src/components/EditorWorkspace.tsx", import.meta.url),
  "utf8"
);
const replSource = await readFile(
  new URL("../src/components/ReplWorkspace.tsx", import.meta.url),
  "utf8"
);
const mainSource = await readFile(
  new URL("../electron/main.mjs", import.meta.url),
  "utf8"
);
const pdfReaderSource = await readFile(
  new URL("../src/components/PdfReaderPanel.tsx", import.meta.url),
  "utf8"
);
assert.match(editorSource, /acceptSuggestionOnEnter:\s*"on"/);
assert.match(editorSource, /suggestSelection:\s*"first"/);
assert.match(editorSource, /selectionMode:\s*"always"/);
assert.match(editorSource, /wordBasedSuggestions:\s*"off"/);
assert.match(editorSource, /snippetSuggestions:\s*"bottom"/);
assert.match(lspSource, /sortText:\s*"0:current-input"/);
assert.match(lspSource, /preselect:\s*true/);
assert.match(lspSource, /token\.isCancellationRequested/);
console.log("Completion ordering and Enter acceptance policy passed");

assert.doesNotMatch(editorSourceForRun, /id:\s*"frost\.run"/);
assert.match(appSource, /runStarting\.current/);
assert.match(appSource, /!document\.isUntitled/);
assert.match(appSource, /saveDocument\(path,\s*false,\s*true\)/);
assert.doesNotMatch(explorerSource, /onBlur=\{commit\}/);
assert.match(explorerSource, /inputRef\.current\?\.select\(\)/);
assert.match(explorerSource, /pending-file-cancel/);
assert.doesNotMatch(replSource, /新建环境|再开一个环境/);
assert.match(mainSource, /windowsExtendedPath\(directoryEntryPath\)/);
assert.match(mainSource, /\.frost-trash-\$\{crypto\.randomUUID\(\)\}/);
assert.match(mainSource, /已经存在，请换一个名称/);
assert.match(explorerSource, /className="tree-row-actions"/);
assert.match(explorerSource, /renameInputRef\.current\?\.select\(\)/);
assert.match(explorerSource, /onDelete\(entry\)/);
console.log("Run, draft naming, delete recovery, and REPL controls passed");

assert.match(explorerSource, /endsWith\("\.pdf"\)/);
assert.match(explorerSource, /openPdf\(\{ path: entry\.path, name: entry\.name \}\)/);
assert.match(mainSource, /ipcMain\.handle\("pdf:read"/);
assert.match(mainSource, /256 \* 1024 \* 1024/);
assert.match(pdfReaderSource, /pdfjs-dist\/build\/pdf\.worker\.min\.mjs\?url/);
assert.match(pdfReaderSource, /fit-width/);
assert.match(pdfReaderSource, /onWheel=\{handleWheel\}/);
assert.match(pdfReaderSource, /className="pdf-pages"/);
assert.match(pdfReaderSource, /IntersectionObserver/);
assert.match(pdfReaderSource, /openPdfs\.map/);
assert.match(pdfReaderSource, /pdf-document-picker/);
assert.match(pdfReaderSource, /scrollPositionRef/);
console.log("Continuous multi-PDF reader wiring and controls passed");

const workDirectory = fileURLToPath(new URL(".", import.meta.url));
const pathProbe = await mkdtemp(path.join(workDirectory, "path-probe-"));
try {
  const awkwardPath = path.join(pathProbe, "a.");
  const extendedAwkwardPath =
    process.platform === "win32"
      ? `\\\\?\\${path.resolve(awkwardPath)}`
      : awkwardPath;
  await writeFile(extendedAwkwardPath, "probe", "utf8");
  const entries = await readdir(pathProbe);
  const matchingEntry = entries.find(
    (entry) => entry.replace(/[. ]+$/g, "").toLowerCase() === "a"
  );
  assert.ok(matchingEntry, "Windows-style trailing-dot path was not found");
  const resolved = await realpath(awkwardPath);
  assert.equal(
    path.basename(resolved).replace(/[. ]+$/g, "").toLowerCase(),
    "a"
  );
  const safeTrashName = path.join(pathProbe, ".frost-trash-probe");
  await rename(
    extendedAwkwardPath,
    process.platform === "win32"
      ? `\\\\?\\${path.resolve(safeTrashName)}`
      : safeTrashName
  );
  assert.ok(
    (await readdir(pathProbe)).includes(".frost-trash-probe"),
    "Trailing-dot entry was not moved to a safe trash name"
  );
} finally {
  await rm(pathProbe, { recursive: true, force: true });
}
console.log("Trailing-dot path recovery passed");
