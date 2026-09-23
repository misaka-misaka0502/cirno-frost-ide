import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import {
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pty from "@lydell/node-pty";
import { normalizePythonFileName } from "./python-file-name.mjs";

const require = createRequire(import.meta.url);
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(currentDirectory, "..");
const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);

let mainWindow;
let workspacePath = process.env.FROST_IDE_TEST_WORKSPACE
  ? path.resolve(process.env.FROST_IDE_TEST_WORKSPACE)
  : "";
let lspManager;
const terminals = new Map();
let shutdownStarted = false;
let shutdownFinished = false;
let allowWindowClose = false;
let closeFallbackTimer;
const grantedPdfPaths = new Set();

const popularPackages = [
  {
    name: "requests",
    summary: "简洁而友好的 HTTP 客户端",
    category: "网络"
  },
  {
    name: "numpy",
    summary: "高性能数组与科学计算基础库",
    category: "数据"
  },
  {
    name: "pandas",
    summary: "表格数据分析与处理工具",
    category: "数据"
  },
  {
    name: "matplotlib",
    summary: "经典而强大的数据可视化工具",
    category: "可视化"
  },
  {
    name: "rich",
    summary: "在终端中输出漂亮的文本、表格与进度条",
    category: "终端"
  },
  {
    name: "httpx",
    summary: "支持同步与异步的现代 HTTP 客户端",
    category: "网络"
  },
  {
    name: "fastapi",
    summary: "高性能、类型友好的 Web API 框架",
    category: "Web"
  },
  {
    name: "flask",
    summary: "轻巧灵活的 Web 应用框架",
    category: "Web"
  },
  {
    name: "django",
    summary: "功能完整的 Web 开发框架",
    category: "Web"
  },
  {
    name: "pydantic",
    summary: "由类型提示驱动的数据校验",
    category: "工具"
  },
  {
    name: "pillow",
    summary: "Python 图像处理工具箱",
    category: "图像"
  },
  {
    name: "pygame",
    summary: "适合快速制作 2D 游戏与多媒体程序",
    category: "游戏"
  },
  {
    name: "polars",
    summary: "快速、多线程的 DataFrame 库",
    category: "数据"
  },
  {
    name: "scipy",
    summary: "科学、工程与技术计算算法库",
    category: "科学"
  },
  {
    name: "pytest",
    summary: "简单、强大的 Python 测试框架",
    category: "测试"
  },
  {
    name: "ruff",
    summary: "速度极快的 Python 检查与格式化工具",
    category: "开发"
  }
];

function settingsFilePath() {
  return process.env.FROST_IDE_TEST_SETTINGS_FILE
    ? path.resolve(process.env.FROST_IDE_TEST_SETTINGS_FILE)
    : path.join(app.getPath("userData"), "settings.json");
}

async function readPreferences() {
  try {
    const saved = JSON.parse(await readFile(settingsFilePath(), "utf8"));
    return {
      defaultWorkspacePath:
        typeof saved.defaultWorkspacePath === "string"
          ? saved.defaultWorkspacePath
          : ""
    };
  } catch {
    return { defaultWorkspacePath: "" };
  }
}

async function writePreferences(preferences) {
  const settingsPath = settingsFilePath();
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(preferences, null, 2), "utf8");
  return preferences;
}

async function loadStartupWorkspace() {
  if (process.env.FROST_IDE_TEST_FORCE_EMPTY_WORKSPACE) {
    workspacePath = "";
    return;
  }
  if (process.env.FROST_IDE_TEST_WORKSPACE) {
    workspacePath = path.resolve(process.env.FROST_IDE_TEST_WORKSPACE);
    return;
  }
  const preferences = await readPreferences();
  if (!preferences.defaultWorkspacePath) {
    workspacePath = "";
    return;
  }
  try {
    const target = path.resolve(preferences.defaultWorkspacePath);
    const targetStats = await stat(target);
    workspacePath = targetStats.isDirectory() ? target : "";
  } catch {
    workspacePath = "";
  }
}

function pythonExecutable() {
  const candidates = app.isPackaged
    ? [
        path.join(process.resourcesPath, "runtime", "python", "python.exe"),
        path.join(process.resourcesPath, "runtime", "python", "bin", "python3")
      ]
    : [
        path.join(projectDirectory, "runtime", "python", "python.exe"),
        path.join(projectDirectory, "runtime", "python", "bin", "python3")
      ];
  return candidates[0];
}

function assertInsideWorkspace(targetPath, allowWorkspaceRoot = true) {
  if (!workspacePath) {
    throw new Error("尚未打开工作区");
  }
  const root = path.resolve(workspacePath);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  const inside =
    relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  if (!inside || (!allowWorkspaceRoot && relative === "")) {
    throw new Error("目标不在当前工作区内");
  }
  return target;
}

