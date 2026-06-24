/**
 * Turn an App's slug (its repo name) into a human-readable name for the browser
 * tab — `my-expense-tool` → `My Expense Tool`. Pure and Worker-free so the
 * Worker can use it to fill `/api/config` and a test can call it directly.
 *
 * The slug is the single source of truth (the `APP_SLUG` Worker var), so the
 * tab title needs no per-App configuration — it follows the repo name.
 */
export const slugToAppName = (slug: string): string => {
  const name = slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  // `APP_SLUG` always has a value, but stay defensive: never return an empty
  // title.
  return name || "App";
};
