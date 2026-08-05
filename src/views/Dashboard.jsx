// Ringkasan — today's snapshot: revenue, orders, items, and table occupancy.
// Merges a dedicated today-fetch with the live store so figures stay realtime.

import React, { useEffect, useMemo, useState } from 'react'
import { STATUS, deriveTableStatus, money, useStore } from '../state.jsx'
import AppShell from '../AppShell.jsx'
import { Ic } from '../icons.jsx'

const isToday = (iso) => {
  if (!iso) return false
  const d = new Date(iso)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—'

function Dashboard() {
  const { orders, tables, todayOrders } = useStore()
  const [fetched, setFetched] = useState([])

  useEffect(() => {
    let alive = true
    todayOrders().then((d) => { if (alive) setFetched(d) }).catch(() => {})
    return () => { alive = false }
  }, [todayOrders])

  // Union today's fetched orders with today's live store orders by id (keeps realtime).
  const today = useMemo(() => {
    const map = new Map()
    for (const o of fetched) if (isToday(o.created_at)) map.set(o.id, o)
    for (const o of orders) if (isToday(o.created_at)) map.set(o.id, o)
    return [...map.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [fetched, orders])

  const revenue = today.filter((o) => o.status === STATUS.DONE).reduce((s, o) => s + o.total, 0)
  const orderCount = today.filter((o) => o.status !== STATUS.REJECTED).length
  const itemCount = today.filter((o) => o.status !== STATUS.REJECTED).reduce((s, o) => s + o.items, 0)
  const derived = useMemo(() => deriveTableStatus(tables, orders), [tables, orders])
  const tablesInUse = derived.filter((t) => t.tone !== 'empty').length

  return (
    <AppShell active="Ringkasan" breadcrumb="Ringkasan">

      <section className="stats-row cards-4">
        <div className="stat-card"><div className="stat-icon avail"><Ic.report width="20" height="20" /></div><div><b>{money(revenue)}</b><span>Penjualan hari ini</span></div></div>
        <div className="stat-card"><div className="stat-icon total"><Ic.inbox width="20" height="20" /></div><div><b>{orderCount}</b><span>Order hari ini</span></div></div>
        <div className="stat-card"><div className="stat-icon out"><Ic.clock width="20" height="20" /></div><div><b>{itemCount}</b><span>Item terjual</span></div></div>
        <div className="stat-card"><div className="stat-icon avail"><Ic.tables width="20" height="20" /></div><div><b>{tablesInUse}</b><span>Meja terisi</span></div></div>
      </section>

      <section className="table-panel">
        <div className="panel-heading"><div><h2>Status meja</h2><p>{derived.length} meja · {tablesInUse} terisi</p></div></div>
        <div className="table-grid">
          {derived.map((t) => (
            <div className={`table-cell ${t.tone}`} key={t.id}><span>{t.number}</span><small>{t.spotLabel}</small></div>
          ))}
        </div>
      </section>

      <section className="menu-panel report-panel">
        <div className="panel-heading report-panel-head"><div><h2>Order terbaru hari ini</h2><p>{today.length} order</p></div></div>
        {today.length === 0 ? (
          <div className="report-empty">Belum ada order hari ini. Order dari pelanggan akan muncul di sini secara realtime.</div>
        ) : (
          <div className="report-table">
            <div className="report-table-head"><span>Waktu</span><span>Meja</span><span>Metode</span><span>Status</span><span className="right">Total</span></div>
            {today.slice(0, 10).map((o) => (
              <div className="report-row" key={o.id}>
                <span className="report-cell time"><b>{fmtTime(o.created_at)}</b><small>#{o.num}</small></span>
                <span className="report-cell">{o.table}</span>
                <span className="report-cell"><span className={`payment-tag ${o.paymentTone}`}><i />{o.payment}</span></span>
                <span className="report-cell"><span className={`status-chip ${o.status.toLowerCase().replace(/\s+/g, '-')}`}>{o.status}</span></span>
                <span className="report-cell right"><strong>{money(o.total)}</strong></span>
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  )
}

export default Dashboard
