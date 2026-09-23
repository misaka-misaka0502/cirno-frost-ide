import {
  Blocks,
  FolderOpen,
  Keyboard,
  Play,
  Snowflake,
  TerminalSquare,
  WandSparkles
} from "lucide-react";

interface WelcomeProps {
  onOpenFolder: () => void;
  onCreateFile: () => void;
  onInteractive: () => void;
}

export function Welcome({
  onOpenFolder,
  onCreateFile,
  onInteractive
}: WelcomeProps) {
  return (
    <div className="welcome">
      <div className="welcome-glow" />
      <div className="welcome-content">
        <div className="welcome-mark">
          <Snowflake size={33} />
        </div>
        <span className="welcome-kicker">FOCUSED PYTHON WORKSPACE</span>
        <h1>写下想法，马上运行。</h1>
        <p className="welcome-lead">
          一个安静、轻巧的 Python 工作台。智能补全、交互终端和独立包环境都已经准备好了。
        </p>
        <div className="welcome-actions">
          <button className="button primary large" onClick={onCreateFile}>
            <WandSparkles size={17} />
            新建 Python 文件
          </button>
          <button className="button secondary large" onClick={onOpenFolder}>
            <FolderOpen size={17} />
            打开文件夹
          </button>
        </div>
        <div className="welcome-grid">
          <button className="welcome-feature" onClick={onInteractive}>
            <span className="feature-icon cyan">
              <TerminalSquare size={18} />
            </span>
            <span>
              <strong>交互实验</strong>
              <small>并排开启多个独立 REPL</small>
            </span>
          </button>
          <div className="welcome-feature">
            <span className="feature-icon violet">
              <Blocks size={18} />
            </span>
            <span>
              <strong>隔离环境</strong>
              <small>放心安装和移除第三方库</small>
            </span>
          </div>
          <div className="welcome-feature">
            <span className="feature-icon green">
              <Play size={18} />
            </span>
            <span>
              <strong>即时运行</strong>
              <small>输入与输出都留在窗口下方</small>
            </span>
          </div>
          <div className="welcome-feature">
            <span className="feature-icon amber">
              <Keyboard size={18} />
            </span>
            <span>
              <strong>快捷操作</strong>
              <small>Ctrl+S 保存，Ctrl+F 查找，F5 运行</small>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
