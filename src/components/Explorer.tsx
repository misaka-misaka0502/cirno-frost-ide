import {
  ChevronDown,
  ChevronRight,
  File,
  FileCode2,
  FileJson,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
  X
} from "lucide-react";
import {
  MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { dirname } from "../lib/paths";
import { frostLanguageService } from "../lib/lsp";
import { useIDEStore } from "../store/useIDEStore";
import type {
  FileEntry,
  OpenDocument,
  WorkspaceInfo
} from "../types";
import { ConfirmDialog, InputDialog } from "./InputDialog";

interface ExplorerProps {
  onWorkspaceChange: (workspace: WorkspaceInfo) => void;
  onCreateFile: (parentPath?: string) => Promise<string | null>;
  onCommitUntitled: (path: string) => Promise<boolean>;
}

type DialogState =
  | { type: "new-folder"; parentPath: string }
  | { type: "rename"; entry: FileEntry }
  | null;

function comparablePath(value: string) {
  return value.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
}

function draftsInDirectory(
  documents: OpenDocument[],
  directoryPath: string
) {
  const directory = comparablePath(directoryPath);
  return documents.filter(
    (document) =>
      document.isUntitled &&
      document.parentPath &&
      comparablePath(document.parentPath) === directory
  );
}

interface PendingFileRowProps {
  document: OpenDocument;
  depth: number;
  selected: boolean;
  onActivate: (path: string) => void;
  onNameChange: (path: string, name: string) => void;
  onCommit: (path: string) => Promise<boolean>;
  onCancel: (path: string) => void;
}

function PendingFileRow({
  document,
  depth,
  selected,
  onActivate,
  onNameChange,
  onCommit,
  onCancel
}: PendingFileRowProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);
  const [busy, setBusy] = useState(false);
  const draftName = document.draftName ?? "";
  const suffix = /\.py$/i.test(draftName)
    ? ""
    : draftName.endsWith(".")
      ? "py"
      : ".py";

  const focusAndSelect = useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  useEffect(() => {
    focusAndSelect();
  }, [focusAndSelect]);

  const commit = async () => {
    if (cancelled.current || busy) {
      return;
    }
    setBusy(true);
    const saved = await onCommit(document.path);
    if (!saved) {
      setBusy(false);
      focusAndSelect();
    }
  };

  return (
    <div
      className={`tree-row pending-file-row ${selected ? "selected" : ""}`}
      style={{ paddingLeft: 9 + depth * 14 }}
      onMouseDown={() => onActivate(document.path)}
      title="输入文件名，按 Enter 创建 Python 文件"
    >
      <span className="tree-chevron" />
      <FileCode2 size={15} className="file-icon python" />
      <div className="tree-inline-name">
        <input
          ref={inputRef}
          value={draftName}
          aria-label="新建 Python 文件名"
          spellCheck={false}
          disabled={busy}
          onChange={(event) =>
            onNameChange(document.path, event.target.value)
          }
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.preventDefault();
              void commit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancelled.current = true;
              onCancel(document.path);
            }
          }}
        />
        {suffix && <span>{suffix}</span>}
      </div>
      <button
        className="pending-file-cancel"
        type="button"
        title="取消新建文件"
        aria-label="取消新建文件"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          cancelled.current = true;
          onCancel(document.path);
        }}
      >
        <X size={13} />
      </button>
    </div>
  );
}

function iconForFile(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "py" || extension === "pyw") {
    return <FileCode2 size={15} className="file-icon python" />;
  }
  if (extension === "json") {
    return <FileJson size={15} className="file-icon json" />;
  }
  if (extension === "pdf") {
    return <FileText size={15} className="file-icon pdf" />;
  }
  return <File size={15} className="file-icon generic" />;
}

