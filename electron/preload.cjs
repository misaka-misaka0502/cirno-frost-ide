const { contextBridge, ipcRenderer } = require("electron");

const subscribe = (channel, callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld("frost", {
  app: {
    getInfo: () => ipcRenderer.invoke("app:get-info"),
    minimize: () => ipcRenderer.send("window:minimize"),
    maximize: () => ipcRenderer.send("window:maximize"),
    close: () => ipcRenderer.send("window:close"),
    confirmClose: () => ipcRenderer.send("window:confirm-close"),
    cancelClose: () => ipcRenderer.send("window:cancel-close"),
    onBeforeClose: (callback) => subscribe("app:before-close", callback)
  },
  workspace: {
    get: () => ipcRenderer.invoke("workspace:get"),
    choose: () => ipcRenderer.invoke("workspace:choose"),
    readDirectory: (directoryPath) =>
      ipcRenderer.invoke("workspace:read-directory", directoryPath),
    readFile: (filePath) => ipcRenderer.invoke("workspace:read-file", filePath),
    writeFile: (filePath, content) =>
      ipcRenderer.invoke("workspace:write-file", filePath, content),
    createFile: (parentPath, name, content) =>
      ipcRenderer.invoke("workspace:create-file", parentPath, name, content),
    createDirectory: (parentPath, name) =>
      ipcRenderer.invoke("workspace:create-directory", parentPath, name),
    rename: (targetPath, name) =>
      ipcRenderer.invoke("workspace:rename", targetPath, name),
    delete: (targetPath) => ipcRenderer.invoke("workspace:delete", targetPath)
  },
  pdf: {
    choose: () => ipcRenderer.invoke("pdf:choose"),
    read: (filePath) => ipcRenderer.invoke("pdf:read", filePath)
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    chooseDefaultWorkspace: () =>
      ipcRenderer.invoke("settings:choose-default-workspace"),
    useCurrentWorkspace: () =>
      ipcRenderer.invoke("settings:use-current-workspace"),
    clearDefaultWorkspace: () =>
      ipcRenderer.invoke("settings:clear-default-workspace")
  },
  terminal: {
    create: (options) => ipcRenderer.invoke("terminal:create", options),
    write: (id, data) => ipcRenderer.send("terminal:write", { id, data }),
    resize: (id, cols, rows) =>
      ipcRenderer.send("terminal:resize", { id, cols, rows }),
    kill: (id) => ipcRenderer.invoke("terminal:kill", id),
    onData: (callback) => subscribe("terminal:data", callback),
    onExit: (callback) => subscribe("terminal:exit", callback)
  },
  packages: {
    list: () => ipcRenderer.invoke("packages:list"),
    search: (query) => ipcRenderer.invoke("packages:search", query),
    install: (spec) => ipcRenderer.invoke("packages:install", spec),
    uninstall: (name) => ipcRenderer.invoke("packages:uninstall", name),
    onProgress: (callback) => subscribe("packages:progress", callback)
  },
  lsp: {
    start: (workspacePath) => ipcRenderer.invoke("lsp:start", workspacePath),
    stop: () => ipcRenderer.invoke("lsp:stop"),
    restart: (workspacePath) => ipcRenderer.invoke("lsp:restart", workspacePath),
    request: (method, params) =>
      ipcRenderer.invoke("lsp:request", { method, params }),
    notify: (method, params) =>
      ipcRenderer.send("lsp:notify", { method, params }),
    onNotification: (callback) => subscribe("lsp:notification", callback),
    onStatus: (callback) => subscribe("lsp:status", callback)
  }
});
