// Shared sidebar keyboard shortcuts (1-8). NAV + NAV_EXTRA power the sidebar
// in AppShell; SHORTCUTS maps each key to a route. useShortcuts wires the
// global keydown listener used by every full-chrome view AND the standalone
// KDS screen, so 1-8 navigation works everywhere.

import { useEffect } from 'react'

export const NAV = [
  { key: 1, label: 'Ringkasan', icon: 'dashboard', route: '' },
  { key: 2, label: 'Order masuk', icon: 'inbox', route: 'kasir', count: true },
  { key: 3, label: 'Layar dapur', icon: 'kitchen', route: 'kds' },
  { key: 4, label: 'Portal meja', icon: 'tables', route: 'meja' },
  { key: 5, label: 'QR meja', icon: 'qr', route: 'qr' },
  { key: 6, label: 'Menu & stok', icon: 'menu', route: 'menu' },
  { key: 7, label: 'Laporan', icon: 'report', route: 'laporan' },
]

// Secondary group pinned to the sidebar bottom (still reachable via its key).
export const NAV_EXTRA = [
  { key: 8, label: 'Pengaturan', icon: 'settings', route: 'pengaturan' },
]

export const SHORTCUTS = [...NAV, ...NAV_EXTRA]

// Wire the global 1-8 navigation listener. Safe to call once per mounted view.
export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return
      const item = SHORTCUTS.find((x) => String(x.key) === event.key)
      if (item) window.location.hash = '#/' + item.route
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
