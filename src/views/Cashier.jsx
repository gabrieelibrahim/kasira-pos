// Cashier dashboard — review incoming orders, settle payments, and send
// orders to the kitchen. Reads the shared Supabase-backed store.

import React, { useEffect, useMemo, useState } from 'react'
import { isActionable, money, useStore } from '../state.jsx'
import { Ic } from '../icons.jsx'
import AppShell from '../AppShell.jsx'

function Icon({ name, size = 17 }) {
  const render = Ic[name] || Ic.dashboard
  return <span aria-hidden="true" className={`icon icon-${name}`}>{render({ width: size, height: size })}</span>
}

function Cashier() {
  const { orders, accept, reject, markCashPaid: settleCash } = useStore()
  const [selectedId, setSelectedId] = useState('')
  const [filter, setFilter] = useState('Semua')
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const filteredOrders = useMemo(() => orders.filter((order) => {
    const matchesQuery = `${order.id} ${order.table} ${order.customer}`.toLowerCase().includes(query.toLowerCase())
    const matchesFilter = filter === 'Semua' || (filter === 'QRIS' && order.paymentTone === 'paid') || (filter === 'Tunai' && order.paymentTone === 'cash')
    return isActionable(order) && matchesQuery && matchesFilter
  }), [orders, query, filter])
  const selected = filteredOrders.find((order) => order.id === selectedId) || filteredOrders[0] || null
  const pendingCount = orders.filter(isActionable).length

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id)
    if (!selected) setSelectedId('')
  }, [selected, selectedId])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!selected || event.target.matches('input, textarea, select')) return
      if (event.key === 'Enter' && selected.paymentTone === 'paid') updateOrder(accept)
      if (event.key.toLowerCase() === 'r') setRejecting(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  const flash = (message) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 2600)
  }

  const updateOrder = (action) => {
    if (!selected) return
    action(selected.id)
    setRejecting(false)
    setRejectReason('')
    flash(`${selected.id} selesai ditinjau.`)
  }

  const markCashPaid = () => {
    if (!selected) return
    settleCash(selected.id)
    flash(`Pembayaran tunai ${selected.table} sudah dicatat.`)
  }

  const confirmReject = () => {
    if (!rejectReason.trim()) return
    reject(selected.id)
    setRejecting(false)
    setRejectReason('')
    flash(`${selected.id} ditolak.`)
  }


  if (!selected) {
    return (
      <AppShell active="Order masuk" breadcrumb="Order masuk" badge={pendingCount}>
        <div className="empty-workspace">
          <div className="empty-icon"><Icon name="check" size={26} /></div>
          <h1>Semua order sudah ditinjau</h1>
          <p>Order baru dari meja pelanggan akan muncul di sini secara realtime.</p>
          <button className="secondary-button" onClick={() => { setFilter('Semua'); setQuery('') }}>Tampilkan semua order</button>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell active="Order masuk" breadcrumb="Order masuk" badge={pendingCount}>
      <section className="page-heading"><div><p className="eyebrow">ORDER MASUK</p><h1>Order masuk <span className="heading-count">{pendingCount}</span></h1></div></section>

      <section className="workspace-grid">
            <div className="queue-column">
              <div className="queue-toolbar"><div className="filter-tabs" role="tablist" aria-label="Filter pembayaran">{['Semua', 'QRIS', 'Tunai'].map((item) => <button type="button" role="tab" aria-selected={filter === item} key={item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item}{item === 'Semua' && <span>{pendingCount}</span>}</button>)}</div><label className="search-field"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari order atau meja" aria-label="Cari order atau meja" /></label></div>
              <div className="queue-meta"><span>{filteredOrders.length} order perlu ditinjau</span><button type="button" className="sort-button" onClick={() => flash('Urutan saat ini: order terlama dulu.')}>Terlama dulu <Icon name="chevron" /></button></div>
              <div className="order-list">{filteredOrders.map((order) => <button type="button" key={order.id} aria-pressed={selected.id === order.id} className={`order-ticket ${selected.id === order.id ? 'selected' : ''}`} onClick={() => setSelectedId(order.id)}><div className="ticket-top"><span className="table-name">{order.table}</span><span className="ticket-age"><Icon name="clock" /> {order.age}</span></div><div className="ticket-middle"><strong>{order.customer}</strong><span>{order.items} item · {money(order.total)}</span></div><div className="ticket-bottom"><span className={`payment-tag ${order.paymentTone}`}><i />{order.payment}</span><span className="ticket-id">{order.id} <Icon name="chevron" /></span></div></button>)}{filteredOrders.length === 0 && <div className="empty-state"><div className="empty-icon"><Icon name="search" size={26} /></div><b>Tidak ada order yang cocok</b><p>Coba ubah kata kunci atau filter pembayaran.</p></div>}</div>
            </div>

            <section className="detail-panel" aria-label="Detail order terpilih"><div className="detail-header"><div><div className="detail-kicker"><span className="status-dot" /> {selected.status}</div><h2>{selected.table} <span>·</span> {selected.id}</h2><p>{selected.customer} · {selected.age}</p></div><button type="button" className="icon-button small" aria-label="Aksi lainnya" onClick={() => flash('Aksi lanjutan tersedia setelah order diterima.')}><Icon name="more" /></button></div><div className="payment-banner"><div className={`payment-symbol ${selected.paymentTone}`}>{selected.paymentTone === 'cash' ? <span className="payment-cash-label">Rp</span> : <Icon name="wifi" size={20} />}</div><div><b>{selected.payment}</b><span>{selected.paymentTone === 'paid' ? 'Pembayaran sudah diverifikasi oleh gateway.' : 'Tunggu pembayaran tunai di kasir sebelum diteruskan.'}</span></div>{selected.paymentTone === 'paid' && <Icon name="check" />}</div><div className="detail-section"><div className="section-title"><h3>Ringkasan pesanan</h3><span>{selected.items} item</span></div><div className="line-items">{selected.lines.map(([name, price, note]) => <div className="line-item" key={name}><div><b>{name}</b><span>{note || 'Tanpa catatan khusus'}</span></div><strong>{price}</strong></div>)}</div></div><div className="detail-section note-section"><div className="section-title"><h3>Catatan pelanggan</h3></div><div className="customer-note">{selected.note || 'Tidak ada catatan untuk order ini.'}</div></div><div className="total-row"><span>Total order</span><strong>{money(selected.total)}</strong></div><div className="detail-actions">{selected.paymentTone === 'cash' ? <button type="button" className="primary-button" onClick={markCashPaid}>Tandai tunai sudah dibayar <Icon name="arrowRight" /></button> : <button type="button" className="primary-button" onClick={() => updateOrder(accept)}>Terima & kirim ke dapur <Icon name="arrowRight" /></button>}<button type="button" className="reject-button" onClick={() => setRejecting(true)}>Tolak order</button></div><p className="keyboard-hint"><kbd>Enter</kbd> untuk menerima · <kbd>R</kbd> untuk menolak</p></section>{rejecting && <div className="modal-backdrop" role="presentation"><div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="reject-title"><h2 id="reject-title">Tolak order {selected.id}?</h2><p>Order akan dikeluarkan dari antrean kasir. Tindakan ini perlu alasan untuk audit outlet.</p><label>Alasan penolakan<textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Contoh: item utama habis" autoFocus /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { setRejecting(false); setRejectReason('') }}>Batal</button><button type="button" className="reject-button" disabled={!rejectReason.trim()} onClick={confirmReject}>Tolak order</button></div></div></div>}</section>
      {notice && <div className="toast" role="status"><span className="toast-check"><Icon name="check" size={14} /></span>{notice}</div>}
    </AppShell>
  )
}

export default Cashier