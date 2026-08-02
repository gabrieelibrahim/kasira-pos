import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import Kds from './Kds'
import './styles.css'

const routeFromHash = () => window.location.hash.replace('#/', '') || 'kasir'

const navItems = [
  { label: 'Ringkasan', icon: '◈' },
  { label: 'Order masuk', icon: '↗', count: true, active: true },
  { label: 'Layar dapur', icon: '▦', href: 'kds' },
  { label: 'Menu & stok', icon: '☷' },
  { label: 'Laporan', icon: '◒' },
]

const ordersSeed = [
  {
    id: 'KS-1048', table: 'Meja 12', age: 'baru saja', minutes: 1, items: 4, total: 186000,
    payment: 'QRIS terkonfirmasi', paymentTone: 'paid', status: 'Menunggu konfirmasi',
    customer: 'Rina · 3 orang', note: 'Satu nasi goreng tanpa pedas, ya.',
    lines: [
      ['Nasi Goreng Kampung', '2 × Rp42.000', 'Tanpa pedas'],
      ['Es Kopi Susu Gula Aren', '1 × Rp28.000', 'Less ice'],
      ['Tahu Cabe Garam', '1 × Rp32.000', ''],
    ],
  },
  {
    id: 'KS-1047', table: 'Meja 04', age: '2 menit lalu', minutes: 2, items: 3, total: 124000,
    payment: 'Menunggu tunai', paymentTone: 'cash', status: 'Menunggu pembayaran',
    customer: 'Dimas · 2 orang', note: 'Bayar di kasir sebelum pesanan diproses.',
    lines: [
      ['Mie Ayam Sambal Matah', '1 × Rp38.000', 'Extra sambal'],
      ['Ayam Bakar Madu', '1 × Rp54.000', ''],
      ['Teh Sereh', '1 × Rp22.000', 'Hangat'],
    ],
  },
  {
    id: 'KS-1046', table: 'Meja 21', age: '4 menit lalu', minutes: 4, items: 6, total: 298000,
    payment: 'QRIS terkonfirmasi', paymentTone: 'paid', status: 'Menunggu konfirmasi',
    customer: 'Aldo · 5 orang', note: 'Tolong antar minuman duluan.',
    lines: [
      ['Paket Nasi Ayam Bakar', '3 × Rp62.000', '2 tanpa sambal'],
      ['Es Teh Lemon', '2 × Rp20.000', ''],
      ['Kentang Goreng', '1 × Rp32.000', 'Saus terpisah'],
    ],
  },
  {
    id: 'KS-1045', table: 'Meja 08', age: '6 menit lalu', minutes: 6, items: 2, total: 90000,
    payment: 'QRIS terkonfirmasi', paymentTone: 'paid', status: 'Menunggu konfirmasi',
    customer: 'Sari · 2 orang', note: '',
    lines: [
      ['Soto Betawi', '1 × Rp58.000', ''],
      ['Air Mineral', '2 × Rp16.000', 'Dingin'],
    ],
  },
  {
    id: 'KS-1044', table: 'Meja 17', age: '8 menit lalu', minutes: 8, items: 5, total: 210000,
    payment: 'QRIS terkonfirmasi', paymentTone: 'paid', status: 'Menunggu konfirmasi',
    customer: 'Yoga · 4 orang', note: 'Pisahkan sambal dan acar.',
    lines: [
      ['Iga Bakar Komplit', '2 × Rp78.000', ''],
      ['Jus Alpukat', '1 × Rp32.000', 'Tanpa gula'],
      ['Nasi Putih', '2 × Rp11.000', ''],
    ],
  },
]

const tables = [
  ['01', 'Kosong', 'empty'], ['02', 'Kosong', 'empty'], ['03', 'Makan', 'occupied'], ['04', 'Bayar', 'pay'],
  ['05', 'Kosong', 'empty'], ['06', 'Makan', 'occupied'], ['07', 'Kosong', 'empty'], ['08', 'Order baru', 'new'],
  ['09', 'Kosong', 'empty'], ['10', 'Makan', 'occupied'], ['11', 'Kosong', 'empty'], ['12', 'Order baru', 'new'],
  ['13', 'Kosong', 'empty'], ['14', 'Makan', 'occupied'], ['15', 'Kosong', 'empty'], ['16', 'Kosong', 'empty'],
  ['17', 'Order baru', 'new'], ['18', 'Kosong', 'empty'], ['19', 'Makan', 'occupied'], ['20', 'Kosong', 'empty'],
  ['21', 'Order baru', 'new'], ['22', 'Kosong', 'empty'], ['23', 'Makan', 'occupied'], ['24', 'Kosong', 'empty'],
]

const money = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)

function Icon({ name }) {
  const icons = {
    search: '⌕', bell: '♧', plus: '+', chevron: '›', arrow: '↗', more: '•••', clock: '◷', wifi: '⌁', check: '✓', close: '×', table: '▦',
  }
  return <span aria-hidden="true" className={`icon icon-${name}`}>{icons[name] || name}</span>
}

