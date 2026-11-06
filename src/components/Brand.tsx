/** Le sceau RoAccount : carré rouge + carré Roblox blanc incliné, sur fond sombre. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span className="mark" style={{ width: size, height: size }}>
      <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
        <defs>
          <linearGradient id="roa-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ff3b52" />
            <stop offset="1" stopColor="#d4142b" />
          </linearGradient>
        </defs>
        {/* fond sombre arrondi */}
        <rect x="1" y="1" width="30" height="30" rx="7" fill="#17110f" />
        {/* carré rouge */}
        <rect x="3.4" y="15" width="13.6" height="13.6" rx="3" fill="url(#roa-g)" />
        {/* carré Roblox blanc incliné, avec trou */}
        <g transform="rotate(18 18.5 12.6)">
          <rect x="10.5" y="4.6" width="16" height="16" rx="3.4" fill="#fff" />
          <rect x="16" y="10.1" width="5" height="5" rx="1.3" fill="#17110f" />
        </g>
      </svg>
    </span>
  );
}

export function Wordmark() {
  return (
    <span className="brand">
      <BrandMark />
      <span>Ro<b>Account</b></span>
    </span>
  );
}
