// Line icons for the navigation rail and toolbars: 24-unit grid, drawn with currentColor so they follow
// the text colour in both themes. Always decorative; the link or button beside them carries the name.
const PATHS = {
  news: 'M4 5h16v14H4z M8 9h8 M8 12.5h8 M8 16h5',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z',
  bell: 'M18 16.5v-5a6 6 0 0 0-12 0v5L4.5 18h15z M10 20.5a2 2 0 0 0 4 0',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z M15.5 15.5L20 20',
  crown: 'M4 8l4 3.5L12 5l4 6.5L20 8l-1.5 10h-13z',
  chat: 'M4 5h16v11h-9l-5 4v-4H4z',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4.5 20.5c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5',
  signin: 'M14 4h5v16h-5 M10 8l4 4-4 4 M14 12H4',
  sun: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M12 2.5v2.5 M12 19v2.5 M2.5 12H5 M19 12h2.5 M5.3 5.3l1.8 1.8 M16.9 16.9l1.8 1.8 M5.3 18.7l1.8-1.8 M16.9 7.1l1.8-1.8',
  moon: 'M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z',
  contrast: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M12 4v16',
  pulse: 'M3 12h4l2.5-6 4.5 12 2.5-6H21',
  heatmap: 'M3 3h8v9H3z M13 3h8v5h-8z M13 10h8v11h-8z M3 14h8v7H3z',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
  bull: 'M18 15l-6-6-6 6',
  bear: 'M6 9l6 6 6-6',
  neutral: 'M5 12h14',
  arrowUp: 'M12 19V5 M5 12l7-7 7 7',
  arrowDown: 'M12 5v14 M19 12l-7 7-7-7',
  alertTriangle: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01',
  flag: 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22v-7',
  lock: 'M7 11V7a5 5 0 0 1 10 0v4 M5 11h14v10H5z',
  chevronDown: 'M6 9l6 6 6-6',
  close: 'M18 6L6 18 M6 6l12 12',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, strokeWidth = 1.7 }: { name: IconName; size?: number; strokeWidth?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}

// The brand mark: Geometric Precision News Signal tile with Bull, Bear, and blue alert notification dot.
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="40 35 325 320" role="img" aria-hidden="true" focusable="false">
      <defs>
        <mask id="bp-signal-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="400" height="400">
          <path fill="#FFFFFF" d="M0 0H400V400H0Z" />
          <circle cx="330" cy="70" r="44" fill="#000000" />
        </mask>
      </defs>
      <g mask="url(#bp-signal-mask)">
        <rect className="brand-signal-tile" x="55" y="55" width="290" height="290" rx="52" fill="none" stroke="#14243A" strokeWidth="16" />
        <path className="brand-signal-beam" d="M 62,338 L 308,92" fill="none" stroke="#14243A" strokeWidth="12" strokeLinecap="round" />
        <path className="brand-signal-bull" fill="#14243A" d="M 88,252 L 104,188 L 128,154 L 158,136 L 178,132 L 214,84 L 224,90 L 196,128 L 248,104 L 252,112 L 212,136 L 230,154 L 214,180 L 194,180 L 182,166 L 164,194 L 142,228 L 116,262 Z" />
        <path className="brand-signal-bear" fill="#245FC2" d="M 312,156 L 312,284 L 276,314 L 234,314 L 216,288 L 194,268 L 184,244 L 168,226 L 188,220 L 200,230 L 210,210 L 234,190 L 248,162 L 262,168 L 258,190 L 290,178 Z" />
      </g>
      <circle className="brand-signal-dot" cx="330" cy="70" r="28" fill="#245FC2" />
    </svg>
  );
}
