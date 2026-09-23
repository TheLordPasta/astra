export const CLASSROOM_MODES = [
  "TEACH",
  "LEARN",
  "RESEARCH",
  "DEVELOPER",
] as const;

export type ClassroomMode = (typeof CLASSROOM_MODES)[number];

export function isClassroomMode(value: string): value is ClassroomMode {
  return (CLASSROOM_MODES as readonly string[]).includes(value);
}
