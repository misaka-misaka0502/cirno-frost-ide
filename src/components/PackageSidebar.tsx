import { Blocks, CheckCircle2, Cpu, ShieldCheck } from "lucide-react";
import { useIDEStore } from "../store/useIDEStore";

export function PackageSidebar() {
  const appInfo = useIDEStore((state) => state.appInfo);

  return (
    <aside className="side-panel package-sidebar">
      <div className="panel-heading">
        <div>
          <span className="panel-eyebrow">ENVIRONMENT</span>
          <h2>Python 环境</h2>
        </div>
        <Blocks size={18} className="heading-icon" />
      </div>
      <div className="environment-card">
        <div className="environment-icon">
          <Cpu size={20} />
        </div>
        <div>
          <span className="environment-label">项目解释器</span>
          <strong>Python {appInfo?.pythonVersion ?? "…"}</strong>
        </div>
        <CheckCircle2 size={16} className="environment-check" />
      </div>
      <div className="environment-path" title={appInfo?.pythonPath}>
        {appInfo?.pythonPath ?? "正在定位解释器…"}
      </div>
      <div className="package-side-copy">
        <ShieldCheck size={17} />
        <p>
          安装和卸载只会修改这一个项目的 Python，不会碰系统环境。
        </p>
      </div>
      <div className="package-tips">
        <span>包管理提示</span>
        <ul>
          <li>可以搜索 PyPI 中的任意包名</li>
          <li>支持指定版本，例如 requests==2.32.5</li>
          <li>安装后 Pyright 会读取新类型信息</li>
        </ul>
      </div>
    </aside>
  );
}