interface TreeNodeProps {
  entry: FileEntry;
  depth: number;
  selectedPath: string | null;
  onSelect: (entry: FileEntry) => void;
  onOpen: (entry: FileEntry) => void;
  onContextMenu: (event: MouseEvent, entry: FileEntry) => void;
  onRename: (entry: FileEntry, name: string) => Promise<boolean>;
  onDelete: (entry: FileEntry) => void;
  documents: OpenDocument[];
  activeDocumentPath: string | null;
  onActivateDraft: (path: string) => void;
  onDraftNameChange: (path: string, name: string) => void;
  onCommitDraft: (path: string) => Promise<boolean>;
  onCancelDraft: (path: string) => void;
}

function TreeNode({
  entry,
  depth,
  selectedPath,
  onSelect,
  onOpen,
  onContextMenu,
  onRename,
  onDelete,
  documents,
  activeDocumentPath,
  onActivateDraft,
  onDraftNameChange,
  onCommitDraft,
  onCancelDraft
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(entry.name);
  const [renameBusy, setRenameBusy] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const pendingChildren = useMemo(
    () => draftsInDirectory(documents, entry.path),
    [documents, entry.path]
  );

  useEffect(() => {
    if (pendingChildren.length > 0 && entry.isDirectory) {
      setExpanded(true);
    }
  }, [entry.isDirectory, pendingChildren.length]);

  useEffect(() => {
    if (!renaming) {
      return;
    }
    requestAnimationFrame(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  }, [renaming]);

  const toggle = async () => {
    if (!entry.isDirectory) {
      onOpen(entry);
      return;
    }
    onSelect(entry);
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (nextExpanded && children.length === 0) {
      setLoading(true);
      try {
        setChildren(await window.frost.workspace.readDirectory(entry.path));
      } finally {
        setLoading(false);
      }
    }
  };

  const beginRename = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setRenameValue(entry.name);
    setRenaming(true);
  };

  const commitRename = async () => {
    const nextName = renameValue.trim();
    if (!nextName || renameBusy) {
      return;
    }
    setRenameBusy(true);
    const renamed = await onRename(entry, nextName);
    if (!renamed) {
      setRenameBusy(false);
      requestAnimationFrame(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      });
    }
  };

  return (
    <>
      <div
        className={`tree-row ${selectedPath === entry.path ? "selected" : ""}`}
        style={{ paddingLeft: 9 + depth * 14 }}
        onClick={() => {
          if (!renaming) {
            void toggle();
          }
        }}
        onContextMenu={(event) => onContextMenu(event, entry)}
        title={entry.path}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (!renaming && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            void toggle();
          }
        }}
      >
        <span className="tree-chevron">
          {entry.isDirectory &&
            (expanded ? (
              <ChevronDown size={13} />
            ) : (
              <ChevronRight size={13} />
            ))}
        </span>
        {entry.isDirectory ? (
          expanded ? (
            <FolderOpen size={15} className="file-icon folder" />
          ) : (
            <Folder size={15} className="file-icon folder" />
          )
        ) : (
          iconForFile(entry.name)
        )}
        {renaming ? (
          <input
            ref={renameInputRef}
            className="tree-rename-input"
            value={renameValue}
            disabled={renameBusy}
            aria-label={`重命名 ${entry.name}`}
            spellCheck={false}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setRenameValue(event.target.value)}
            onBlur={() => {
              if (!renameBusy) {
                setRenaming(false);
              }
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                void commitRename();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setRenaming(false);
              }
            }}
          />
        ) : (
          <span className="tree-label">{entry.name}</span>
        )}
        {loading && <span className="tree-loader" />}
        {!renaming && (
          <span className="tree-row-actions">
            <button
              type="button"
              title={`重命名 ${entry.name}`}
              aria-label={`重命名 ${entry.name}`}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={beginRename}
            >
              <Pencil size={12} />
            </button>
            <button
              type="button"
              className="danger"
              title={`删除 ${entry.name}`}
              aria-label={`删除 ${entry.name}`}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onDelete(entry);
              }}
            >
              <Trash2 size={12} />
            </button>
          </span>
        )}
      </div>
      {entry.isDirectory &&
        expanded &&
        children.map((child) => (
          <TreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onOpen={onOpen}
            onContextMenu={onContextMenu}
            onRename={onRename}
            onDelete={onDelete}
            documents={documents}
            activeDocumentPath={activeDocumentPath}
            onActivateDraft={onActivateDraft}
            onDraftNameChange={onDraftNameChange}
            onCommitDraft={onCommitDraft}
            onCancelDraft={onCancelDraft}
          />
        ))}
      {entry.isDirectory &&
        expanded &&
        pendingChildren.map((document) => (
          <PendingFileRow
            key={document.path}
            document={document}
            depth={depth + 1}
            selected={document.path === activeDocumentPath}
            onActivate={onActivateDraft}
            onNameChange={onDraftNameChange}
            onCommit={onCommitDraft}
            onCancel={onCancelDraft}
          />
        ))}
      {entry.isDirectory &&
        expanded &&
        !loading &&
        children.length === 0 &&
        pendingChildren.length === 0 && (
        <div
          className="tree-empty"
          style={{ paddingLeft: 34 + depth * 14 }}
        >
          空文件夹
        </div>
      )}
    </>
  );
}

