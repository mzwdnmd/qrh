const FLOW_KEY = "life_ops_v01_emergency_flows";
const RUN_KEY = "life_ops_v01_emergency_runs";

export type EmergencyStep = {
  id: string;
  text: string;
  caution?: string | null;
};

export type EmergencyFlow = {
  id: string;
  title: string;
  steps: EmergencyStep[];
};

export type EmergencyRun = {
  id: string;
  flow_id: string;
  started_at: string;
  ended_at: string | null;
  step_states: Record<string, { done: boolean; note?: string }>;
};

function nowISO() {
  return new Date().toISOString();
}

function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function ensureDefaultFlows() {
  const raw = localStorage.getItem(FLOW_KEY);
  if (raw) return;

  const flows: EmergencyFlow[] = [
    {
      id: "flow_qrh_basic",
      title: "紧急清空（QRH）- 基础流程",
      steps: [
        { id: "s1", text: "停止当前非必要任务，进入“只做止损”模式" },
        { id: "s2", text: "身体检查：喝水/进食/呼吸/疼痛（必要时求助）", caution: "如有急性危险症状，优先求助医疗/紧急联系人" },
        { id: "s3", text: "清空输入：写下所有让我焦虑的事项（不评判）" },
        { id: "s4", text: "只选 1 个最关键的下一步，写成 ≤10 分钟动作" },
        { id: "s5", text: "执行该动作，并记录结果" },
        { id: "s6", text: "决定：继续下一步 or 切回日常流程" },
      ],
    },
  ];

  localStorage.setItem(FLOW_KEY, JSON.stringify(flows));
}

export function loadFlows(): EmergencyFlow[] {
  ensureDefaultFlows();
  const raw = localStorage.getItem(FLOW_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as EmergencyFlow[]) : [];
  } catch {
    return [];
  }
}

export function loadRuns(): EmergencyRun[] {
  const raw = localStorage.getItem(RUN_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as EmergencyRun[]) : [];
  } catch {
    return [];
  }
}

export function saveRuns(runs: EmergencyRun[]) {
  localStorage.setItem(RUN_KEY, JSON.stringify(runs));
}

export function getActiveRun(): EmergencyRun | null {
  const runs = loadRuns();
  return runs.find((r) => r.ended_at === null) ?? null;
}

export function startRun(flow: EmergencyFlow): EmergencyRun {
  const run: EmergencyRun = {
    id: uid("run"),
    flow_id: flow.id,
    started_at: nowISO(),
    ended_at: null,
    step_states: Object.fromEntries(flow.steps.map((s) => [s.id, { done: false }])),
  };

  const runs = loadRuns();
  saveRuns([run, ...runs]);
  return run;
}

export function updateRun(run: EmergencyRun) {
  const runs = loadRuns();
  const idx = runs.findIndex((r) => r.id === run.id);
  if (idx >= 0) runs[idx] = run;
  else runs.unshift(run);
  saveRuns(runs);
}

export function endRun(run: EmergencyRun) {
  const ended: EmergencyRun = { ...run, ended_at: nowISO() };
  updateRun(ended);
  return ended;
}
