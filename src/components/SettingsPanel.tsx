import {
  CheckCircle2,
  FolderOpen,
  RotateCcw,
  Save,
  Settings2
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useIDEStore } from "../store/useIDEStore";
import type { IDEPreferences } from "../types";

export function SettingsPanel() {
  const workspace = useIDEStore((state) => state.workspace);
  const pushToast = useIDEStore((state) => state.pushToast);
  const [preferences, setPreferences] = useState<IDEPreferences>({
    defaultWorkspacePath: ""
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setPreferences(await window.frost.settings.get());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const chooseDefault = async () => {
    setBusy(true);
    try {
      const next = await window.frost.settings.chooseDefaultWorkspace();
      if (next) {
        setPreferences(next);
        pushToast({
          tone: "success",
          title: "默认工作区已更新",
          detail: "下次打开 Frost IDE 时会自动打开这个文件夹。"
        });
      }
    } catch (error) {
      pushToast({
        tone: "error",
        title: "无法设置默认工作区",
        detail: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setBusy(false);
    }
  };

  const useCurrent = async () => {
    setBusy(true);
    try {
      const next = await window.frost.settings.useCurrentWorkspace();
      setPreferences(next);
      pushToast({
        tone: "success",
        title: "当前文件夹已设为默认工作区"
      });
    } catch (error) {
      pushToast({
        tone: "error",
        title: "无法设置默认工作区",
        detail: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setBusy(false);
    }
  };

  const clearDefault = async () => {
    setBusy(true);
    try {
      const next = await window.frost.settings.clearDefaultWorkspace();
      setPreferences(next);
      pushToast({
        tone: "success",
        title: "已清除默认工作区",
        detail: "下次启动时将回到未打开文件夹的状态。"
      });
    } catch (error) {
      pushToast({
        tone: "error",
        title: "无法清除默认工作区",
        detail: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="settings-panel">
      <div className="settings-hero">
        <span className="settings-hero-icon">
          <Settings2 size={22} />
        </span>
        <div>
          <span className="panel-eyebrow">FROST IDE SETTINGS</span>
          <h1>设置</h1>
          <p>调整启动工作区与本地编辑体验。</p>
        </div>
      </div>

      <div className="settings-content">
        <section className="settings-section">
          <div className="settings-section-heading">
            <div>
              <h2>默认工作区</h2>
              <p>设置后，每次启动 Frost IDE 都会自动打开这个文件夹。</p>
            </div>
            {preferences.defaultWorkspacePath && (
              <span className="settings-enabled">
                <CheckCircle2 size={13} />
                已启用
              </span>
            )}
          </div>

          <div className="workspace-setting-card">
            <span className="workspace-setting-icon">
              <FolderOpen size={22} />
            </span>
            <div className="workspace-setting-copy">
              <span>当前默认文件夹</span>
              <strong title={preferences.defaultWorkspacePath}>
                {preferences.defaultWorkspacePath || "未设置"}
              </strong>
              <small>
                {workspace
                  ? `当前工作区：${workspace.path}`
                  : "当前没有打开工作区"}
              </small>
            </div>
          </div>

          <div className="settings-actions">
            <button
              className="button primary"
              onClick={() => void chooseDefault()}
              disabled={busy}
            >
              <FolderOpen size={15} />
              选择默认文件夹
            </button>
            <button
              className="button secondary"
              onClick={() => void useCurrent()}
              disabled={busy || !workspace}
            >
              <Save size={15} />
              使用当前工作区
            </button>
            <button
              className="button ghost-action"
              onClick={() => void clearDefault()}
              disabled={busy || !preferences.defaultWorkspacePath}
            >
              <RotateCcw size={14} />
              清除设置
            </button>
          </div>
        </section>

        <section className="settings-section compact">
          <div className="settings-section-heading">
            <div>
              <h2>自动保存</h2>
              <p>每 20 秒保存所有已打开且发生修改的文件，过程不会弹出提示。</p>
            </div>
            <span className="settings-enabled">
              <CheckCircle2 size={13} />
              始终开启
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}
