export type TaskType = "check" | "number";

export interface DailyTask {
  id: string;
  title: string;
  type: TaskType;
  target: number | null;
  actual: number;
  completed: boolean;
  is_deleted: boolean;
};

export const RULES_VERSION = "0.1.0";

export function taskCompletion(t: DailyTask): number {
  if (t.is_deleted) return 0;
  const hasTarget = typeof t.target === "number" && t.target !== null && t.target > 0;
  if (t.type === "number" && hasTarget) {
    return t.actual / t.target!;
  }
  return t.completed ? 1 : 0;
}

export function dayScore(tasks: DailyTask[]): number {
  const active = tasks.filter((t) => !t.is_deleted);
  if (active.length === 0) return 1;
  const sum = active.reduce((acc, t) => acc + taskCompletion(t), 0);
  return sum / active.length;
}