function App() {
  const [route, setRoute] = useState(routeFromHash)
  const [orders, setOrders] = useState(ordersSeed)
  const [selectedId, setSelectedId] = useState(ordersSeed[0].id)
  const [filter, setFilter] = useState('Semua')
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [showTables, setShowTables] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const actionable = (order) => order.status === 'Menunggu konfirmasi' || order.status === 'Menunggu pembayaran'
  const filteredOrders = useMemo(() => orders.filter((order) => {
    const matchesQuery = `${order.id} ${order.table} ${order.customer}`.toLowerCase().includes(query.toLowerCase())
    const matchesFilter = filter === 'Semua' || (filter === 'QRIS' && order.paymentTone === 'paid') || (filter === 'Tunai' && order.paymentTone === 'cash')
    return actionable(order) && matchesQuery && matchesFilter
  }), [orders, query, filter])
  const selected = filteredOrders.find((order) => order.id === selectedId) || filteredOrders[0] || null
  const pendingCount = orders.filter(actionable).length

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id)
    if (!selected) setSelectedId('')
  }, [selected, selectedId])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!selected || event.target.matches('input, textarea, select')) return
      if (event.key === 'Enter' && selected.paymentTone === 'paid') updateOrder('Diterima')
      if (event.key.toLowerCase() === 'r') setRejecting(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const flash = (message) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2600)
  }

  const updateOrder = (status) => {
    if (!selected) return
    setOrders((current) => current.map((order) => order.id === selected.id ? { ...order, status } : order))
    setRejecting(false)
    setRejectReason('')
    flash(status === 'Diterima' ? `${selected.id} diterima dan dikirim ke dapur/bar.` : `${selected.id} ditolak.`)
  }

  const markCashPaid = () => {
    if (!selected) return
    setOrders((current) => current.map((order) => order.id === selected.id ? { ...order, payment: 'Tunai diterima', paymentTone: 'paid', status: 'Menunggu konfirmasi' } : order))
    flash(`Pembayaran tunai ${selected.table} sudah dicatat.`)
  }

  const confirmReject = () => {
    if (!rejectReason.trim()) return
    updateOrder('Ditolak')
  }

  const go = (item) => item.href ? (window.location.hash = '#/' + item.href) : flash(`${item.label} akan tersedia pada modul berikutnya.`)

  if (route === 'kds') return <Kds />

  if (!selected) {
    return <div className="app-shell"><aside className="sidebar">{/** navigation remains available in the full view */}</aside><main className="main-content"><header className="topbar"><div className="breadcrumb"><span>Workspace</span><Icon name="chevron" /><b>Order masuk</b></div></header><div className="content-wrap"><div className="empty-workspace"><div className="empty-icon">✓</div><h1>Semua order sudah ditinjau</h1><p>Order baru dari meja pelanggan akan muncul di sini secara realtime.</p><button className="secondary-button" onClick={() => { setFilter('Semua'); setQuery('') }}>Tampilkan semua order</button></div></div></main></div>
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><div className="brand-mark">K</div><div><strong>kasira</strong><span>CONTROL ROOM</span></div></div>
        <div className="outlet-switcher"><span className="live-dot" /> <span><b>Outlet Senopati</b><small>Shift pagi · Aktif</small></span><Icon name="chevron" /></div>
        <nav aria-label="Navigasi utama"><p className="nav-label">Workspace</p>{navItems.map((item) => <button type="button" key={item.label} aria-current={item.active ? 'page' : undefined} aria-label={item.label} title={item.label} className={`nav-item ${item.active ? 'active' : ''}`} onClick={() => go(item)}><span className="nav-icon">{item.icon}</span><span>{item.label}</span>{item.count ? <em>{pendingCount}</em> : null}</button>)}</nav>
        <div className="sidebar-bottom"><button type="button" className="nav-item" aria-label="Pengaturan" title="Pengaturan" onClick={() => flash('Pengaturan akan tersedia pada modul berikutnya.')}><span className="nav-icon">◉</span><span>Pengaturan</span></button><div className="help-card"><span className="help-mark">?</span><div><b>Butuh bantuan?</b><small>Buka pusat panduan</small></div><Icon name="arrow" /></div><div className="user-row"><div className="avatar">RA</div><span><b>Raka Adi</b><small>Kasir · Shift pagi</small></span><Icon name="more" /></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumb"><span>Workspace</span><Icon name="chevron" /><b>Order masuk</b></div><div className="top-actions"><div className="connection"><span className="live-dot" /> Realtime aktif · tersinkronisasi</div><button type="button" className="icon-button" aria-label="Fokus ke pencarian" onClick={() => document.querySelector('.search-field input')?.focus()}><Icon name="search" /></button><button type="button" className="icon-button notification" aria-label="Buka notifikasi" onClick={() => flash('Belum ada notifikasi baru.')}><Icon name="bell" /><i /></button><div className="top-avatar" aria-label="Raka Adi">RA</div></div></header>

        <div className="content-wrap">
          <section className="page-heading"><div><p className="eyebrow">SABTU, 02 AGUSTUS 2026 · 10:42 WIB</p><h1>Order masuk <span className="heading-count">{pendingCount}</span></h1></div><button className="secondary-button" onClick={() => setShowTables(!showTables)}><Icon name="table" /> Lihat semua meja</button></section>

          {showTables && <section className="table-panel"><div className="panel-heading"><div><h2>Status meja</h2><p>24 meja · 9 sedang digunakan</p></div><button className="text-button" onClick={() => setShowTables(false)}>Tutup <Icon name="close" /></button></div><div className="table-grid">{tables.map(([number, label, tone]) => <div className={`table-cell ${tone}`} key={number}><span>{number}</span><small>{label}</small></div>)}</div></section>}

          <section className="workspace-grid">
            <div className="queue-column">
              <div className="queue-toolbar"><div className="filter-tabs" role="tablist" aria-label="Filter pembayaran">{['Semua', 'QRIS', 'Tunai'].map((item) => <button type="button" role="tab" aria-selected={filter === item} key={item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item}{item === 'Semua' && <span>{pendingCount}</span>}</button>)}</div><label className="search-field"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari order atau meja" aria-label="Cari order atau meja" /></label></div>
              <div className="queue-meta"><span>{filteredOrders.length} order perlu ditinjau</span><button type="button" className="sort-button" onClick={() => flash('Urutan saat ini: order terlama dulu.')}>Terlama dulu <Icon name="chevron" /></button></div>
              <div className="order-list">{filteredOrders.map((order) => <button type="button" key={order.id} aria-pressed={selected.id === order.id} className={`order-ticket ${selected.id === order.id ? 'selected' : ''}`} onClick={() => setSelectedId(order.id)}><div className="ticket-top"><span className="table-name">{order.table}</span><span className="ticket-age"><Icon name="clock" /> {order.age}</span></div><div className="ticket-middle"><strong>{order.customer}</strong><span>{order.items} item · {money(order.total)}</span></div><div className="ticket-bottom"><span className={`payment-tag ${order.paymentTone}`}><i />{order.payment}</span><span className="ticket-id">{order.id} <Icon name="chevron" /></span></div></button>)}{filteredOrders.length === 0 && <div className="empty-state"><div className="empty-icon">⌕</div><b>Tidak ada order yang cocok</b><p>Coba ubah kata kunci atau filter pembayaran.</p></div>}</div>
            </div>

            <section className="detail-panel" aria-label="Detail order terpilih"><div className="detail-header"><div><div className="detail-kicker"><span className="status-dot" /> {selected.status}</div><h2>{selected.table} <span>·</span> {selected.id}</h2><p>{selected.customer} · {selected.age}</p></div><button type="button" className="icon-button small" aria-label="Aksi lainnya" onClick={() => flash('Aksi lanjutan tersedia setelah order diterima.')}><Icon name="more" /></button></div><div className="payment-banner"><div className={`payment-symbol ${selected.paymentTone}`}>{selected.paymentTone === 'cash' ? 'Rp' : '⌁'}</div><div><b>{selected.payment}</b><span>{selected.paymentTone === 'paid' ? 'Pembayaran sudah diverifikasi oleh gateway.' : 'Tunggu pembayaran tunai di kasir sebelum diteruskan.'}</span></div>{selected.paymentTone === 'paid' && <Icon name="check" />}</div><div className="detail-section"><div className="section-title"><h3>Ringkasan pesanan</h3><span>{selected.items} item</span></div><div className="line-items">{selected.lines.map(([name, price, note]) => <div className="line-item" key={name}><div><b>{name}</b><span>{note || 'Tanpa catatan khusus'}</span></div><strong>{price}</strong></div>)}</div></div><div className="detail-section note-section"><div className="section-title"><h3>Catatan pelanggan</h3></div><div className="customer-note">{selected.note || 'Tidak ada catatan untuk order ini.'}</div></div><div className="total-row"><span>Total order</span><strong>{money(selected.total)}</strong></div><div className="detail-actions">{selected.paymentTone === 'cash' ? <button type="button" className="primary-button" onClick={markCashPaid}>Tandai tunai sudah dibayar <Icon name="arrow" /></button> : <button type="button" className="primary-button" onClick={() => updateOrder('Diterima')}>Terima & kirim ke dapur <Icon name="arrow" /></button>}<button type="button" className="reject-button" onClick={() => setRejecting(true)}>Tolak order</button></div><p className="keyboard-hint"><kbd>Enter</kbd> untuk menerima · <kbd>R</kbd> untuk menolak</p></section>{rejecting && <div className="modal-backdrop" role="presentation"><div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="reject-title"><h2 id="reject-title">Tolak order {selected.id}?</h2><p>Order akan dikeluarkan dari antrean kasir. Tindakan ini perlu alasan untuk audit outlet.</p><label>Alasan penolakan<textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Contoh: item utama habis" autoFocus /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { setRejecting(false); setRejectReason('') }}>Batal</button><button type="button" className="reject-button" disabled={!rejectReason.trim()} onClick={confirmReject}>Tolak order</button></div></div></div>}</section>
        </div>
      </main>
      {notice && <div className="toast" role="status"><span className="toast-check">✓</span>{notice}</div>}
    </div>
  )
}

createRoot(document.getElementById('root')).render(<App />)
