export type Activity = "explorer" | "packages" | "settings";
export type WorkspaceMode = "files" | "interactive";
export type BottomPanelTab = "problems" | "output";

export interface AppInfo {
  version: string;
  pythonVersion: string;
  pythonPath: string;
  platform: string;
  testAutoSavePath?: string;
  testAutoSaveContent?: string;
  testAutoSaveIntervalMs?: number;
}

export interface WorkspaceInfo {
  path: string;
  name: string;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface OpenDocument {
  path: string;
  uri: string;
  name: string;
  content: string;
  savedContent: string;
  version: number;
  isUntitled?: boolean;
  parentPath?: string;
  draftName?: string;
}

export interface OpenPdf {
  path: string;
  name: string;
}

export interface IDEPreferences {
  defaultWorkspacePath: string;
}

export interface TerminalSession {
  id: string;
  pid: number;
  type: "run" | "repl";
  label: string;
  state: "running" | "exited";
  exitCode?: number;
}

export interface InstalledPackage {
  name: string;
  version: string;
  summary: string;
}

export interface PackageInventory {
  packages: InstalledPackage[];
  stdlib: string[];
  python: string;
}

export interface PackageSearchResult {
  name: string;
  version?: string;
  summary: string;
  author?: string;
  homepage?: string;
  requiresPython?: string;
  category?: string;
  exact?: boolean;
  custom?: boolean;
  recommended?: boolean;
}

export interface PackageProgress {
  phase: "start" | "output" | "done" | "error";
  spec: string;
  text: string;
  stream?: "stdout" | "stderr";
}

export interface LspNotification {
  method: string;
  params: unknown;
}

export interface LspStatus {
  state: "starting" | "ready" | "stopped" | "error" | "message";
  message: string;
}

export interface CodeDiagnostic {
  id: string;
  uri: string;
  path: string;
  fileName: string;
  severity: "error" | "warning" | "info" | "hint";
  message: string;
  source: string;
  code?: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export interface ToastMessage {
  id: string;
  tone: "success" | "error" | "info";
  title: string;
  detail?: string;
}