export function Explorer({
  onWorkspaceChange,
  onCreateFile,
  onCommitUntitled
}: ExplorerProps) {
  const workspace = useIDEStore((state) => state.workspace);
  const explorerRevision = useIDEStore((state) => state.explorerRevision);
  const documents = useIDEStore((state) => state.documents);
  const openDocument = useIDEStore((state) => state.openDocument);
  const openPdf = useIDEStore((state) => state.openPdf);
  const activeDocumentPath = useIDEStore(
    (state) => state.activeDocumentPath
  );
  const activateDocument = useIDEStore(
    (state) => state.activateDocument
  );
  const renameUntitledDocument = useIDEStore(
    (state) => state.renameUntitledDocument
  );
  const closeDocument = useIDEStore((state) => state.closeDocument);
  const renameDocumentPath = useIDEStore(
    (state) => state.renameDocumentPath
  );
  const removeDocumentsUnder = useIDEStore(
    (state) => state.removeDocumentsUnder
  );
  const renamePdfPath = useIDEStore((state) => state.renamePdfPath);
  const closePdfUnder = useIDEStore((state) => state.closePdfUnder);
  const refreshExplorer = useIDEStore((state) => state.refreshExplorer);
  const pushToast = useIDEStore((state) => state.pushToast);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState<FileEntry | null>(null);
  const [loading, setLoading] = useState(Boolean(workspace));
  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleteTarget, setDeleteTarget] = useState<FileEntry | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    entry: FileEntry;
  } | null>(null);

  const loadRoot = useCallback(async () => {
    if (!workspace) {
      setEntries([]);
      setSelected(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setEntries(await window.frost.workspace.readDirectory(workspace.path));
    } catch (error) {
      pushToast({
        tone: "error",
        title: "无法读取工作区",
        detail: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setLoading(false);
    }
  }, [pushToast, workspace]);

  useEffect(() => {
    void loadRoot();
  }, [explorerRevision, loadRoot]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, []);

  const openEntry = async (entry: FileEntry) => {
    setSelected(entry);
    if (entry.isDirectory) {
      return;
    }
    if (entry.name.toLowerCase().endsWith(".pdf")) {
      openPdf({ path: entry.path, name: entry.name });
      return;
    }
    try {
      const content = await window.frost.workspace.readFile(entry.path);
      openDocument(entry.path, content);
    } catch (error) {
      pushToast({
        tone: "error",
        title: `无法打开 ${entry.name}`,
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const selectedParent = useMemo(() => {
    if (!workspace) {
      return "";
    }
    if (!selected) {
      return workspace.path;
    }
    return selected.isDirectory ? selected.path : dirname(selected.path);
  }, [selected, workspace]);

  const rootDrafts = useMemo(
    () => (workspace ? draftsInDirectory(documents, workspace.path) : []),
    [documents, workspace]
  );

  const createFolder = async (name: string) => {
    if (!dialog || dialog.type !== "new-folder") {
      return;
    }
    try {
      const result = await window.frost.workspace.createDirectory(
        dialog.parentPath,
        name
      );
      setDialog(null);
      refreshExplorer();
      pushToast({
        tone: "success",
        title: `已创建文件夹 ${result.name}`
      });
    } catch (error) {
      pushToast({
        tone: "error",
        title: "创建失败",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const renameEntry = async (entry: FileEntry, name: string) => {
    const oldPath = entry.path;
    try {
      const affectedDocuments = documents.filter(
        (document) =>
          document.path === oldPath ||
          document.path.startsWith(`${oldPath}\\`) ||
          document.path.startsWith(`${oldPath}/`)
      );
      for (const document of affectedDocuments) {
        frostLanguageService.closeDocument(document.uri);
      }
      const result = await window.frost.workspace.rename(oldPath, name);
      renameDocumentPath(result.oldPath, result.path);
      renamePdfPath(result.oldPath, result.path);
      setSelected({
        ...entry,
        path: result.path,
        name: result.name
      });
      refreshExplorer();
      pushToast({
        tone: "success",
        title: `已重命名为 ${result.name}`
      });
      return true;
    } catch (error) {
      pushToast({
        tone: "error",
        title: "重命名失败",
        detail: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  };

  const renameItem = async (name: string) => {
    if (!dialog || dialog.type !== "rename") {
      return;
    }
    if (await renameEntry(dialog.entry, name)) {
      setDialog(null);
    }
  };

  const deleteItem = async () => {
    if (!deleteTarget) {
      return;
    }
    try {
      const affectedDocuments = documents.filter(
        (document) =>
          document.path === deleteTarget.path ||
          document.path.startsWith(`${deleteTarget.path}\\`) ||
          document.path.startsWith(`${deleteTarget.path}/`)
      );
      for (const document of affectedDocuments) {
        frostLanguageService.closeDocument(document.uri);
      }
      await window.frost.workspace.delete(deleteTarget.path);
      removeDocumentsUnder(deleteTarget.path);
      closePdfUnder(deleteTarget.path);
      setSelected(null);
      setDeleteTarget(null);
      refreshExplorer();
      pushToast({
        tone: "success",
        title: `${deleteTarget.name} 已移到回收站`
      });
    } catch (error) {
      pushToast({
        tone: "error",
        title: "删除失败",
        detail: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const showContextMenu = (event: MouseEvent, entry: FileEntry) => {
    event.preventDefault();
    event.stopPropagation();
    setSelected(entry);
    setContextMenu({
      x: Math.min(event.clientX, window.innerWidth - 190),
      y: Math.min(event.clientY, window.innerHeight - 210),
      entry
    });
  };

  const chooseWorkspace = async () => {
    const next = await window.frost.workspace.choose();
    if (next) {
      onWorkspaceChange(next);
    }
  };

  return (
    <aside className="side-panel explorer-panel">
      <div className="panel-heading">
        <div>
          <span className="panel-eyebrow">WORKSPACE</span>
          <h2>资源管理器</h2>
        </div>
        <button className="icon-button ghost" aria-label="更多">
          <MoreHorizontal size={17} />
        </button>
      </div>

      <div className="explorer-project-row">
        <button
          className="project-name"
          onClick={chooseWorkspace}
          title="切换项目文件夹"
        >
          <FolderOpen size={15} />
          <span>{workspace?.name ?? "未打开文件夹"}</span>
        </button>
        <div className="explorer-tools">
          {workspace && (
            <>
              <button
                className="icon-button ghost tiny"
                onClick={() => onCreateFile(selectedParent)}
                title="新建文件"
              >
                <FilePlus2 size={15} />
              </button>
              <button
                className="icon-button ghost tiny"
                onClick={() =>
                  setDialog({ type: "new-folder", parentPath: selectedParent })
                }
                title="新建文件夹"
              >
                <FolderPlus size={15} />
              </button>
              <button
                className="icon-button ghost tiny"
                onClick={refreshExplorer}
                title="刷新"
              >
                <RefreshCw size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      <div
        className="file-tree"
        key={`${workspace?.path}-${explorerRevision}`}
        onContextMenu={(event) => {
          event.preventDefault();
          if (workspace) {
            setContextMenu({
              x: Math.min(event.clientX, window.innerWidth - 190),
              y: Math.min(event.clientY, window.innerHeight - 210),
              entry: {
                name: workspace.name,
                path: workspace.path,
                isDirectory: true
              }
            });
          }
        }}
      >
        {!workspace ? (
          <div className="empty-sidebar no-workspace">
            <FolderOpen size={30} />
            <p>尚未打开工作区文件夹</p>
            <span>打开文件夹后，文件树会显示在这里。</span>
            <button onClick={chooseWorkspace}>打开文件夹</button>
          </div>
        ) : loading ? (
          <div className="sidebar-loading">
            <span className="spinner" />
            正在读取文件…
          </div>
        ) : entries.length || rootDrafts.length ? (
          <>
            {entries.map((entry) => (
              <TreeNode
                key={entry.path}
                entry={entry}
                depth={0}
                selectedPath={selected?.path ?? null}
                onSelect={setSelected}
                onOpen={openEntry}
                onContextMenu={showContextMenu}
                onRename={renameEntry}
                onDelete={setDeleteTarget}
                documents={documents}
                activeDocumentPath={activeDocumentPath}
                onActivateDraft={activateDocument}
                onDraftNameChange={renameUntitledDocument}
                onCommitDraft={onCommitUntitled}
                onCancelDraft={closeDocument}
              />
            ))}
            {rootDrafts.map((document) => (
              <PendingFileRow
                key={document.path}
                document={document}
                depth={0}
                selected={document.path === activeDocumentPath}
                onActivate={activateDocument}
                onNameChange={renameUntitledDocument}
                onCommit={onCommitUntitled}
                onCancel={closeDocument}
              />
            ))}
          </>
        ) : (
          <div className="empty-sidebar">
            <Folder size={28} />
            <p>这个文件夹还是空的</p>
            <button
              onClick={() => onCreateFile(workspace?.path)}
            >
              新建 Python 文件
            </button>
          </div>
        )}
      </div>

      <div className="explorer-footer">
        <span className="footer-dot" />
        {workspace ? "文件会保存在当前工作区" : "等待打开工作区"}
      </div>

      <InputDialog
        open={dialog?.type === "new-folder"}
        title="新建文件夹"
        label="文件夹名称"
        placeholder="例如 src"
        confirmLabel="创建文件夹"
        onConfirm={createFolder}
        onCancel={() => setDialog(null)}
      />
      <InputDialog
        open={dialog?.type === "rename"}
        title="重命名"
        label="新名称"
        initialValue={dialog?.type === "rename" ? dialog.entry.name : ""}
        confirmLabel="保存名称"
        onConfirm={renameItem}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`移除 ${deleteTarget?.name ?? ""}？`}
        detail="它会被移到系统回收站，需要时还能恢复。已打开但未保存的内容会丢失。"
        confirmLabel="移到回收站"
        danger
        onConfirm={deleteItem}
        onCancel={() => setDeleteTarget(null)}
      />

      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {contextMenu.entry.isDirectory && (
            <>
              <button
                onClick={() => {
                  onCreateFile(contextMenu.entry.path);
                  setContextMenu(null);
                }}
              >
                <FilePlus2 size={14} />
                新建文件
              </button>
              <button
                onClick={() => {
                  setDialog({
                    type: "new-folder",
                    parentPath: contextMenu.entry.path
                  });
                  setContextMenu(null);
                }}
              >
                <FolderPlus size={14} />
                新建文件夹
              </button>
              <span className="context-separator" />
            </>
          )}
          {contextMenu.entry.path !== workspace?.path && (
            <>
              <button
                onClick={() => {
                  setDialog({
                    type: "rename",
                    entry: contextMenu.entry
                  });
                  setContextMenu(null);
                }}
              >
                <Pencil size={14} />
                重命名
              </button>
              <button
                className="danger"
                onClick={() => {
                  setDeleteTarget(contextMenu.entry);
                  setContextMenu(null);
                }}
              >
                <Trash2 size={14} />
                移到回收站
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
