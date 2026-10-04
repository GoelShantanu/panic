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
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}

// The brand mark: a rising line inside a rounded square.
export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="7" fill="var(--accent)" />
      <path d="M7 21.5l5.5-5.5 4 3.5L25 10.5 M19.5 10.5H25V16" fill="none" stroke="var(--accent-text)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
