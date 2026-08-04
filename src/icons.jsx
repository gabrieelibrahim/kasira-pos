// Kasira icon set — inline SVG (stroke-based, 1.8 width) so every glyph
// renders crisply at any size. No external icon dependency.

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

export const Ic = {
  dashboard: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>,
  inbox: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><path d="M22 12h-5l-2 3h-6l-2-3H2" /><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6l3.5-7z" /></svg>,
  kitchen: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><path d="M5 3v18M5 8h14M19 3v18M5 8h3M16 8h3" /><path d="M14 12h-4v5h4z" /></svg>,
  tables: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><rect x="3" y="5" width="8" height="6" rx="1.5" /><rect x="13" y="5" width="8" height="6" rx="1.5" /><rect x="3" y="14" width="8" height="5" rx="1.5" /><rect x="13" y="14" width="8" height="5" rx="1.5" /></svg>,
  qr: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M14 14h3v3h-3zM21 14v7M14 21h7" /></svg>,
  menu: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><circle cx="9" cy="7" r="4" /><path d="M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2" /><path d="M16 3.5a4 4 0 0 1 0 7M20 15a4 4 0 0 1 3 6" /></svg>,
  report: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /><path d="M5 20v-2M16 20v-4" /></svg>,
  settings: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.01a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" /></svg>,
  search: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>,
  bell: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>,
  plus: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><path d="M12 5v14M5 12h14" /></svg>,
  minus: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><path d="M5 12h14" /></svg>,
  chevron: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><path d="m9 6 6 6-6 6" /></svg>,
  back: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>,
  arrowRight: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>,
  arrowUpRight: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><path d="M7 17 17 7" /><path d="M7 7h10v10" /></svg>,
  more: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></svg>,
  clock: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  wifi: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><path d="M2 8.8a15 15 0 0 1 20 0" /><path d="M5 12.5a10 10 0 0 1 14 0" /><path d="M8.5 16.2a5 5 0 0 1 7 0" /><circle cx="12" cy="19" r="1" fill="currentColor" /></svg>,
  check: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><path d="m4 12.5 5 5L20 6.5" /></svg>,
  checkCircle: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 5-6" /></svg>,
  close: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>,
  print: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><path d="M7 8V3h10v5" /><path d="M7 17H4v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6h-3" /><rect x="7" y="14" width="10" height="7" rx="1.5" /></svg>,
  trash: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" /></svg>,
  edit: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>,
  home: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>,
  power: (p) => <svg {...P} viewBox="0 0 24 24" {...p}><path d="M12 2v9" /><path d="M18.4 6.6a9 9 0 1 1-12.8 0" /></svg>,
}
