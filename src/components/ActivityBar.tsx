import {
  Blocks,
  Files,
  Github,
  Settings2,
  Snowflake
} from "lucide-react";
import { useIDEStore } from "../store/useIDEStore";
import type { Activity } from "../types";

function ActivityButton({
  activity,
  label,
  icon: Icon
}: {
  activity: Activity;
  label: string;
  icon: typeof Files;
}) {
  const activeActivity = useIDEStore((state) => state.activity);
  const setActivity = useIDEStore((state) => state.setActivity);

  return (
    <button
      className={`activity-button ${
        activeActivity === activity ? "active" : ""
      }`}
      onClick={() => setActivity(activity)}
      aria-label={label}
      title={label}
    >
      <Icon size={21} strokeWidth={1.8} />
      <span className="activity-indicator" />
    </button>
  );
}

export function ActivityBar() {
  return (
    <aside className="activity-bar">
      <div className="activity-brand" title="Frost IDE">
        <Snowflake size={22} />
      </div>
      <div className="activity-primary">
        <ActivityButton
          activity="explorer"
          label="资源管理器"
          icon={Files}
        />
        <ActivityButton
          activity="packages"
          label="Python 包市场"
          icon={Blocks}
        />
        <ActivityButton
          activity="settings"
          label="设置"
          icon={Settings2}
        />
      </div>
      <div className="activity-secondary">
        <button
          className="activity-button muted"
          title="Frost IDE"
          aria-label="关于"
        >
          <Github size={19} />
        </button>
      </div>
    </aside>
  );
}