function sanitizeChildName(name) {
  const trimmed = String(name ?? "")
    .trim()
    .replace(/[. ]+$/g, "");
  if (
    !trimmed ||
    trimmed === "." ||
    trimmed === ".." ||
    /[<>:"/\\|?*\u0000-\u001f]/.test(trimmed) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(trimmed)
  ) {
    throw new Error("名称为空，或包含 Windows 不允许的字符与保留名称");
  }
  return trimmed;
}

function windowsExtendedPath(targetPath) {
  const resolved = path.resolve(targetPath);
  if (process.platform !== "win32" || resolved.startsWith("\\\\?\\")) {
    return resolved;
  }
  if (resolved.startsWith("\\\\")) {
    return `\\\\?\\UNC\\${resolved.slice(2)}`;
  }
  return `\\\\?\\${resolved}`;
}

function pdfAccessKey(targetPath) {
  const resolved = path.resolve(targetPath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isInsideCurrentWorkspace(targetPath) {
  if (!workspacePath) {
    return false;
  }
  const root = path.resolve(workspacePath);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function readPdfPayload(filePath) {
  const target = path.resolve(filePath);
  if (path.extname(target).toLowerCase() !== ".pdf") {
    throw new Error("只能在 PDF 阅读器中打开 .pdf 文件");
  }
  if (
    !isInsideCurrentWorkspace(target) &&
    !grantedPdfPaths.has(pdfAccessKey(target))
  ) {
    throw new Error("这个 PDF 不在当前工作区内，请使用“打开 PDF”重新选择");
  }
  const fileStats = await stat(target);
  if (!fileStats.isFile()) {
    throw new Error("选择的项目不是 PDF 文件");
  }
  if (fileStats.size > 256 * 1024 * 1024) {
    throw new Error("PDF 超过 256 MB，暂时无法在侧边阅读器中打开");
  }
  const contents = await readFile(target);
  const data = Uint8Array.from(contents).buffer;
  return {
    path: target,
    name: path.basename(target),
    data
  };
}

async function listDirectory(directoryPath) {
  const safePath = assertInsideWorkspace(directoryPath);
  const entries = await readdir(safePath, { withFileTypes: true });
  return entries
    .filter((entry) => ![".git", "__pycache__", ".venv"].includes(entry.name))
    .map((entry) => ({
      name: entry.name,
      path: path.join(safePath, entry.name),
      isDirectory: entry.isDirectory()
    }))
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      return a.name.localeCompare(b.name, "zh-CN", {
        numeric: true,
        sensitivity: "base"
      });
    });
}

function createWindow() {
  allowWindowClose = false;
  mainWindow = new BrowserWindow({
    width: 1460,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    show: false,
    frame: false,
    backgroundColor: "#07111f",
    webPreferences: {
      preload: path.join(currentDirectory, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    if (!process.env.FROST_IDE_TEST_PDF_PATH) {
      mainWindow.show();
    }
  });
  mainWindow.on("maximize", () =>
    mainWindow.webContents.send("window:maximized", true)
  );
  mainWindow.on("unmaximize", () =>
    mainWindow.webContents.send("window:maximized", false)
  );
  mainWindow.on("close", (event) => {
    if (allowWindowClose || shutdownStarted || mainWindow?.isDestroyed()) {
      return;
    }
    event.preventDefault();
    mainWindow.webContents.send("app:before-close");
    clearTimeout(closeFallbackTimer);
    closeFallbackTimer = setTimeout(() => {
      allowWindowClose = true;
      mainWindow?.close();
    }, 30_000);
  });

  if (isDevelopment) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(projectDirectory, "dist", "index.html"));
  }

  if (process.env.FROST_IDE_TEST_PDF_PATH) {
    const testPdfPath = path.resolve(process.env.FROST_IDE_TEST_PDF_PATH);
    const secondTestPdfPath = process.env.FROST_IDE_TEST_PDF_SECOND_PATH
      ? path.resolve(process.env.FROST_IDE_TEST_PDF_SECOND_PATH)
      : "";
    mainWindow.webContents.once("did-finish-load", () => {
      void (async () => {
        try {
          const result = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const target = ${JSON.stringify(testPdfPath)};
              const secondTarget = ${JSON.stringify(secondTestPdfPath)};
              const waitFor = async (read, timeout = 20000) => {
                const started = Date.now();
                while (Date.now() - started < timeout) {
                  const value = read();
                  if (value) return value;
                  await new Promise((resolve) => setTimeout(resolve, 80));
                }
                throw new Error("PDF reader UI test timed out");
              };
              const row = await waitFor(() =>
                [...document.querySelectorAll(".tree-row")]
                  .find((item) => item.title === target)
              );
              row.click();
              const renderResult = await waitFor(() => {
                const error = document.querySelector(
                  ".pdf-reader-state.error small"
                )?.textContent;
                if (error) {
                  return { error };
                }
                const candidate = document.querySelector(
                  ".pdf-reader-panel.visible canvas"
                );
                const count = document.querySelector(
                  ".pdf-document-view.active .pdf-page-controls > span"
                )?.textContent ?? "";
                return candidate &&
                  candidate.width > 0 &&
                  count.includes("/ 3") &&
                  document.querySelector('[data-pdf-page="3"]')
                  ? { canvas: candidate, count }
                  : null;
              });
              if (renderResult.error) {
                throw new Error(renderResult.error);
              }
              const firstViewport = document.querySelector(
                ".pdf-document-view.active .pdf-reader-viewport"
              );
              firstViewport.scrollTop = 600;
              firstViewport.dispatchEvent(new Event("scroll", { bubbles: true }));
              await waitFor(() => firstViewport.scrollTop > 100);
              const savedScrollTop = firstViewport.scrollTop;

              const secondRow = await waitFor(() =>
                [...document.querySelectorAll(".tree-row")]
                  .find((item) => item.title === secondTarget)
              );
              secondRow.click();
              const picker = await waitFor(() => {
                const select = document.querySelector(
                  ".pdf-document-picker select"
                );
                return select &&
                  select.options.length === 2 &&
                  select.value === secondTarget
                  ? select
                  : null;
              });
              await waitFor(() =>
                document.querySelector(
                  ".pdf-document-view.active canvas"
                )?.width > 0
              );
              picker.value = target;
              picker.dispatchEvent(new Event("change", { bubbles: true }));
              const restoredViewport = await waitFor(() => {
                const select = document.querySelector(
                  ".pdf-document-picker select"
                );
                const viewport = document.querySelector(
                  ".pdf-document-view.active .pdf-reader-viewport"
                );
                return select?.value === target &&
                  viewport?.scrollTop >= savedScrollTop - 2
                  ? viewport
                  : null;
              });
              return {
                canvasWidth: renderResult.canvas.width,
                canvasHeight: renderResult.canvas.height,
                pageCount: renderResult.count,
                openCount: picker.options.length,
                restoredScrollTop: restoredViewport.scrollTop
              };
            })()
          `);
          if (
            result?.canvasWidth > 0 &&
            result?.canvasHeight > 0 &&
            String(result?.pageCount).includes("/ 3") &&
            result?.openCount === 2 &&
            result?.restoredScrollTop > 100
          ) {
            console.log("PDF_READER_UI_PASSED");
          } else {
            console.error("PDF_READER_UI_FAILED", result);
            process.exitCode = 1;
          }
        } catch (error) {
          console.error("PDF_READER_UI_FAILED", error);
          process.exitCode = 1;
        } finally {
          app.quit();
        }
      })();
    });
  }
}

function send(channel, payload) {
  if (
    !shutdownStarted &&
    mainWindow &&
    !mainWindow.isDestroyed() &&
    !mainWindow.webContents.isDestroyed()
  ) {
    try {
      mainWindow.webContents.send(channel, payload);
    } catch {
      // The renderer can disappear between the checks while the app closes.
    }
  }
}

function createTerminal(options = {}) {
  const id = crypto.randomUUID();
  const python = pythonExecutable();
  const terminalType = options.type === "repl" ? "repl" : "run";
  let args;
  let cwd;

  if (terminalType === "repl") {
    cwd = options.cwd ? assertInsideWorkspace(options.cwd) : workspacePath;
    args = ["-u", "-i", "-q"];
  } else {
    const filePath = assertInsideWorkspace(options.filePath);
    cwd = path.dirname(filePath);
    args = ["-u", filePath];
  }

  const processHandle = pty.spawn(python, args, {
    name: "xterm-256color",
    cols: Number(options.cols) || 100,
    rows: Number(options.rows) || 28,
    cwd,
    useConpty: true,
    env: {
      ...process.env,
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8",
      PYTHONUNBUFFERED: "1",
      TERM: "xterm-256color",
      COLORTERM: "truecolor"
    }
  });

  terminals.set(id, processHandle);
  processHandle.onData((data) => send("terminal:data", { id, data }));
  processHandle.onExit(({ exitCode, signal }) => {
    terminals.delete(id);
    send("terminal:exit", { id, exitCode, signal });
  });

  return {
    id,
    pid: processHandle.pid,
    type: terminalType,
    label:
      terminalType === "repl"
        ? options.label || "Python REPL"
        : path.basename(options.filePath)
  };
}

function runPython(args, onOutput) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonExecutable(), args, {
      cwd: workspacePath || projectDirectory,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
        PIP_DISABLE_PIP_VERSION_CHECK: "1"
      }
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stdout += text;
      onOutput?.(text, "stdout");
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stderr += text;
      onOutput?.(text, "stderr");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr.trim() || `Python 进程退出，代码 ${code}`));
      }
    });
  });
}

async function listPackages() {
  const script = [
    "import importlib.metadata as m, json, sys",
    "packages = []",
    "for d in m.distributions():",
    "    name = d.metadata.get('Name') or d.metadata.get('Summary') or 'unknown'",
    "    packages.append({'name': name, 'version': d.version, 'summary': d.metadata.get('Summary') or ''})",
    "packages.sort(key=lambda item: item['name'].lower())",
    "print(json.dumps({'packages': packages, 'stdlib': sorted(sys.stdlib_module_names), 'python': sys.version.split()[0]}, ensure_ascii=False))"
  ].join("\n");
  const output = await runPython(["-c", script]);
  return JSON.parse(output);
}

function validatePackageSpec(spec) {
  const value = String(spec ?? "").trim();
  if (
    !value ||
    value.length > 180 ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*(?:\[[A-Za-z0-9,._-]+\])?(?:(?:==|>=|<=|~=|!=|>|<)[A-Za-z0-9.*+!_-]+)?$/.test(
      value
    )
  ) {
    throw new Error("请输入有效的包名或版本，例如 requests 或 requests==2.32.5");
  }
  return value;
}

class LspManager {
  constructor(sender) {
    this.sender = sender;
    this.process = null;
    this.buffer = Buffer.alloc(0);
    this.nextId = 1;
    this.pending = new Map();
    this.rootPath = "";
    this.stopping = false;
  }

  async start(rootPath) {
    await this.stop();
    this.stopping = false;
    this.rootPath = rootPath;
    const resolvedServerPath = require.resolve("pyright/langserver.index.js");
    const serverPath = app.isPackaged
      ? resolvedServerPath.replace("app.asar", "app.asar.unpacked")
      : resolvedServerPath;
    this.process = spawn(process.execPath, [serverPath, "--stdio"], {
      cwd: rootPath,
      windowsHide: true,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        PYTHONUTF8: "1"
      },
      stdio: ["pipe", "pipe", "pipe"]
    });

    this.process.stdout.on("data", (chunk) => this.consume(chunk));
    this.process.stdin.on("error", (error) => {
      if (!this.stopping && error?.code !== "EPIPE") {
        this.sender("lsp:status", {
          state: "error",
          message: error.message
        });
      }
    });
    this.process.stderr.on("data", (chunk) => {
      this.sender("lsp:status", {
        state: "message",
        message: chunk.toString("utf8")
      });
    });
    this.process.on("error", (error) => {
      this.sender("lsp:status", {
        state: "error",
        message: error.message
      });
      this.rejectAll(error);
    });
    const processHandle = this.process;
    this.process.on("close", (code) => {
      if (!this.stopping) {
        this.sender("lsp:status", {
          state: "stopped",
          message: `Pyright 已退出 (${code ?? "unknown"})`
        });
      }
      if (this.process === processHandle) {
        this.process = null;
      }
      this.rejectAll(new Error("Pyright 语言服务已停止"));
    });

    this.sender("lsp:status", {
      state: "starting",
      message: "正在启动 Pyright"
    });

    const rootUri = pathToFileURL(rootPath).toString();
    const result = await this.request("initialize", {
      processId: process.pid,
      clientInfo: {
        name: "Frost IDE",
        version: "0.1.0"
      },
      rootPath,
      rootUri,
      workspaceFolders: [
        {
          uri: rootUri,
          name: path.basename(rootPath)
        }
      ],
      capabilities: {
        workspace: {
          workspaceFolders: true,
          configuration: true,
          didChangeWatchedFiles: {
            dynamicRegistration: false
          }
        },
        textDocument: {
          synchronization: {
            didSave: true,
            dynamicRegistration: false
          },
          completion: {
            completionItem: {
              snippetSupport: true,
              commitCharactersSupport: true,
              documentationFormat: ["markdown", "plaintext"],
              deprecatedSupport: true,
              insertReplaceSupport: true,
              resolveSupport: {
                properties: [
                  "documentation",
                  "detail",
                  "additionalTextEdits"
                ]
              }
            },
            contextSupport: true
          },
          hover: {
            contentFormat: ["markdown", "plaintext"]
          },
          signatureHelp: {
            signatureInformation: {
              documentationFormat: ["markdown", "plaintext"],
              parameterInformation: {
                labelOffsetSupport: true
              },
              activeParameterSupport: true
            }
          },
          definition: {
            linkSupport: true
          },
          publishDiagnostics: {
            relatedInformation: true,
            versionSupport: true,
            tagSupport: {
              valueSet: [1, 2]
            }
          }
        },
        window: {
          workDoneProgress: true
        }
      },
      initializationOptions: {
        diagnosticMode: "workspace"
      }
    });

    this.notify("initialized", {});
    this.notify("workspace/didChangeConfiguration", {
      settings: {
        python: {
          pythonPath: pythonExecutable(),
          analysis: {
            autoImportCompletions: true,
            diagnosticMode: "workspace",
            typeCheckingMode: "basic",
            useLibraryCodeForTypes: true,
            autoSearchPaths: true,
            indexing: true
          }
        }
      }
    });
    this.sender("lsp:status", {
      state: "ready",
      message: "Pyright 智能补全已就绪"
    });
    if (process.env.FROST_IDE_TEST_WORKSPACE) {
      console.log("FROST_TEST_LSP_READY");
    }
    return result;
  }

  write(message) {
    const processHandle = this.process;
    if (
      !processHandle ||
      processHandle.killed ||
      processHandle.exitCode !== null ||
      !processHandle.stdin?.writable ||
      processHandle.stdin.destroyed
    ) {
      throw new Error("Pyright 语言服务尚未启动");
    }
    const json = JSON.stringify(message);
    const body = Buffer.from(json, "utf8");
    const packet = Buffer.concat([
      Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii"),
      body
    ]);
    processHandle.stdin.write(packet, (error) => {
      if (error && error.code !== "EPIPE" && !this.stopping) {
        this.sender("lsp:status", {
          state: "error",
          message: error.message
        });
      }
    });
  }

  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      try {
        this.write({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  notify(method, params) {
    this.write({ jsonrpc: "2.0", method, params });
  }

  consume(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return;
      }
      const header = this.buffer.subarray(0, headerEnd).toString("ascii");
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }
      const contentLength = Number(match[1]);
      const messageEnd = headerEnd + 4 + contentLength;
      if (this.buffer.length < messageEnd) {
        return;
      }
      const body = this.buffer
        .subarray(headerEnd + 4, messageEnd)
        .toString("utf8");
      this.buffer = this.buffer.subarray(messageEnd);
      try {
        this.handleMessage(JSON.parse(body));
      } catch (error) {
        this.sender("lsp:status", {
          state: "error",
          message: `无法解析语言服务消息：${error.message}`
        });
      }
    }
  }

  handleMessage(message) {
    if (message.id !== undefined && (message.result !== undefined || message.error)) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(
          new Error(message.error.message || `${pending.method} 请求失败`)
        );
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (message.id !== undefined && message.method) {
      this.handleServerRequest(message);
      return;
    }
    if (message.method) {
      this.sender("lsp:notification", {
        method: message.method,
        params: message.params
      });
    }
  }

  handleServerRequest(message) {
    let result = null;
    switch (message.method) {
      case "workspace/configuration": {
        const settings = {
          pythonPath: pythonExecutable(),
          analysis: {
            autoImportCompletions: true,
            diagnosticMode: "workspace",
            typeCheckingMode: "basic",
            useLibraryCodeForTypes: true,
            autoSearchPaths: true,
            indexing: true
          }
        };
        result = (message.params?.items ?? []).map((item) =>
          item.section === "python" ? settings : settings.analysis
        );
        break;
      }
      case "workspace/workspaceFolders": {
        result = [
          {
            uri: pathToFileURL(this.rootPath).toString(),
            name: path.basename(this.rootPath)
          }
        ];
        break;
      }
      case "workspace/applyEdit": {
        result = { applied: false };
        break;
      }
      case "window/showMessageRequest": {
        result = null;
        break;
      }
      case "client/registerCapability":
      case "client/unregisterCapability":
      case "window/workDoneProgress/create": {
        result = null;
        break;
      }
      default: {
        this.write({
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32601,
            message: `Frost IDE 暂不支持服务端请求 ${message.method}`
          }
        });
        return;
      }
    }
    this.write({
      jsonrpc: "2.0",
      id: message.id,
      result
    });
  }

  rejectAll(error) {
    for (const { reject } of this.pending.values()) {
      reject(error);
    }
    this.pending.clear();
  }

  async stop() {
    const processHandle = this.process;
    if (!processHandle) {
      return;
    }
    this.stopping = true;
    try {
      await Promise.race([
        this.request("shutdown", null),
        new Promise((resolve) => setTimeout(resolve, 700))
      ]);
    } catch {
      // Process may already be gone.
    }
    if (this.process === processHandle && processHandle.exitCode === null) {
      try {
        this.write({ jsonrpc: "2.0", method: "exit", params: null });
      } catch {
        // The pipe may already have closed after shutdown.
      }
    }
    if (processHandle.stdin?.writable && !processHandle.stdin.destroyed) {
      processHandle.stdin.end();
    }
    await Promise.race([
      new Promise((resolve) => processHandle.once("close", resolve)),
      new Promise((resolve) => setTimeout(resolve, 700))
    ]);
    if (processHandle.exitCode === null && !processHandle.killed) {
      processHandle.kill();
    }
    if (this.process === processHandle) {
      this.process = null;
    }
    this.rejectAll(new Error("Pyright 语言服务已重启"));
  }
}

function registerIpc() {
  ipcMain.handle("app:get-info", async () => {
    let pythonVersion = "未找到";
    try {
      pythonVersion = (
        await runPython(["-c", "import platform; print(platform.python_version())"])
      ).trim();
    } catch {
      // UI will show a helpful unavailable state.
    }
    return {
      version: app.getVersion(),
      pythonVersion,
      pythonPath: pythonExecutable(),
      platform: process.platform,
      ...(process.env.FROST_IDE_TEST_AUTOSAVE_FILE
        ? {
            testAutoSavePath: process.env.FROST_IDE_TEST_AUTOSAVE_FILE,
            testAutoSaveContent:
              process.env.FROST_IDE_TEST_AUTOSAVE_CONTENT ?? "",
            ...(process.env.FROST_IDE_TEST_AUTOSAVE_INTERVAL_MS
              ? {
                  testAutoSaveIntervalMs: Number(
                    process.env.FROST_IDE_TEST_AUTOSAVE_INTERVAL_MS
                  )
                }
              : {})
          }
        : {})
    };
  });

  ipcMain.on("window:minimize", () => mainWindow?.minimize());
  ipcMain.on("window:maximize", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on("window:close", () => mainWindow?.close());
  ipcMain.on("window:confirm-close", () => {
    clearTimeout(closeFallbackTimer);
    allowWindowClose = true;
    mainWindow?.close();
  });
  ipcMain.on("window:cancel-close", () => {
    clearTimeout(closeFallbackTimer);
    allowWindowClose = false;
  });

  ipcMain.handle("workspace:get", async () =>
    workspacePath
      ? {
          path: workspacePath,
          name: path.basename(workspacePath)
        }
      : null
  );

  ipcMain.handle("workspace:choose", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "选择 Python 项目文件夹",
      ...(workspacePath ? { defaultPath: workspacePath } : {}),
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    workspacePath = path.resolve(result.filePaths[0]);
    return {
      path: workspacePath,
      name: path.basename(workspacePath)
    };
  });

  ipcMain.handle("workspace:read-directory", (_event, directoryPath) =>
    listDirectory(directoryPath)
  );
  ipcMain.handle("workspace:read-file", async (_event, filePath) => {
    const safePath = assertInsideWorkspace(filePath);
    const fileStats = await stat(safePath);
    if (fileStats.size > 5 * 1024 * 1024) {
      throw new Error("文件超过 5 MB，Frost IDE 暂不直接打开它");
    }
    return readFile(safePath, "utf8");
  });
  ipcMain.handle("pdf:choose", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "打开 PDF 参考资料",
      ...(workspacePath ? { defaultPath: workspacePath } : {}),
      filters: [{ name: "PDF 文档", extensions: ["pdf"] }],
      properties: ["openFile"]
    });
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    const target = path.resolve(result.filePaths[0]);
    grantedPdfPaths.add(pdfAccessKey(target));
    return {
      path: target,
      name: path.basename(target)
    };
  });
  ipcMain.handle("pdf:read", (_event, filePath) =>
    readPdfPayload(filePath)
  );
  ipcMain.handle(
    "workspace:write-file",
    async (_event, filePath, content) => {
      const safePath = assertInsideWorkspace(filePath);
      await writeFile(safePath, String(content), "utf8");
      return { path: safePath };
    }
  );
  ipcMain.handle(
    "workspace:create-file",
    async (_event, parentPath, name, content = "") => {
      const parent = assertInsideWorkspace(parentPath);
      const fileName = normalizePythonFileName(name);
      const target = assertInsideWorkspace(
        path.join(parent, fileName)
      );
      try {
        await writeFile(target, String(content), {
          encoding: "utf8",
          flag: "wx"
        });
      } catch (error) {
        if (error?.code === "EEXIST") {
          throw new Error(`文件“${fileName}”已经存在，请换一个名称`);
        }
        throw error;
      }
      return { path: target, name: path.basename(target), isDirectory: false };
    }
  );
  ipcMain.handle(
    "workspace:create-directory",
    async (_event, parentPath, name) => {
      const parent = assertInsideWorkspace(parentPath);
      const target = assertInsideWorkspace(
        path.join(parent, sanitizeChildName(name))
      );
      await mkdir(target);
      return { path: target, name: path.basename(target), isDirectory: true };
    }
  );
  ipcMain.handle("workspace:rename", async (_event, targetPath, name) => {
    const source = assertInsideWorkspace(targetPath, false);
    const sourceStats = await stat(source);
    const nextName = sourceStats.isDirectory()
      ? sanitizeChildName(name)
      : path.extname(source).toLowerCase() === ".pdf"
        ? (() => {
            const sanitized = sanitizeChildName(name);
            return sanitized.toLowerCase().endsWith(".pdf")
              ? sanitized
              : `${sanitized}.pdf`;
          })()
        : normalizePythonFileName(name);
    const target = assertInsideWorkspace(
      path.join(path.dirname(source), nextName)
    );
    await rename(source, target);
    return { oldPath: source, path: target, name: path.basename(target) };
  });
  ipcMain.handle("workspace:delete", async (_event, targetPath) => {
    const safePath = assertInsideWorkspace(targetPath, false);
    const parentPath = assertInsideWorkspace(path.dirname(safePath));
    const requestedName = path.basename(safePath);
    const entries = await readdir(parentPath);
    const normalizedRequestedName = requestedName
      .replace(/[. ]+$/g, "")
      .toLowerCase();
    const actualName =
      entries.find((entry) => entry === requestedName) ??
      entries.find(
        (entry) =>
          entry.replace(/[. ]+$/g, "").toLowerCase() ===
          normalizedRequestedName
      );
    if (!actualName) {
      throw new Error(`找不到要删除的项目“${requestedName}”`);
    }

    const directoryEntryPath = assertInsideWorkspace(
      path.join(parentPath, actualName),
      false
    );
    let trashPath = directoryEntryPath;
    let restorePath = "";
    if (process.platform === "win32" && /[. ]$/.test(actualName)) {
      trashPath = assertInsideWorkspace(
        path.join(parentPath, `.frost-trash-${crypto.randomUUID()}`),
        false
      );
      await rename(
        windowsExtendedPath(directoryEntryPath),
        windowsExtendedPath(trashPath)
      );
      restorePath = directoryEntryPath;
    } else {
      try {
        trashPath = assertInsideWorkspace(
          await realpath(directoryEntryPath),
          false
        );
      } catch {
        trashPath = directoryEntryPath;
      }
    }

    try {
      await shell.trashItem(trashPath);
    } catch (error) {
      if (restorePath) {
        try {
          await rename(
            windowsExtendedPath(trashPath),
            windowsExtendedPath(restorePath)
          );
        } catch {
          // Keep the safely named item in place rather than deleting it forever.
        }
      }
      throw error;
    }
    return { path: trashPath };
  });

  ipcMain.handle("settings:get", () => readPreferences());
  ipcMain.handle("settings:choose-default-workspace", async () => {
    const preferences = await readPreferences();
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "选择默认工作区文件夹",
      ...(preferences.defaultWorkspacePath || workspacePath
        ? {
            defaultPath:
              preferences.defaultWorkspacePath || workspacePath
          }
        : {}),
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || !result.filePaths[0]) {
      return null;
    }
    return writePreferences({
      defaultWorkspacePath: path.resolve(result.filePaths[0])
    });
  });
  ipcMain.handle("settings:use-current-workspace", async () => {
    if (!workspacePath) {
      throw new Error("请先打开一个工作区文件夹");
    }
    return writePreferences({ defaultWorkspacePath: workspacePath });
  });
  ipcMain.handle("settings:clear-default-workspace", () =>
    writePreferences({ defaultWorkspacePath: "" })
  );

  ipcMain.handle("terminal:create", (_event, options) =>
    createTerminal(options)
  );
  ipcMain.on("terminal:write", (_event, { id, data }) => {
    const terminal = terminals.get(id);
    if (!terminal) {
      return;
    }
    try {
      terminal.write(String(data));
    } catch {
      terminals.delete(id);
    }
  });
  ipcMain.on("terminal:resize", (_event, { id, cols, rows }) => {
    if (cols > 1 && rows > 1) {
      terminals.get(id)?.resize(cols, rows);
    }
  });
  ipcMain.handle("terminal:kill", (_event, id) => {
    const processHandle = terminals.get(id);
    if (processHandle) {
      processHandle.kill();
      terminals.delete(id);
    }
    return true;
  });

  ipcMain.handle("packages:list", () => listPackages());
  ipcMain.handle("packages:search", async (_event, rawQuery) => {
    const query = String(rawQuery ?? "").trim();
    if (!query) {
      return popularPackages.map((item) => ({
        ...item,
        recommended: true
      }));
    }
    const matches = popularPackages.filter(
      (item) =>
        item.name.toLowerCase().includes(query.toLowerCase()) ||
        item.summary.toLowerCase().includes(query.toLowerCase())
    );
    try {
      const response = await fetch(
        `https://pypi.org/pypi/${encodeURIComponent(query)}/json`,
        {
          headers: {
            Accept: "application/json",
            "User-Agent": "Frost-IDE/0.1"
          }
        }
      );
      if (response.ok) {
        const payload = await response.json();
        return [
          {
            name: payload.info.name,
            version: payload.info.version,
            summary: payload.info.summary || "暂无简介",
            author: payload.info.author || payload.info.maintainer || "",
            homepage:
              payload.info.project_url ||
              payload.info.home_page ||
              `https://pypi.org/project/${payload.info.name}/`,
            requiresPython: payload.info.requires_python || "",
            exact: true
          },
          ...matches.filter(
            (item) =>
              item.name.toLowerCase() !== payload.info.name.toLowerCase()
          )
        ];
      }
    } catch {
      // Curated fuzzy results and manual install remain available offline.
    }
    return [
      ...matches,
      {
        name: query,
        summary: "按这个名称从 PyPI 安装",
        custom: true
      }
    ];
  });
  ipcMain.handle("packages:install", async (_event, rawSpec) => {
    const spec = validatePackageSpec(rawSpec);
    send("packages:progress", {
      phase: "start",
      spec,
      text: `正在安装 ${spec}…\n`
    });
    try {
      await runPython(
        ["-m", "pip", "install", "--upgrade", spec],
        (text, stream) =>
          send("packages:progress", {
            phase: "output",
            spec,
            text,
            stream
          })
      );
      send("packages:progress", {
        phase: "done",
        spec,
        text: `${spec} 安装完成\n`
      });
      lspManager?.notify("workspace/didChangeWatchedFiles", {
        changes: []
      });
      return { success: true };
    } catch (error) {
      send("packages:progress", {
        phase: "error",
        spec,
        text: `${error.message}\n`
      });
      throw error;
    }
  });
  ipcMain.handle("packages:uninstall", async (_event, rawName) => {
    const name = validatePackageSpec(rawName);
    send("packages:progress", {
      phase: "start",
      spec: name,
      text: `正在卸载 ${name}…\n`
    });
    try {
      await runPython(
        ["-m", "pip", "uninstall", "-y", name],
        (text, stream) =>
          send("packages:progress", {
            phase: "output",
            spec: name,
            text,
            stream
          })
      );
      send("packages:progress", {
        phase: "done",
        spec: name,
        text: `${name} 已卸载\n`
      });
      return { success: true };
    } catch (error) {
      send("packages:progress", {
        phase: "error",
        spec: name,
        text: `${error.message}\n`
      });
      throw error;
    }
  });

  ipcMain.handle("lsp:start", async (_event, rootPath) => {
    const safeRoot = assertInsideWorkspace(rootPath);
    return lspManager.start(safeRoot);
  });
  ipcMain.handle("lsp:stop", () => lspManager.stop());
  ipcMain.handle("lsp:restart", async (_event, rootPath) => {
    const safeRoot = assertInsideWorkspace(rootPath);
    return lspManager.start(safeRoot);
  });
  ipcMain.handle("lsp:request", (_event, { method, params }) =>
    lspManager.request(method, params)
  );
  ipcMain.on("lsp:notify", (_event, { method, params }) => {
    try {
      lspManager.notify(method, params);
    } catch (error) {
      send("lsp:status", {
        state: "error",
        message: error.message
      });
    }
  });
}

app.whenReady().then(async () => {
  await loadStartupWorkspace();
  lspManager = new LspManager(send);
  registerIpc();
  createWindow();
  if (process.env.FROST_IDE_TEST_REPORT_WORKSPACE) {
    console.log(
      workspacePath ? "FROST_TEST_WORKSPACE_SET" : "FROST_TEST_WORKSPACE_EMPTY"
    );
  }
  const autoCloseDelay = Number(process.env.FROST_IDE_TEST_AUTO_CLOSE_MS);
  if (Number.isFinite(autoCloseDelay) && autoCloseDelay > 0) {
    setTimeout(() => {
      if (process.env.FROST_IDE_TEST_CLOSE_WINDOW) {
        mainWindow?.close();
      } else {
        app.quit();
      }
    }, autoCloseDelay);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (shutdownFinished) {
    return;
  }
  event.preventDefault();
  if (shutdownStarted) {
    return;
  }
  shutdownStarted = true;
  void (async () => {
    for (const terminal of terminals.values()) {
      try {
        terminal.kill();
      } catch {
        // A terminal may already have exited.
      }
    }
    terminals.clear();
    await lspManager?.stop();
    shutdownFinished = true;
    app.quit();
  })();
});
