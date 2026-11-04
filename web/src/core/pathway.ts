// Pathway progress is derived from recorded events only (design §5.1.3). A model can
// suggest a step; it can never mark one complete.
import type { PathwayStep } from "./envelope";

export type StepState = "done" | "available" | "locked";

export interface StepView {
  step: PathwayStep;
  state: StepState;
  blockedBy: string[];
}

export function pathwayView(steps: PathwayStep[], completed: Set<string>): StepView[] {
  return steps.map((step) => {
    if (completed.has(step.id)) return { step, state: "done", blockedBy: [] };
    const blockedBy = step.requires.filter((requirement) => !completed.has(requirement));
    return { step, state: blockedBy.length === 0 ? "available" : "locked", blockedBy };
  });
}

export function pathwayProgress(steps: PathwayStep[], completed: Set<string>): number {
  if (steps.length === 0) return 0;
  return steps.filter((step) => completed.has(step.id)).length / steps.length;
}

export function nextStep(steps: PathwayStep[], completed: Set<string>): StepView | null {
  return pathwayView(steps, completed).find((view) => view.state === "available") ?? null;
}
