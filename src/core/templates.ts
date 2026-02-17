const TPL_KEY = "life_ops_v01_templates";
const DAILY_KEY = "life_ops_v01_daily_tasks";

export type TemplateTask = {
  id: string;
  title: string;
  type: "check" | "number";
  target: number | null; // 可空；空=按勾选处理
  unit: string | null;
  is_active: boolean;
};

export type DailyTask = {
  id: string;
  title: string;
  type: "check" | "number";
  target: number | null;
  actual: number;
  completed: boolean;
  is_deleted: boolean;
  // 模板派生所需：
  date: string; // YYYY-MM-DD
  source_template_id: string | null;
};

function todayYMD() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function loadTemplates(): TemplateTask[] {
  const raw = localStorage.getItem(TPL_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TemplateTask[]) : [];
  } catch {
    return [];
  }
}

export function saveTemplates(templates: TemplateTask[]) {
  localStorage.setItem(TPL_KEY, JSON.stringify(templates));
}

export function loadDaily(): DailyTask[] {
  const raw = localStorage.getItem(DAILY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DailyTask[]) : [];
  } catch {
    return [];
  }
}

export function saveDaily(tasks: DailyTask[]) {
  localStorage.setItem(DAILY_KEY, JSON.stringify(tasks));
}

/**
 * 每天自动派生：
 * - 只派生 is_active=true 的模板
 * - 按 (date + template_id) 去重
 * - 今天删掉实例也没用，明天仍会生成（模板还在）
 */
export function deriveTemplatesForToday() {
  const date = todayYMD();
  const templates = loadTemplates().filter((t) => t.is_active);
  const daily = loadDaily();

  const existed = new Set(
    daily
      .filter((d) => d.date === date && d.source_template_id)
      .map((d) => `${d.date}::${d.source_template_id}`)
  );

  const created: DailyTask[] = [];

  for (const tpl of templates) {
    const key = `${date}::${tpl.id}`;
    if (existed.has(key)) continue;

    created.push({
      id: uid("day"),
      title: tpl.title,
      type: tpl.type,
      target: tpl.target ?? null,
      actual: 0,
      completed: false,
      is_deleted: false,
      date,
      source_template_id: tpl.id,
    });
  }

  if (created.length > 0) {
    saveDaily([...created, ...daily]);
  }
}
