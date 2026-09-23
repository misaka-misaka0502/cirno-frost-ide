const { spawn } = require("node:child_process");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const serverPath = require.resolve("pyright/langserver.index.js");
const rootPath = process.cwd();
const pythonPath = path.resolve("runtime", "python", "python.exe");
const child = spawn(process.execPath, [serverPath, "--stdio"], {
  cwd: rootPath,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1"
  },
  stdio: ["pipe", "pipe", "pipe"]
});

let buffer = Buffer.alloc(0);
let nextId = 1;
const pending = new Map();
const diagnosticsWaiters = new Map();

function normalizeUri(uri) {
  return decodeURIComponent(String(uri)).toLowerCase();
}

function write(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  child.stdin.write(
    Buffer.concat([
      Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"),
      body
    ])
  );
}

function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    write({ jsonrpc: "2.0", id, method, params });
  });
}

function notify(method, params) {
  write({ jsonrpc: "2.0", method, params });
}

function handle(message) {
  if (message.id !== undefined && (message.result !== undefined || message.error)) {
    const item = pending.get(message.id);
    if (item) {
      pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error.message));
      else item.resolve(message.result);
    }
    return;
  }
  if (message.id !== undefined && message.method) {
    if (message.method === "workspace/configuration") {
      write({
        jsonrpc: "2.0",
        id: message.id,
        result: (message.params?.items ?? []).map(() => ({
          pythonPath,
          analysis: {
            autoImportCompletions: true,
            typeCheckingMode: "basic",
            useLibraryCodeForTypes: true
          }
        }))
      });
    } else {
      write({ jsonrpc: "2.0", id: message.id, result: null });
    }
    return;
  }
  if (message.method === "textDocument/publishDiagnostics") {
    const key = normalizeUri(message.params?.uri);
    const waiter = diagnosticsWaiters.get(key);
    if (waiter && message.params.diagnostics?.length) {
      diagnosticsWaiters.delete(key);
      waiter(message.params.diagnostics);
    }
  }
}

function waitForDiagnostics(uri) {
  return new Promise((resolve, reject) => {
    const key = normalizeUri(uri);
    diagnosticsWaiters.set(key, resolve);
    setTimeout(() => {
      if (diagnosticsWaiters.delete(key)) {
        reject(new Error("Timed out waiting for syntax diagnostics"));
      }
    }, 8_000).unref();
  });
}

async function shutdown() {
  try {
    await Promise.race([
      request("shutdown", null),
      new Promise((resolve) => setTimeout(resolve, 1_000))
    ]);
    notify("exit", null);
    child.stdin.end();
  } catch {
    child.kill();
  }
}

child.stdout.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const header = buffer.subarray(0, headerEnd).toString("ascii");
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) throw new Error("Invalid LSP header");
    const length = Number(match[1]);
    const end = headerEnd + 4 + length;
    if (buffer.length < end) return;
    const body = buffer.subarray(headerEnd + 4, end).toString("utf8");
    buffer = buffer.subarray(end);
    handle(JSON.parse(body));
  }
});

child.stderr.on("data", (data) => process.stderr.write(data));

(async () => {
  const rootUri = pathToFileURL(rootPath).toString();
  await request("initialize", {
    processId: process.pid,
    rootUri,
    workspaceFolders: [{ uri: rootUri, name: path.basename(rootPath) }],
    capabilities: {
      workspace: { configuration: true, workspaceFolders: true },
      textDocument: {
        synchronization: {
          didSave: true,
          dynamicRegistration: false
        },
        completion: {
          completionItem: { snippetSupport: true }
        },
        publishDiagnostics: {
          relatedInformation: true,
          versionSupport: true
        }
      }
    },
    initializationOptions: {
      diagnosticMode: "workspace"
    }
  });
  notify("initialized", {});
  notify("workspace/didChangeConfiguration", {
    settings: {
      python: {
        pythonPath,
        analysis: {
          autoImportCompletions: true,
          typeCheckingMode: "basic"
        }
      }
    }
  });

  const uri = `${rootUri}/work/lsp_probe.py`;
  const source = "import json\njson.";
  notify("textDocument/didOpen", {
    textDocument: {
      uri,
      languageId: "python",
      version: 1,
      text: source
    }
  });
  const completion = await request("textDocument/completion", {
    textDocument: { uri },
    position: { line: 1, character: 5 },
    context: { triggerKind: 2, triggerCharacter: "." }
  });
  const items = Array.isArray(completion) ? completion : completion?.items ?? [];
  const labels = items.map((item) =>
    typeof item.label === "string" ? item.label : item.label?.label
  );
  if (!labels.includes("loads") || !labels.includes("dumps")) {
    throw new Error(`Expected json completion items; got ${labels.slice(0, 20)}`);
  }
  console.log(`LSP completion passed with ${items.length} items`);
  const diagnosticsUri = `${rootUri}/work/lsp_diagnostics_probe.py`;
  const diagnosticsPromise = waitForDiagnostics(diagnosticsUri);
  notify("textDocument/didOpen", {
    textDocument: {
      uri: diagnosticsUri,
      languageId: "python",
      version: 1,
      text: "def broken(:\n    pass\n"
    }
  });
  const diagnostics = await diagnosticsPromise;
  if (!diagnostics.some((item) => item.severity === 1)) {
    throw new Error("Expected a Pyright syntax error diagnostic");
  }
  console.log(`LSP diagnostics passed with ${diagnostics.length} item(s)`);
  await shutdown();
  process.exit(0);
})().catch((error) => {
  console.error(error);
  void shutdown().finally(() => process.exit(1));
});

setTimeout(() => {
  console.error("LSP integration timed out");
  child.kill();
  process.exit(1);
}, 20_000).unref();
