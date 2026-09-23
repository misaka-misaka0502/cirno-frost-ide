import {
  RefreshCw,
  TerminalSquare,
  X
} from "lucide-react";
import { terminalBus } from "../lib/terminalBus";
import { useIDEStore } from "../store/useIDEStore";
import type { TerminalSession } from "../types";
import { TerminalSurface } from "./TerminalSurface";

interface ReplWorkspaceProps {
  onCreate: () => Promise<TerminalSession | null>;
}

export function ReplWorkspace({ onCreate }: ReplWorkspaceProps) {
  const sessions = useIDEStore((state) => state.replSessions);
  const removeRepl = useIDEStore((state) => state.removeRepl);

  const closeSession = async (id: string) => {
    const session = sessions.find((item) => item.id === id);
    if (session?.state === "running") {
      await window.frost.terminal.kill(id);
    }
    removeRepl(id);
    terminalBus.forget(id);
  };

  const restartSession = async (id: string) => {
    await closeSession(id);
    await onCreate();
  };

  return (
    <section className="repl-workspace">
      <div className="repl-heading">
        <div>
          <span className="panel-eyebrow">INTERACTIVE LAB</span>
          <h2>Python 交互实验室</h2>
          <p>每个窗口都有独立进程、独立变量和独立输入输出。</p>
        </div>
      </div>

      <div className="repl-grid">
        {sessions.map((session, index) => (
          <article className="repl-card" key={session.id}>
            <header className="repl-card-header">
              <div className="repl-card-title">
                <span className="repl-number">{index + 1}</span>
                <TerminalSquare size={15} />
                <span>{session.label}</span>
                <span className={`session-dot ${session.state}`} />
              </div>
              <div className="repl-card-actions">
                <button
                  className="icon-button ghost tiny"
                  onClick={() => void restartSession(session.id)}
                  title="重启这个交互环境"
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  className="icon-button ghost tiny"
                  onClick={() => void closeSession(session.id)}
                  title="关闭这个交互环境"
                >
                  <X size={15} />
                </button>
              </div>
            </header>
            <div className="repl-terminal">
              <TerminalSurface sessionId={session.id} fontSize={13} />
              {session.state === "exited" && (
                <div className="repl-ended">
                  这个环境已经结束
                  <button onClick={() => void restartSession(session.id)}>
                    重新启动
                  </button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
