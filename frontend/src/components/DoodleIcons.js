export function StarDoodle({ size = 20, color = "currentColor", style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <path d="M12 2l2.4 6.6L21 11l-5.4 4.5L17 22l-5-3.6L7 22l1.4-6.5L3 11l6.6-2.4L12 2z" />
    </svg>
  );
}

export function CapDoodle({ size = 24, color = "currentColor", style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <path d="M2 10l10-5 10 5-10 5-10-5z" />
      <path d="M6 12v5c0 2 3 4 6 4s6-2 6-4v-5" />
      <path d="M22 10v6" />
    </svg>
  );
}

export function SparkleDoodle({ size = 18, color = "currentColor", style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <path d="M12 3v18M3 12h18M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

export function NotebookDoodle({ size = 22, color = "currentColor", style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <rect x="5" y="3" width="15" height="18" rx="2" />
      <path d="M9 7h7M9 11h7M9 15h4" />
      <circle cx="3" cy="6" r="1" fill={color} />
      <circle cx="3" cy="12" r="1" fill={color} />
      <circle cx="3" cy="18" r="1" fill={color} />
    </svg>
  );
}

export function WavyUnderline({ width = 120, height = 12, color = "#4f46e5", style }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 120 12"
      fill="none"
      style={style}
    >
      <path
        d="M2 6c10-5 20 5 30 0s20 5 30 0 20 5 30 0 15 3 26-1"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
