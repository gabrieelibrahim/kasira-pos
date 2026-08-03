// Kitchen Display (KDS) — order queue once cashier has accepted orders.
// Reads the shared store, so accepted orders from the cashier appear here
// automatically, and production status advances are visible everywhere.

import React, { useMemo, useState } from 'react'
import { STATUS, isInProduction, money, useStore } from './state.jsx'
import { Ic } from './icons.jsx'

const STATIONS = [
  { id: 'semua', label: 'Semua' },
  { id: 'dapur', label: 'Dapur' },
  { id: 'bar', label: 'Bar' },
]

const NEXT_LABEL = {
  [STATUS.SENT]: 'Mulai siapkan',
  [STATUS.PREP]: 'Tandai siap antar',
  [STATUS.READY]: 'Selesai diantar',
}

function KdsCard({ order, onAdvance }) {
  const next = NEXT_LABEL[order.status] || null
  return (
    <article className="kds-card">
      <div className="kds-card-top">
        <div className={`station-pill ${order.station}`}>{order.station === 'dapur' ? 'Dapur' : 'Bar'}</div>
        <span>{order.table} · {order.id}</span>
      </div>
      <div className="kds-status"><span className={`status-dot-k ${order.status.toLowerCase()}`} /> {order.status}</div>
      <div className="kds-lines-wrap">
        <ul className="kds-lines">
          {order.lines.map(([name, price, note]) => (
            <li key={name}>
              <span>{name}</span>
              <em>{price}</em>
              {note && <small>{note}</small>}
            </li>
          ))}
        </ul>
      </div>
      {order.note && <p className="kds-note">{order.note}</p>}
      <div className="kds-total"><span className="kds-table">{order.table}</span><b>{money(order.total)}</b></div>
      {next && <button className="kds-action" onClick={() => onAdvance(order.id)}>{next}</button>}
    </article>
  )
}

function Kds() {
  const { orders, advance } = useStore()
  const [station, setStation] = useState('semua')

  const boardOrders = orders.filter(isInProduction)
  const visible = useMemo(() => boardOrders.filter((o) => station === 'semua' || o.station === station), [boardOrders, station])

  return (
    <main className="kds">
      <header className="kds-header">
        <div className="kds-top-left">
          <button type="button" className="back-button" aria-label="Kembali ke dashboard" onClick={() => window.location.hash = '#/'}><Ic.back width="20" height="20" /></button>
          <div className="kds-title">
            <h1>Layar dapur</h1>
            <p>Order yang sudah diterima kasir dan masuk ke produksi.</p>
          </div>
        </div>
        <div className="kds-stations">
          {STATIONS.map((s) => (
            <button key={s.id} className={station === s.id ? 'selected' : ''} onClick={() => setStation(s.id)}>{s.label}</button>
          ))}
        </div>
      </header>
      <section className="kds-board">
        {visible.map((order) => <KdsCard key={order.id} order={order} onAdvance={advance} />)}
        {visible.length === 0 && <div className="kds-empty">Tidak ada order di {station}. Order yang diterima kasir akan tampil di sini.</div>}
      </section>
    </main>
  )
}

export default Kds