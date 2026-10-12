import type { Suggestion } from '../ui/Autocomplete';

export interface LibraryTagOption {
  label: string;
  value: string;
  count: number;
}

export function libraryTagSuggestions(
  options: LibraryTagOption[],
  query: string,
  selected: string[],
): Suggestion[] {
  const normalize = (text: string) => text.trim().toLocaleLowerCase().replaceAll('_', ' ');
  const needle = normalize(query);
  if (!needle) return [];
  const excluded = new Set(selected.map(normalize));
  const rank = (text: string) => {
    const normalized = normalize(text);
    if (normalized.startsWith(needle)) return 0;
    if (normalized.split(/\s+/).some((word) => word.startsWith(needle))) return 1;
    return normalized.includes(needle) ? 2 : 3;
  };
  return options
    .filter((option) => !excluded.has(normalize(option.value)))
    .map((option) => {
      const prefix = `${option.value} · `;
      const translation = option.label.startsWith(prefix) ? option.label.slice(prefix.length) : '';
      return { ...option, translation, rank: Math.min(rank(option.value), rank(translation)) };
    })
    .filter((option) => option.rank < 3)
    .sort((a, b) => a.rank - b.rank || b.count - a.count || a.value.localeCompare(b.value))
    .slice(0, 8)
    .map((option) => ({
      id: option.value,
      text: option.value,
      translation: option.translation,
      count: String(option.count),
    }));
}
