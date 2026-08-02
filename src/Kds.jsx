// Kitchen Display (KDS) — order queue once cashier has accepted orders.
// Enables dapUr/bar staff to advance fulfillment status in real time.

import React, { useMemo, useState } from 'react'
import { STATUS, money } from './state'

const STATIONS = [
  { id: 'semua', label: 'Semua' },
  { id: 'dapur', label: 'Dapur' },
  { id: 'bar', label: 'Bar' },
]

const demoSent = [
  {
    id: 'KS-1040', table: 'Meja 02', items: 3, station: 'dapur', status: STATUS.PREP, elapsed: '14:32',
    note: 'Tanpa bawang', lines: [['Ayam Bakar Madu', '1 × Rp54.000', ''], ['Nasi Putih', '1 × Rp11.000', ''], ['Es Teh', '1 × Rp18.000', 'Dingin']],
  },
  {
    id: 'KS-1041', table: 'Meja 07', items: 2, station: 'bar', status: STATUS.SENT, elapsed: '11:05',
    note: '', lines: [['Es Kopi Susu', '2 × Rp28.000', 'Less ice']],
  },
  {
    id: 'KS-1042', table: 'Meja 15', items: 4, station: 'dapur', status: STATUS.READY, elapsed: '09:47',
    note: 'Sambal terpisah', lines: [['Mie Goreng', '2 × Rp35.000', ''], ['Jus Mangga', '1 × Rp30.000', ''], ['Air Putih', '1 × Rp12.000', '']],
  },
]

function KdsCard({ order, onAdvance }) {
  const next = order.status === 'Diterima' ? 'Mulai siapkan' :
    order.status === 'Sedang disiapkan' ? 'Tandai siap antar' :
    order.status === 'Siap diantar' ? 'Selesai diantar' : null
  return (
    <article className="kds-card">
      <div className="kds-card-top">
        <div className={`station-pill ${order.station}`}>{order.station === 'dapur' ? 'Dapur' : 'Bar'}</div>
        <span>{order.table} · {order.id}</span>
      </div>
      <div className="kds-timer"><b>{order.elapsed}</b><span>dipesan</span></div>
      <ul className="kds-lines">
        {order.lines.map(([name, price, note]) => (
          <li key={name}>
            <span>{name}</span>
            <em>{price}</em>
            {note && <small>{note}</small>}
          </li>
        ))}
      </ul>
      {order.note && <p className="kds-note">{order.note}</p>}
      <div className="kds-status"><span className={`status-dot-k ${order.status.toLowerCase()}`} /> {order.status}</div>
      {next && <button className="kds-action" onClick={() => onAdvance(order.id)}>{next}</button>}
    </article>
  )
}

function Kds() {
  const [orders, setOrders] = useState(demoSent)
  const [station, setStation] = useState('semua')
  const visible = useMemo(() => orders.filter((o) => station === 'semua' || o.station === station), [orders, station])

  const advance = (id) => setOrders((prev) => prev.map((o) => {
    if (o.id !== id) return o
    if (o.status === 'Diterima') return { ...o, status: 'Sedang disiapkan', elapsed: o.elapsed }
    if (o.status === 'Sedang disiapkan') return { ...o, status: 'Siap diantar' }
    return { ...o, status: 'Selesai' }
  }))

  return (
    <main className="kds">
      <header className="kds-header">
        <div className="kds-title">
          <h1>Layar dapur</h1>
          <p>Order yang sudah diterima kasir dan masuk ke produksi.</p>
        </div>
        <div className="kds-stations">
          {STATIONS.map((s) => (
            <button key={s.id} className={station === s.id ? 'selected' : ''} onClick={() => setStation(s.id)}>{s.label}</button>
          ))}
        </div>
      </header>
      <section className="kds-board">
        {visible.map((order) => <KdsCard key={order.id} order={order} onAdvance={advance} />)}
        {visible.length === 0 && <div className="kds-empty">Tidak ada order di {station}.</div>}
      </section>
    </main>
  )
}

export default Kds