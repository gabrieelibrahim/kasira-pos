// Cashier dashboard — review incoming orders, settle payments, and send
// orders to the kitchen. Reads the shared Supabase-backed store. Also lets the
// cashier create manual orders (walk-in / phone) straight into the queue.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { isActionable, money, useAuth, useStore } from '../state.jsx'
import { Ic } from '../icons.jsx'
import AppShell from '../AppShell.jsx'
import Receipt from '../Receipt.jsx'

const MANUAL_EMPTY = {
  meja: 'Meja 01',
  method: 'cash',
  discountRp: '',
  serviceRate: '',
  note: '',
  lines: [], // { id, name, price, qty }
}

function Icon({ name, size = 17 }) {
  const render = Ic[name] || Ic.dashboard
  return <span aria-hidden="true" className={`icon icon-${name}`}>{render({ width: size, height: size })}</span>
}

// Station routing shared with the customer portal: all drinks → Bar, anything
// else → Dapur (mixed carts go to Dapur so food and drinks leave together).
const stationOf = (lines, menu) => {
  if (!lines.length) return 'dapur'
  const item = menu.find((m) => m.id === lines[0].id)
  return (item?.category || 'Makanan') === 'Minuman' ? 'bar' : 'dapur'
}

function Cashier() {
  const { orders, menu, tables, accept, reject, settleCash, outlet, submitCustomerOrder } = useStore()
  const { user } = useAuth()
  // Pelayan handles orders but not money — cash settling is kasir/admin only.
  const canSettleCash = user?.role !== 'pelayan'
  const [selectedId, setSelectedId] = useState('')
  const [filter, setFilter] = useState('Semua')
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [cashierRp, setCashierRp] = useState('')
  const [serviceRate, setServiceRate] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  const [change, setChange] = useState(null)
  const adjustOpenAt = useRef(0) // ms timestamp when the cash modal opened — used
                                  // to swallow the auto-repeat tail of the Enter
                                  // that opened it (would otherwise instantly
                                  // submit the still-empty form)
  const [manualOpen, setManualOpen] = useState(false)
  const [manual, setManual] = useState(MANUAL_EMPTY)
  const [manualBusy, setManualBusy] = useState(false)

  const filteredOrders = useMemo(() => orders.filter((order) => {
    const matchesQuery = `${order.num} ${order.table} ${order.customer}`.toLowerCase().includes(query.toLowerCase())
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
      // Stand down while a modal is open — Enter/R belong to the modal, not
      // the queue (prevents re-opening the cash modal right after confirming).
      if (adjusting || rejecting) return
      if (!selected || event.target.matches('input, textarea, select')) return
      if (event.key === 'Enter' && selected.paymentTone === 'paid') updateOrder(accept)
      if (event.key === 'Enter' && selected.paymentTone === 'cash' && canSettleCash) openAdjust()
      if (event.key.toLowerCase() === 'r' && canSettleCash) setRejecting(true)
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
    flash(`Order #${selected.num} selesai ditinjau.`)
  }

  const openAdjust = () => {
    if (!selected) return
    setCashierRp('')
    setServiceRate('')
    setPaidAmount('')
    setChange(null)
    setAdjusting(true)
    // The Enter that opened this card may still be auto-repeating (key hold /
    // keyboard scan). Its repeats would hit the auto-focused "Uang diterima"
    // input and submit the empty form instantly. Record the open time so the
    // form can swallow any submit arriving within the next ~700ms.
    adjustOpenAt.current = Date.now()
  }

  const closeAdjust = () => { setAdjusting(false); adjustOpenAt.current = 0 }

  // Throttle form submit: ignore any submit that arrives in the first 700ms
  // after the card opened (auto-repeat tail of the opening Enter) or while
  // the key is still physically held down (event.repeat). The cashier needs
  // the next clean, deliberate Enter — after typing the nominal — to confirm.
  const adjustSubmitBlocked = () => Date.now() - adjustOpenAt.current < 700

  // ---- Manual order (walk-in / phone) ----
  const manualMenu = useMemo(() => menu.filter((m) => m.available !== false), [menu])
  const manualSubtotal = manual.lines.reduce((s, l) => s + (l.price || 0) * l.qty, 0)
  const manualDisc = Math.min(manualSubtotal, Number(manual.discountRp || 0))
  const manualNet = manualSubtotal - manualDisc
  const manualRate = Number(manual.serviceRate || 0)
  const manualService = Math.round(manualNet * manualRate / 100)
  const manualTax = Number(outlet?.tax_rate ?? 11)
  const manualPpn = Math.round((manualNet + manualService) * manualTax / 100)
  const manualDue = manualNet + manualService + manualPpn

  const manualAdd = (item) => setManual((prev) => {
    const found = prev.lines.find((l) => l.id === item.id)
    if (found) return { ...prev, lines: prev.lines.map((l) => l.id === item.id ? { ...l, qty: l.qty + 1 } : l) }
    return { ...prev, lines: [...prev.lines, { id: item.id, name: item.name, price: Number(item.price || 0), qty: 1 }] }
  })
  const manualQty = (id, delta) => setManual((prev) => ({
    ...prev,
    lines: prev.lines.flatMap((l) => {
      if (l.id !== id) return [l]
      const qty = l.qty + delta
      return qty <= 0 ? [] : [{ ...l, qty }]
    }),
  }))

  const closeManual = () => { setManualOpen(false); setManual(MANUAL_EMPTY) }

  const submitManual = async () => {
    if (manualBusy || manual.lines.length === 0) return
    setManualBusy(true)
    try {
      await submitCustomerOrder({
        table: manual.meja,
        items: manual.lines.reduce((n, l) => n + l.qty, 0),
        total: manualNet,
        paymentTone: manual.method === 'cash' ? 'cash' : 'paid',
        station: stationOf(manual.lines, menu),
        customer: 'Kasir manual',
        note: manual.note.trim(),
        lines: manual.lines.map((l) => [`${l.qty}× ${l.name}`, money(l.price * l.qty), '']),
        staff_id: user?.id || null,
        discount: manualDisc,
        service_rate: manualRate > 0 ? manualRate : null,
      })
      flash(manual.method === 'cash'
        ? `Order tunai ${manual.meja} tercatat — menunggu pembayaran.`
        : `Order ${manual.meja} dikirim ke dapur.`)
      closeManual()
    } catch {
      flash('Gagal membuat order. Coba lagi.')
    } finally {
      setManualBusy(false)
    }
  }

  // Live totals while the cashier types — mirrors the receipt derivation.
  const gross = selected ? Number(selected.total) + Number(selected.discount || 0) : 0
  const net = selected ? gross - Math.min(gross, Number(cashierRp || 0)) : 0
  const rate = Number(serviceRate || 0)
  const tax = Number(outlet?.tax_rate ?? 11)
  const service = Math.round(net * rate / 100)
  const ppn = Math.round((net + service) * tax / 100)
  const due = net + service + ppn
  const paid = Number(paidAmount || 0)
  const previewChange = Math.max(0, paid - due)

  const confirmCash = async () => {
    const order = selected
    if (!order) return
    const disc = gross - net
    await settleCash(order.id, {
      total: net,
      discount: disc,
      service_rate: rate > 0 ? rate : null,
      cash_received: paidAmount ? Number(paidAmount) : null,
    })
    // Only now clear the modal — the optimistic sync has flipped paymentTone
    // to 'paid', so the next Enter accepts the order instead of re-opening it.
    setAdjusting(false)
    const chg = Math.max(0, (Number(paidAmount) || 0) - due)
    setChange(chg)
    flash(chg > 0 ? `Kembalian ${money(chg)} untuk ${order.table}.` : `Pembayaran tunai ${order.table} dicatat — uang pas.`)
  }

  const confirmReject = () => {
    if (!rejectReason.trim()) return
    reject(selected.id)
    setRejecting(false)
    setRejectReason('')
    flash(`Order #${selected.num} ditolak.`)
  }


  return (
    <AppShell active="Order masuk" breadcrumb="Order masuk" badge={pendingCount}>

      <section className="workspace-grid">
            <div className="queue-column">
              <div className="queue-toolbar"><div className="filter-tabs" role="tablist" aria-label="Filter pembayaran">{['Semua', 'QRIS', 'Tunai'].map((item) => <button type="button" role="tab" aria-selected={filter === item} key={item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item}{item === 'Semua' && <span>{pendingCount}</span>}</button>)}</div><label className="search-field"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari order atau meja" aria-label="Cari order atau meja" /></label><button type="button" className="manual-order-btn" onClick={() => { setManual({ ...MANUAL_EMPTY, method: canSettleCash ? 'cash' : 'qris' }); setManualOpen(true) }}><Ic.plus width="15" height="15" /> Order manual</button></div>
              <div className="queue-meta"><span>{filteredOrders.length} order perlu ditinjau</span><button type="button" className="sort-button" onClick={() => flash('Urutan saat ini: order terlama dulu.')}>Terlama dulu <Icon name="chevron" /></button></div>
              <div className="order-list">{filteredOrders.length === 0 && <div className="empty-state"><div className="empty-icon"><Icon name="check" size={26} /></div><b>Belum ada order masuk</b><p>Order baru dari meja pelanggan akan muncul di sini secara realtime.</p></div>}{filteredOrders.map((order) => <button type="button" key={order.id} aria-pressed={selected.id === order.id} className={`order-ticket ${selected.id === order.id ? 'selected' : ''}`} onClick={() => setSelectedId(order.id)}><div className="ticket-top"><span className="table-name">{order.table}</span><span className="ticket-age"><Icon name="clock" /> {order.age}</span></div><div className="ticket-middle"><strong>{order.customer}</strong><span>{order.items} item · {money(order.total)}</span></div><div className="ticket-bottom"><span className={`payment-tag ${order.paymentTone}`}><i />{order.payment}</span><span className="ticket-id">#{order.num} <Icon name="chevron" /></span></div></button>)}</div>
            </div>

            <section className="detail-panel" aria-label="Detail order terpilih">{selected ? <><div className="detail-header"><div><div className="detail-kicker"><span className="status-dot" /> {selected.status}</div><h2>{selected.table} <span>·</span> #{selected.num}</h2><p>{selected.customer} · {selected.age}</p></div><button type="button" className="icon-button small" aria-label="Aksi lainnya" onClick={() => flash('Aksi lanjutan tersedia setelah order diterima.')}><Icon name="more" /></button></div><div className="payment-banner"><div className={`payment-symbol ${selected.paymentTone}`}>{selected.paymentTone === 'cash' ? <span className="payment-cash-label">Rp</span> : <Icon name="wifi" size={20} />}</div><div><b>{selected.payment}</b><span>{selected.paymentTone === 'paid' ? 'Pembayaran sudah diverifikasi oleh gateway.' : 'Tunggu pembayaran tunai di kasir sebelum diteruskan.'}</span></div>{selected.paymentTone === 'paid' && <Icon name="check" />}</div><div className="detail-section"><div className="section-title"><h3>Ringkasan pesanan</h3><span>{selected.items} item</span></div><div className="line-items">{selected.lines.map(([name, price, note]) => <div className="line-item" key={name}><div><b>{name}</b><span>{note || 'Tanpa catatan khusus'}</span></div><strong>{price}</strong></div>)}</div></div><div className="detail-section note-section"><div className="section-title"><h3>Catatan pelanggan</h3></div><div className="customer-note">{selected.note || 'Tidak ada catatan untuk order ini.'}</div></div><div className="total-row"><span>Total order</span><strong>{money(selected.total)}</strong></div><div className="detail-actions">{selected.paymentTone === 'cash' ? (canSettleCash ? <button type="button" className="primary-button" onClick={openAdjust}>Terima tunai <Icon name="arrowRight" /></button> : <button type="button" className="primary-button" disabled title="Alur uang tunai khusus kasir/admin">Tunggu kasir</button>) : <button type="button" className="primary-button" onClick={() => updateOrder(accept)}>Terima & kirim ke dapur <Icon name="arrowRight" /></button>}<button type="button" className="secondary-button" onClick={() => window.print()}><Icon name="print" /> Cetak struk</button>{canSettleCash && <button type="button" className="reject-button" onClick={() => setRejecting(true)}>Tolak order</button>}</div><p className="keyboard-hint">{selected.paymentTone === 'cash' && canSettleCash && <><kbd>Enter</kbd> untuk tandai tunai dibayar · </>}{selected.paymentTone !== 'cash' && <><kbd>Enter</kbd> untuk terima · </>}{canSettleCash ? <><kbd>R</kbd> untuk menolak</> : <><kbd>Esc</kbd> untuk keluar</>}</p><Receipt order={selected} outlet={outlet} staff={user} /></> : <div className="detail-placeholder"><div className="detail-placeholder-icon"><Icon name="check" size={26} /></div><b>Belum ada order untuk ditinjau</b><p>Order baru dari meja pelanggan akan tampil di panel ini. Antrean kosong berarti semua order sudah ditangani.</p></div>}</section>{rejecting && selected && <div className="modal-backdrop" role="presentation"><div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="reject-title"><h2 id="reject-title">Tolak order #{selected.num}?</h2><p>Order akan dikeluarkan dari antrean kasir. Tindakan ini perlu alasan untuk audit outlet.</p><label>Alasan penolakan<textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Contoh: item utama habis" autoFocus /></label><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { setRejecting(false); setRejectReason('') }}>Batal</button><button type="button" className="reject-button" disabled={!rejectReason.trim()} onClick={confirmReject}>Tolak order</button></div></div></div>}{adjusting && selected && <div className="modal-backdrop" role="presentation"><form className="confirm-modal cash-adjust" role="dialog" aria-modal="true" aria-labelledby="adjust-title" onSubmit={(event) => { event.preventDefault(); if (adjustSubmitBlocked()) return; confirmCash() }} onKeyDown={(event) => { if (event.key === 'Enter' && event.repeat) event.preventDefault() }}><h2 id="adjust-title">Terima tunai · {selected.table}</h2><p>Total tagihan {money(gross)}. Sesuaikan potongan & service sebelum mencatat pembayaran.</p><label>Potongan (Rp)<input inputMode="numeric" value={cashierRp} onChange={(event) => setCashierRp(event.target.value.replace(/\D/g, ''))} placeholder="0" /></label><label>Service (%)<input inputMode="decimal" value={serviceRate} onChange={(event) => setServiceRate(event.target.value.replace(/[^\d.]/g, ''))} placeholder="0" /></label><label>Uang diterima (Rp)<input inputMode="numeric" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value.replace(/\D/g, ''))} placeholder="0" autoFocus /></label><div className="cash-preview"><div className="line-item"><div><b>Subtotal</b></div><strong>{money(gross)}</strong></div>{net < gross && <div className="line-item"><div><b>Diskon</b></div><strong>−{money(gross - net)}</strong></div>}{rate > 0 && <div className="line-item"><div><b>Service {rate}%</b></div><strong>{money(service)}</strong></div>}<div className="line-item"><div><b>PPN {tax}%</b></div><strong>{money(ppn)}</strong></div><div className="line-item grand"><div><b>Total</b></div><strong>{money(due)}</strong></div><div className="line-item cash-change"><div><b>Uang diterima</b></div><strong>{paid ? money(paid) : '—'}</strong></div><div className={`line-item cash-change ${previewChange > 0 ? 'has-change' : ''}`}><div><b>Kembalian</b></div><strong>{previewChange > 0 ? money(previewChange) : paid ? 'Uang pas' : '—'}</strong></div></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={closeAdjust}>Batal</button><button type="submit" className="primary-button">Konfirmasi & kirim</button></div></form></div>}{manualOpen && <div className="modal-backdrop" role="presentation"><form className="confirm-modal cash-adjust manual-form" role="dialog" aria-modal="true" aria-labelledby="manual-title" onSubmit={(event) => { event.preventDefault(); submitManual() }}><h2 id="manual-title">Order manual</h2><p>Buat order untuk pelanggan datang langsung atau lewat telepon.</p><label>Meja<select value={manual.meja} onChange={(e) => setManual({ ...manual, meja: e.target.value })}>{tables.length ? tables.map((t) => <option key={t.id} value={`Meja ${String(t.number ?? t.label ?? '').padStart(2, '0')}`}>{`Meja ${String(t.number ?? t.label ?? '').padStart(2, '0')}`}</option>) : <option>Meja 01</option>}</select></label><div className="manual-items"><b>Pilih item</b><div className="manual-item-list">{manualMenu.map((item) => { const q = manual.lines.find((l) => l.id === item.id)?.qty || 0; return (<div className="manual-item" key={item.id}><div className="manual-item-name"><b>{item.name}</b><span>{money(item.price)}</span></div><div className="qty-stepper"><button type="button" aria-label={`Kurangi ${item.name}`} onClick={() => manualQty(item.id, -1)}><Ic.minus width="14" height="14" /></button><em>{q}</em><button type="button" aria-label={`Tambah ${item.name}`} onClick={() => manualAdd(item)}><Ic.plus width="14" height="14" /></button></div></div>) })}</div></div><div className="form-grid"><label>Metode<select value={manual.method} onChange={(e) => setManual({ ...manual, method: e.target.value })}>{canSettleCash && <option value="cash">Tunai</option>}<option value="qris">QRIS</option></select></label></div><label>Catatan<textarea rows="2" value={manual.note} onChange={(e) => setManual({ ...manual, note: e.target.value })} placeholder="Catatan untuk dapur (opsional)" /></label><div className="cash-preview"><div className="line-item"><div><b>Subtotal</b></div><strong>{money(manualSubtotal)}</strong></div><label className="cash-preview-field">Potongan (Rp)<input inputMode="numeric" value={manual.discountRp} onChange={(e) => setManual({ ...manual, discountRp: e.target.value.replace(/\D/g, '') })} placeholder="0" /></label><label className="cash-preview-field">Service (%)<input inputMode="decimal" value={manual.serviceRate} onChange={(e) => setManual({ ...manual, serviceRate: e.target.value.replace(/[^\d.]/g, '') })} placeholder="0" /></label>{manualDisc > 0 && <div className="line-item"><div><b>Diskon</b></div><strong>−{money(manualDisc)}</strong></div>}{manualRate > 0 && <div className="line-item"><div><b>Service {manualRate}%</b></div><strong>{money(manualService)}</strong></div>}<div className="line-item"><div><b>PPN {manualTax}%</b></div><strong>{money(manualPpn)}</strong></div><div className="line-item grand"><div><b>Total</b></div><strong>{money(manualDue)}</strong></div></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={closeManual} disabled={manualBusy}>Batal</button><button type="submit" className="primary-button" disabled={manualBusy || manual.lines.length === 0}>{manualBusy ? 'Membuat…' : `Kirim · ${money(manualDue)}`}</button></div></form></div>}</section>
      {notice && <div className="toast" role="status"><span className="toast-check"><Icon name="check" size={14} /></span>{notice}</div>}
    </AppShell>
  )
}

export default Cashier