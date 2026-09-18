"use client";

// Кольцевой индикатор «сделано из всего» — используется в таблице задач и в сводке спринтов.
export function ProgressRing({ done, total }: { done: number; total: number }) {
  const radius = 5;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? done / total : 0;
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
      <circle cx="7" cy="7" r={radius} fill="none" stroke="#e0e6ee" strokeWidth="2.4" />
      <circle cx="7" cy="7" r={radius} fill="none" stroke={fraction >= 1 ? "var(--teal)" : "var(--blue)"} strokeWidth="2.4" strokeDasharray={(circumference * fraction).toFixed(2) + " " + circumference.toFixed(2)} strokeLinecap="round" transform="rotate(-90 7 7)" />
    </svg>
  );
}
