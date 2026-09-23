import type {
  AppInfo,
  FileEntry,
  IDEPreferences,
  LspNotification,
  LspStatus,
  PackageInventory,
  PackageProgress,
  PackageSearchResult,
  OpenPdf,
  TerminalSession,
  WorkspaceInfo
} from "./types";

declare global {
  interface Window {
    frost: {
      app: {
        getInfo(): Promise<AppInfo>;
        minimize(): void;
        maximize(): void;
        close(): void;
        confirmClose(): void;
        cancelClose(): void;
        onBeforeClose(callback: () => void): () => void;
      };
      workspace: {
        get(): Promise<WorkspaceInfo | null>;
        choose(): Promise<WorkspaceInfo | null>;
        readDirectory(directoryPath: string): Promise<FileEntry[]>;
        readFile(filePath: string): Promise<string>;
        writeFile(
          filePath: string,
          content: string
        ): Promise<{ path: string }>;
        createFile(
          parentPath: string,
          name: string,
          content?: string
        ): Promise<FileEntry>;
        createDirectory(
          parentPath: string,
          name: string
        ): Promise<FileEntry>;
        rename(
          targetPath: string,
          name: string
        ): Promise<{ oldPath: string; path: string; name: string }>;
        delete(targetPath: string): Promise<{ path: string }>;
      };
      pdf: {
        choose(): Promise<OpenPdf | null>;
        read(filePath: string): Promise<OpenPdf & { data: ArrayBuffer }>;
      };
      settings: {
        get(): Promise<IDEPreferences>;
        chooseDefaultWorkspace(): Promise<IDEPreferences | null>;
        useCurrentWorkspace(): Promise<IDEPreferences>;
        clearDefaultWorkspace(): Promise<IDEPreferences>;
      };
      terminal: {
        create(options: {
          type: "run" | "repl";
          filePath?: string;
          cwd?: string;
          label?: string;
          cols?: number;
          rows?: number;
        }): Promise<TerminalSession>;
        write(id: string, data: string): void;
        resize(id: string, cols: number, rows: number): void;
        kill(id: string): Promise<boolean>;
        onData(
          callback: (payload: { id: string; data: string }) => void
        ): () => void;
        onExit(
          callback: (payload: {
            id: string;
            exitCode: number;
            signal?: number;
          }) => void
        ): () => void;
      };
      packages: {
        list(): Promise<PackageInventory>;
        search(query: string): Promise<PackageSearchResult[]>;
        install(spec: string): Promise<{ success: boolean }>;
        uninstall(name: string): Promise<{ success: boolean }>;
        onProgress(callback: (payload: PackageProgress) => void): () => void;
      };
      lsp: {
        start(workspacePath: string): Promise<unknown>;
        stop(): Promise<void>;
        restart(workspacePath: string): Promise<unknown>;
        request<T = unknown>(method: string, params: unknown): Promise<T>;
        notify(method: string, params: unknown): void;
        onNotification(callback: (payload: LspNotification) => void): () => void;
        onStatus(callback: (payload: LspStatus) => void): () => void;
      };
    };
  }
}

export {};
