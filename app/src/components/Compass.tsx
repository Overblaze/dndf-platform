/** The compass rose from the top bar. Drawn here so it takes the theme's colors. */
export function Compass({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="21" fill="var(--card)" stroke="var(--ink)" strokeWidth="2" />
      <circle cx="24" cy="24" r="15.5" fill="none" stroke="var(--line)" strokeWidth="1" />
      <path d="M24 13l3.2 7.8L35 24l-7.8 3.2L24 35l-3.2-7.8L13 24l7.8-3.2z" fill="var(--line)" transform="rotate(45 24 24)" />
      <path d="M24 4l4 16 16 4-16 4-4 16-4-16-16-4 16-4z" fill="var(--ink)" />
      <path d="M24 4l4 16h-4z" fill="var(--accent)" />
      <circle cx="24" cy="24" r="2" fill="var(--card)" />
    </svg>
  );
}
