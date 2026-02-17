import { NavLink, Route, Routes } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { dayScore } from "./core/rules";
import { loadTasks, saveTasks, type StoredDailyTask } from "./core/storage";
import {
  loadFlows,
  getActiveRun,
  startRun,
  updateRun,
  endRun,
  type EmergencyFlow,
  type EmergencyRun,
} from "./core/emergency";

import {
  loadTemplates,
  saveTemplates,
  deriveTemplatesForToday,
  loadDaily,
  saveDaily,
  type TemplateTask,
  type DailyTask as DailyTaskV2,
} from "./core/templates";

type TaskType = "check" | "number";

type DailyTask = {
  id: string;
  title: string;
  type: TaskType;
  target: number | null;
  actual: number;
  completed: boolean;
  is_deleted: boolean;

  // v2字段（用于模板派生/去重）
  date?: string;
  source_template_id?: string | null;
};

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** 兼容迁移：把旧的 daily tasks（无 date/source_template_id）迁移为今日手动任务 */
function migrateOldDailyIfNeeded() {
  // 旧版本存在 KEY=life_ops_v01_daily_tasks（storage.ts）
  const old = loadTasks() as any as DailyTask[];
  const hasOld = Array.isArray(old) && old.length > 0;

  // 新版本用 templates.ts 的 loadDaily/saveDaily（同KEY，但结构不同）
  const current = loadDaily();
  const alreadyMigrated = current.some((t) => !t.source_template_id && t.date);

  if (!hasOld) return;
  if (alreadyMigrated) return;

  const date = todayYMD();
  const migrated: DailyTaskV2[] = old.map((t) => ({
    id: t.id || uid(),
    title: t.title ?? "任务",
    type: t.type ?? "check",
    target: t.target ?? null,
    actual: Number(t.actual ?? 0),
    completed: !!t.completed,
    is_deleted: !!t.is_deleted,
    date,
    source_template_id: null,
  }));

  // 写入新结构
  saveDaily([...migrated, ...current]);

  // 清掉旧结构（避免未来重复迁移）
  saveTasks([] as StoredDailyTask[]);
}

