import { Clock3, FolderCog, Save } from "lucide-react";

export function SettingsSidebar() {
  return (
    <aside className="side-panel settings-sidebar">
      <div className="panel-heading">
        <div>
          <span className="panel-eyebrow">PREFERENCES</span>
          <h2>设置</h2>
        </div>
        <FolderCog size={18} className="heading-icon" />
      </div>
      <div className="settings-nav-item active">
        <FolderCog size={16} />
        <div>
          <strong>工作区</strong>
          <span>启动时打开的默认文件夹</span>
        </div>
      </div>
      <div className="settings-info-card">
        <Save size={16} />
        <div>
          <strong>自动保存已开启</strong>
          <span>所有打开文件每 20 秒静默保存一次。</span>
        </div>
      </div>
      <div className="settings-info-card">
        <Clock3 size={16} />
        <div>
          <strong>关闭前保存</strong>
          <span>退出 Frost IDE 前会等待保存完成。</span>
        </div>
      </div>
    </aside>
  );
}
