const KEY = "life_ops_v01_daily_tasks";

export type StoredDailyTask = {
  id: string;
  title: string;
  type: "check" | "number";
  target: number | null;
  actual: number;
  completed: boolean;
  is_deleted: boolean;
};

export function loadTasks(): StoredDailyTask[] {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredDailyTask[]) : [];
  } catch {
    return [];
  }
}

export function saveTasks(tasks: StoredDailyTask[]) {
  localStorage.setItem(KEY, JSON.stringify(tasks));
}