function TodayPage() {
  const date = todayYMD();

  const [tasks, setTasks] = useState<DailyTaskV2[]>(() => {
    migrateOldDailyIfNeeded();
    // 先派生模板再读取
    deriveTemplatesForToday();
    return loadDaily();
  });

  // 只显示今天的任务
  const todayTasks = useMemo(
    () => tasks.filter((t) => t.date === date && !t.is_deleted),
    [tasks, date]
  );

  const score = useMemo(() => dayScore(todayTasks as any), [todayTasks]);

  function persistAll(next: DailyTaskV2[]) {
    setTasks(next);
    saveDaily(next);
  }

  function addTask(type: TaskType) {
    const t: DailyTaskV2 = {
      id: uid(),
      title: type === "check" ? "新勾选任务" : "新数值任务",
      type,
      target: type === "number" ? 1 : null,
      actual: 0,
      completed: false,
      is_deleted: false,
      date,
      source_template_id: null,
    };
    persistAll([t, ...tasks]);
  }

  function update(id: string, patch: Partial<DailyTaskV2>) {
    persistAll(tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function remove(id: string) {
    update(id, { is_deleted: true });
  }

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>今日任务（{date}）</h2>

      <div style={{ marginBottom: 16, color: "#333" }}>
        执行率（允许 &gt; 1）：<b>{Number.isFinite(score) ? score.toFixed(3) : "—"}</b>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <button onClick={() => addTask("check")}>+ 勾选任务</button>
        <button onClick={() => addTask("number")}>+ 数值任务</button>
      </div>

      {todayTasks.length === 0 ? (
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
          今日没有任务，根据规则执行率为 <b>1</b>。
        </div>
      ) : (
        todayTasks.map((t) => (
          <div
            key={t.id}
            style={{
              border: "1px solid #ccc",
              padding: 12,
              borderRadius: 10,
              marginBottom: 10,
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                value={t.title}
                onChange={(e) => update(t.id, { title: e.target.value })}
                style={{ fontSize: 16, width: "100%", padding: 6 }}
              />
              <button onClick={() => remove(t.id)}>删除</button>
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              {t.source_template_id ? (
                <span style={{ color: "#777" }}>来自模板</span>
              ) : (
                <span style={{ color: "#777" }}>手动任务</span>
              )}

              {t.type === "number" && t.target !== null ? (
                <>
                  <label>
                    target：
                    <input
                      type="number"
                      value={t.target}
                      onChange={(e) => {
                        const v = e.target.value === "" ? null : Number(e.target.value);
                        update(t.id, { target: v });
                      }}
                      style={{ marginLeft: 6, width: 110 }}
                    />
                  </label>

                  <label>
                    actual：
                    <input
                      type="number"
                      value={t.actual}
                      onChange={(e) => update(t.id, { actual: Number(e.target.value) })}
                      style={{ marginLeft: 6, width: 120 }}
                    />
                  </label>

                  <span style={{ color: "#555" }}>
                    完成度：<b>{t.target && t.target > 0 ? (t.actual / t.target).toFixed(3) : (t.completed ? "1" : "0")}</b>
                  </span>

                  {t.target === null ? <span style={{ color: "#777" }}>（未填写 target，按勾选处理）</span> : null}
                </>
              ) : (
                <>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={t.completed}
                      onChange={(e) => update(t.id, { completed: e.target.checked })}
                    />
                    完成
                  </label>
                  <span style={{ color: "#555" }}>
                    完成度：<b>{t.completed ? "1" : "0"}</b>
                  </span>
                </>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateTask[]>(() => loadTemplates());

  function persist(next: TemplateTask[]) {
    setTemplates(next);
    saveTemplates(next);
  }

  function add(type: TaskType) {
    const t: TemplateTask = {
      id: `tpl_${uid()}`,
      title: type === "check" ? "每日模板（勾选）" : "每日模板（数值）",
      type,
      target: type === "number" ? 1 : null,
      unit: null,
      is_active: true,
    };
    persist([t, ...templates]);
  }

  function update(id: string, patch: Partial<TemplateTask>) {
    persist(templates.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>模板</h2>
      <div style={{ color: "#555", marginBottom: 16 }}>
        模板会每天自动派生到“今日任务”（按 日期+模板id 去重）。
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <button onClick={() => add("check")}>+ 勾选模板</button>
        <button onClick={() => add("number")}>+ 数值模板</button>
      </div>

      {templates.length === 0 ? (
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 10 }}>
          还没有模板。创建后明天（或刷新今日页面派生逻辑）会自动生成今日实例。
        </div>
      ) : (
        templates.map((t) => (
          <div
            key={t.id}
            style={{
              border: "1px solid #ccc",
              padding: 12,
              borderRadius: 10,
              marginBottom: 10,
            }}
          >
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                value={t.title}
                onChange={(e) => update(t.id, { title: e.target.value })}
                style={{ fontSize: 16, width: "100%", padding: 6 }}
              />
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={t.is_active}
                  onChange={(e) => update(t.id, { is_active: e.target.checked })}
                />
                启用
              </label>
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ color: "#555" }}>
                类型：<b>{t.type === "check" ? "勾选" : "数值"}</b>
              </span>

              <label>
                target：
                <input
                  type="number"
                  value={t.target ?? ""}
                  placeholder="可空"
                  onChange={(e) => {
                    const v = e.target.value === "" ? null : Number(e.target.value);
                    update(t.id, { target: v });
                  }}
                  style={{ marginLeft: 6, width: 110 }}
                />
              </label>

              <label>
                单位：
                <input
                  value={t.unit ?? ""}
                  placeholder="可空"
                  onChange={(e) => update(t.id, { unit: e.target.value || null })}
                  style={{ marginLeft: 6, width: 130 }}
                />
              </label>

              {t.target === null ? <span style={{ color: "#777" }}>target 为空时：派生按勾选处理</span> : null}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function EmergencyPage() {
  const [flows, setFlows] = useState<EmergencyFlow[]>(() => loadFlows());
  const [selectedFlowId, setSelectedFlowId] = useState<string>(flows[0]?.id ?? "flow_qrh_basic");
  const [activeRun, setActiveRun] = useState<EmergencyRun | null>(() => getActiveRun());

  const flow = useMemo(
    () => flows.find((f) => f.id === (activeRun?.flow_id ?? selectedFlowId)) ?? null,
    [flows, activeRun, selectedFlowId]
  );

  function begin() {
    if (!flow) return;
    const run = startRun(flow);
    setActiveRun(run);
    setSelectedFlowId(flow.id);
  }

  function toggleStep(stepId: string, done: boolean) {
    if (!activeRun) return;
    const next: EmergencyRun = {
      ...activeRun,
      step_states: {
        ...activeRun.step_states,
        [stepId]: { ...(activeRun.step_states[stepId] ?? { done: false }), done },
      },
    };
    updateRun(next);
    setActiveRun(next);
  }

  function noteStep(stepId: string, note: string) {
    if (!activeRun) return;
    const next: EmergencyRun = {
      ...activeRun,
      step_states: {
        ...activeRun.step_states,
        [stepId]: { ...(activeRun.step_states[stepId] ?? { done: false }), note },
      },
    };
    updateRun(next);
    setActiveRun(next);
  }

  function finish() {
    if (!activeRun) return;
    const ended = endRun(activeRun);
    setActiveRun(null);
    alert("已结束本次紧急流程。");
  }

  const progress = useMemo(() => {
    if (!flow || !activeRun) return null;
    const total = flow.steps.length;
    const done = flow.steps.filter((s) => activeRun.step_states[s.id]?.done).length;
    return { done, total };
  }, [flow, activeRun]);

  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>紧急（QRH）</h2>
      <div style={{ color: "#555", marginBottom: 12 }}>
        用于“紧急清空/止损”的步骤化流程：可中断、刷新后可恢复。
      </div>

      <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <label>
            流程：
            <select
              style={{ marginLeft: 8, padding: 6 }}
              value={activeRun?.flow_id ?? selectedFlowId}
              disabled={!!activeRun}
              onChange={(e) => setSelectedFlowId(e.target.value)}
            >
              {flows.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
          </label>

          {!activeRun ? (
            <button onClick={begin} disabled={!flow}>
              开始流程
            </button>
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ color: "#444" }}>
                进度：<b>{progress?.done ?? 0}/{progress?.total ?? 0}</b>
              </span>
              <button onClick={finish}>结束流程</button>
            </div>
          )}
        </div>

        {flow ? (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {flow.steps.map((s, idx) => {
              const state = activeRun?.step_states[s.id];
              return (
                <div key={s.id} style={{ padding: 10, border: "1px solid #eee", borderRadius: 10 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <input
                      type="checkbox"
                      disabled={!activeRun}
                      checked={!!state?.done}
                      onChange={(e) => toggleStep(s.id, e.target.checked)}
                      style={{ marginTop: 4 }}
                    />
                    <div style={{ width: "100%" }}>
                      <div style={{ fontWeight: 600 }}>
                        Step {idx + 1}: {s.text}
                      </div>
                      {s.caution ? (
                        <div style={{ marginTop: 6, color: "#7a4" }}>
                          注意：{s.caution}
                        </div>
                      ) : null}

                      <textarea
                        disabled={!activeRun}
                        value={state?.note ?? ""}
                        placeholder="备注（可空）"
                        onChange={(e) => noteStep(s.id, e.target.value)}
                        style={{ width: "100%", minHeight: 60, padding: 8, marginTop: 10 }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ marginTop: 12, color: "#777" }}>没有可用流程。</div>
        )}
      </div>
    </div>
  );
}

function Placeholder({ title }: { title: string }) {
  return (
    <div style={{ padding: 40 }}>
      <h2>{title}</h2>
      <p>这里将会是 {title} 页面内容。</p>
    </div>
  );
}

const linkStyle = ({ isActive }: { isActive: boolean }) => ({
  padding: "8px 12px",
  borderRadius: 8,
  textDecoration: "none",
  color: isActive ? "white" : "#111",
  background: isActive ? "#111" : "transparent",
});

export default function App() {
  // 进站时做一次迁移（仅一次）
  useEffect(() => {
    migrateOldDailyIfNeeded();
  }, []);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: 16 }}>
      <header style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <NavLink to="/" style={linkStyle} end>
          今日
        </NavLink>
        <NavLink to="/templates" style={linkStyle}>
          模板
        </NavLink>
        <NavLink to="/emergency" style={linkStyle}>
          紧急 QRH
        </NavLink>
      </header>

      <Routes>
        <Route path="/" element={<TodayPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/emergency" element={<EmergencyPage />} />
      </Routes>
    </div>
  );
}
