import {
  Box,
  Check,
  Download,
  ExternalLink,
  Library,
  LoaderCircle,
  PackageCheck,
  RefreshCw,
  Search,
  Sparkles,
  TerminalSquare,
  Trash2,
  X
} from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { frostLanguageService } from "../lib/lsp";
import { useIDEStore } from "../store/useIDEStore";
import type {
  PackageInventory,
  PackageProgress,
  PackageSearchResult
} from "../types";

type PackageTab = "discover" | "installed" | "stdlib";

export function PackageManager() {
  const workspace = useIDEStore((state) => state.workspace);
  const pushToast = useIDEStore((state) => state.pushToast);
  const [inventory, setInventory] = useState<PackageInventory | null>(null);
  const [results, setResults] = useState<PackageSearchResult[]>([]);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<PackageTab>("discover");
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [searching, setSearching] = useState(true);
  const [busySpec, setBusySpec] = useState<string | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressTitle, setProgressTitle] = useState("包管理输出");
  const [progressText, setProgressText] = useState("");
  const progressRef = useRef<HTMLPreElement>(null);

  const installedMap = useMemo(
    () =>
      new Map(
        (inventory?.packages ?? []).map((item) => [
          item.name.toLowerCase(),
          item
        ])
      ),
    [inventory]
  );

  const loadInventory = useCallback(async () => {
    setLoadingInventory(true);
    try {
      setInventory(await window.frost.packages.list());
    } catch (error) {
      pushToast({
        tone: "error",
        title: "无法读取包列表",
        detail: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setLoadingInventory(false);
    }
  }, [pushToast]);

  const search = useCallback(
    async (searchQuery: string) => {
      setSearching(true);
      try {
        setResults(await window.frost.packages.search(searchQuery));
      } catch (error) {
        pushToast({
          tone: "error",
          title: "搜索失败",
          detail: error instanceof Error ? error.message : String(error)
        });
      } finally {
        setSearching(false);
      }
    },
    [pushToast]
  );

  useEffect(() => {
    void loadInventory();
    void search("");
  }, [loadInventory, search]);

  useEffect(
    () =>
      window.frost.packages.onProgress((progress: PackageProgress) => {
        setProgressOpen(true);
        setProgressTitle(
          progress.phase === "error"
            ? `${progress.spec} 安装失败`
            : `正在处理 ${progress.spec}`
        );
        setProgressText((current) => `${current}${progress.text}`);
        requestAnimationFrame(() => {
          if (progressRef.current) {
            progressRef.current.scrollTop =
              progressRef.current.scrollHeight;
          }
        });
      }),
    []
  );

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    void search(query.trim());
  };

  const refreshLanguageServer = async () => {
    if (!workspace) {
      return;
    }
    frostLanguageService.setReady(false);
    frostLanguageService.resetDocuments();
    await window.frost.lsp.restart(workspace.path);
  };

  const install = async (spec: string) => {
    if (busySpec) {
      return;
    }
    setBusySpec(spec);
    setProgressText("");
    setProgressOpen(true);
    setProgressTitle(`正在安装 ${spec}`);
    try {
      await window.frost.packages.install(spec);
      await loadInventory();
      await refreshLanguageServer();
      pushToast({
        tone: "success",
        title: `${spec} 安装完成`,
        detail: "智能补全已经读取新的库信息"
      });
    } catch (error) {
      pushToast({
        tone: "error",
        title: `${spec} 安装失败`,
        detail: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setBusySpec(null);
    }
  };

  const uninstall = async (name: string) => {
    if (
      busySpec ||
      !window.confirm(`确定从项目环境中卸载 ${name} 吗？`)
    ) {
      return;
    }
    setBusySpec(name);
    setProgressText("");
    setProgressOpen(true);
    setProgressTitle(`正在卸载 ${name}`);
    try {
      await window.frost.packages.uninstall(name);
      await loadInventory();
      await refreshLanguageServer();
      pushToast({
        tone: "success",
        title: `${name} 已卸载`
      });
    } catch (error) {
      pushToast({
        tone: "error",
        title: `${name} 卸载失败`,
        detail: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setBusySpec(null);
    }
  };

  return (
    <main className="package-manager">
      <div className="package-hero">
        <div className="package-hero-copy">
          <span className="package-hero-icon">
            <Sparkles size={20} />
          </span>
          <div>
            <span className="panel-eyebrow">PYTHON PACKAGE MARKET</span>
            <h1>给项目添加新能力</h1>
            <p>搜索 PyPI，安装结果只进入 Frost IDE 的独立 Python 环境。</p>
          </div>
        </div>
        <form className="package-search" onSubmit={submitSearch}>
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索包名，例如 requests 或 numpy"
            spellCheck={false}
          />
          {query && (
            <button
              type="button"
              className="search-clear"
              onClick={() => {
                setQuery("");
                void search("");
              }}
            >
              <X size={14} />
            </button>
          )}
          <button className="search-submit" type="submit">
            {searching ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              "搜索"
            )}
          </button>
        </form>
      </div>

      <div className="package-tabs">
        <button
          className={activeTab === "discover" ? "active" : ""}
          onClick={() => setActiveTab("discover")}
        >
          <Sparkles size={15} />
          发现
        </button>
        <button
          className={activeTab === "installed" ? "active" : ""}
          onClick={() => setActiveTab("installed")}
        >
          <PackageCheck size={15} />
          已安装
          <span>{inventory?.packages.length ?? "…"}</span>
        </button>
        <button
          className={activeTab === "stdlib" ? "active" : ""}
          onClick={() => setActiveTab("stdlib")}
        >
          <Library size={15} />
          标准库
          <span>{inventory?.stdlib.length ?? "…"}</span>
        </button>
        <button
          className="package-refresh"
          onClick={() => void loadInventory()}
          title="刷新环境"
        >
          <RefreshCw
            size={14}
            className={loadingInventory ? "spin" : ""}
          />
          刷新
        </button>
      </div>

      <div className="package-content">
        {activeTab === "discover" && (
          <>
            <div className="section-heading">
              <div>
                <h2>{query ? `“${query}” 的结果` : "适合开始探索的工具"}</h2>
                <p>
                  {query
                    ? "找不到精确资料也没关系，仍可按输入的包名直接安装。"
                    : "常用包已经摆在这里，也可以搜索 PyPI 中的任意名称。"}
                </p>
              </div>
              <span className="result-count">
                {searching ? "搜索中…" : `${results.length} 个结果`}
              </span>
            </div>
            {searching ? (
              <div className="package-loading-grid">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div className="package-skeleton" key={index} />
                ))}
              </div>
            ) : (
              <div className="package-grid">
                {results.map((item, index) => {
                  const installed = installedMap.get(
                    item.name.toLowerCase()
                  );
                  const isBusy = busySpec === item.name;
                  return (
                    <article
                      className={`package-card ${
                        item.exact ? "featured" : ""
                      }`}
                      key={`${item.name}-${index}`}
                    >
                      <div className="package-card-top">
                        <span className="package-logo">
                          {item.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="package-card-name">
                          <h3>{item.name}</h3>
                          <span>
                            {item.version
                              ? `v${item.version}`
                              : item.category ?? "PyPI"}
                          </span>
                        </div>
                        {item.exact && (
                          <span className="verified-badge">
                            <Check size={11} />
                            PyPI
                          </span>
                        )}
                      </div>
                      <p>{item.summary || "暂无简介"}</p>
                      <div className="package-meta">
                        {item.requiresPython && (
                          <span>Python {item.requiresPython}</span>
                        )}
                        {item.author && <span>{item.author}</span>}
                      </div>
                      <div className="package-card-actions">
                        {installed ? (
                          <button className="installed-button" disabled>
                            <Check size={14} />
                            已安装 {installed.version}
                          </button>
                        ) : (
                          <button
                            className="install-button"
                            onClick={() => void install(item.name)}
                            disabled={Boolean(busySpec)}
                          >
                            {isBusy ? (
                              <LoaderCircle size={14} className="spin" />
                            ) : (
                              <Download size={14} />
                            )}
                            {isBusy ? "安装中" : "安装"}
                          </button>
                        )}
                        {item.homepage && (
                          <span className="package-homepage" title="PyPI 项目">
                            <ExternalLink size={13} />
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}

        {activeTab === "installed" && (
          <>
            <div className="section-heading">
              <div>
                <h2>当前环境中的第三方包</h2>
                <p>这里的改动不会影响电脑上的其他 Python 项目。</p>
              </div>
              <span className="result-count">
                Python {inventory?.python ?? "…"}
              </span>
            </div>
            {loadingInventory ? (
              <div className="center-loading">
                <LoaderCircle size={20} className="spin" />
                正在读取环境…
              </div>
            ) : (
              <div className="installed-list">
                {(inventory?.packages ?? []).map((item) => {
                  const protectedPackage = item.name.toLowerCase() === "pip";
                  return (
                    <div className="installed-row" key={item.name}>
                      <span className="installed-icon">
                        <Box size={16} />
                      </span>
                      <div className="installed-copy">
                        <strong>{item.name}</strong>
                        <small>{item.summary || "Python 第三方包"}</small>
                      </div>
                      <code>{item.version}</code>
                      {protectedPackage ? (
                        <span className="core-package">环境工具</span>
                      ) : (
                        <button
                          className="uninstall-button"
                          onClick={() => void uninstall(item.name)}
                          disabled={Boolean(busySpec)}
                        >
                          {busySpec === item.name ? (
                            <LoaderCircle size={13} className="spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                          卸载
                        </button>
                      )}
                    </div>
                  );
                })}
                {!inventory?.packages.length && (
                  <div className="empty-packages">
                    <Box size={30} />
                    <strong>还没有第三方包</strong>
                    <span>到“发现”里装一个试试。</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {activeTab === "stdlib" && (
          <>
            <div className="section-heading">
              <div>
                <h2>Python 标准库</h2>
                <p>这些模块随解释器提供，不需要另外安装。</p>
              </div>
              <span className="result-count">
                {inventory?.stdlib.length ?? 0} 个模块
              </span>
            </div>
            <div className="stdlib-grid">
              {(inventory?.stdlib ?? []).map((name) => (
                <div className="stdlib-item" key={name}>
                  <Library size={13} />
                  <code>{name}</code>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <aside className={`package-progress ${progressOpen ? "open" : ""}`}>
        <header>
          <div>
            <TerminalSquare size={15} />
            <span>{progressTitle}</span>
          </div>
          <button
            className="icon-button ghost tiny"
            onClick={() => setProgressOpen(false)}
          >
            <X size={14} />
          </button>
        </header>
        <pre ref={progressRef}>
          {progressText || "等待 pip 输出…"}
        </pre>
      </aside>
    </main>
  );
}
