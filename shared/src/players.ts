export type PlayerInput = {
  display_name: string;
  age?: number | null;
  ib_grade?: string | null;
  notes?: string | null;
};

export function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}
