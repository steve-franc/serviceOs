import { format } from "date-fns";

/**
 * Formats a date as "Thursday 10th, 2026"
 */
export function formatDateFull(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const dayName = format(d, "EEEE");
  const day = d.getDate();
  const suffix = getOrdinalSuffix(day);
  const year = d.getFullYear();
  const month = format(d, "MMMM");
  return `${dayName} ${day}${suffix} ${month}, ${year}`;
}

/**
 * Short version: "Thu 10th Apr, 2026"
 */
export function formatDateShort(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const dayName = format(d, "EEE");
  const day = d.getDate();
  const suffix = getOrdinalSuffix(day);
  const month = format(d, "MMM");
  const year = d.getFullYear();
  return `${dayName} ${day}${suffix} ${month}, ${year}`;
}

function getOrdinalSuffix(day: number): string {
  if (day > 3 && day < 21) return "th";
  switch (day % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}
