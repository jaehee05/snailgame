export function SnailIcon({
  color,
  shell,
  size = 40,
  className,
}: {
  color: string;
  shell: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 106 70"
      height={size}
      width={(size * 106) / 70}
      className={className}
      aria-hidden
    >
      {/* 발 */}
      <ellipse cx="50" cy="58" rx="46" ry="9" fill={color} />
      {/* 목 + 머리 */}
      <path
        d="M72 56 C74 42 80 34 90 32"
        stroke={color}
        strokeWidth="13"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="91" cy="31" r="7.5" fill={color} />
      {/* 더듬이 */}
      <line x1="94" y1="26" x2="99" y2="11" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="99.5" cy="9" r="3.6" fill={color} />
      <circle cx="100.3" cy="8.2" r="1.3" fill="rgba(15,15,20,.85)" />
      <line x1="87" y1="26" x2="85" y2="12" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="84.6" cy="10" r="3.6" fill={color} />
      <circle cx="85.4" cy="9.2" r="1.3" fill="rgba(15,15,20,.85)" />
      {/* 껍데기 */}
      <circle cx="45" cy="35" r="24" fill={shell} />
      <path
        d="M45 19 A16 16 0 1 1 29.5 38 A11 11 0 1 0 45 27"
        fill="none"
        stroke="rgba(0,0,0,.32)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle cx="38" cy="26" r="5" fill="rgba(255,255,255,.22)" />
    </svg>
  );
}
