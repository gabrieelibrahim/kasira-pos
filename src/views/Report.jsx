// Laporan — sales analytics from the shared order history.
// Loads the full order history on mount (reportOrders), then slices it by
// the selected period to compute totals, payment mix, top items, and a
// date-filterable history table.

import React, { useEffect, useMemo, useState } from 'react'
import { money, useAuth, useStore } from '../state.jsx'
import { Ic } from '../icons.jsx'
import AppShell from '../AppShell.jsx'
import Receipt from '../Receipt.jsx'

const PERIODS = [
  { id: 'today', label: 'Hari ini' },
  { id: '7d', label: '7 hari' },
  { id: '30d', label: 'Bulan ini' },
  { id: 'all', label: 'Semua' },
]

const fmtDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}
const fmtTime = (iso) => {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
}

// lines: [[name, price, note]] where name carries qty like "2× Nasi Goreng"
const parseLine = ([name, price, note]) => {
  const m = String(name).match(/^(\d+)\s*[×x]\s*(.+)$/)
  const qty = m ? Number(m[1]) : 1
  const itemName = m ? m[2] : String(name)
  const unit = Number(price) || 0
  return { itemName, qty, unit, note: note || '' }
}

function Report() {
  const { reportOrders, outlet } = useStore()
  const { user } = useAuth()
  const [period, setPeriod] = useState('today')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [reprintId, setReprintId] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    reportOrders()
      .then((data) => { if (alive) { setRows(data); setErr('') } })
      .catch(() => { if (alive) setErr('Gagal memuat riwayat order.') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [reportOrders])

  const tax = Number(outlet?.tax_rate ?? 11)

  // Re-print a past order's receipt: mount an off-screen <Receipt> for that
  // order, then open the browser print dialog (scoped to the receipt). Reset
  // after printing so the scoped <style> unmounts and QR printing is unaffected.
  const reprintOrder = rows.find((o) => o.id === reprintId) || null
  useEffect(() => {
    if (!reprintId) return
    const t = window.setTimeout(() => {
      window.print()
      setReprintId('')
    }, 150)
    return () => window.clearTimeout(t)
  }, [reprintId])

  // CSV export of the current period — hand-rolled (no lib). Semicolon
  // separator + UTF-8 BOM so it opens correctly in Indonesian Excel.
  const exportCsv = () => {
    const esc = (v) => String(v ?? '').replace(/"/g, '""')
    const head = ['Waktu', 'Order', 'Meja', 'Pelanggan', 'Metode', 'Status Bayar', 'Status', 'Subtotal', 'Diskon', 'Service %', 'Service Rp', 'PPN', 'Total'].join(';')
    const rowsCsv = filtered.map((o) => {
      const discount = Number(o.discount || 0)
      const rate = o.service_rate ?? 0
      const base = Number(o.total || 0)
      const service = Math.round(base * rate / 100)
      const ppn = Math.round((base + service) * tax / 100)
      return [
        new Date(o.created_at).toLocaleString('id-ID'),
        o.num, o.table, o.customer,
        o.payment_method, o.payment_status, o.status,
        base + discount, discount, rate + '%', service, ppn, base + service + ppn,
      ].map(esc).join(';')
    }).join('\r\n')
    const blob = new Blob([`﻿${head}\r\n${rowsCsv}\r\n`], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `kasira-laporan-${period}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(a.href)
  }

  const startOf = (key) => {
    const now = new Date()
    if (key === 'today') { now.setHours(0, 0, 0, 0); return now }
    if (key === '7d') { now.setDate(now.getDate() - 7); now.setHours(0, 0, 0, 0); return now }
    if (key === '30d') { now.setDate(1); now.setHours(0, 0, 0, 0); return now }
    return null
  }

  const { filtered, revenue, count, avg, byMethod, byStatus, topItems } = useMemo(() => {
    const from = startOf(period)
    const list = from ? rows.filter((o) => new Date(o.created_at) >= from) : rows

    const rev = list.reduce((s, o) => s + (Number(o.total) || 0), 0)
    const n = list.length

    const method = { qris: { label: 'QRIS', sum: 0, n: 0 }, cash: { label: 'Tunai', sum: 0, n: 0 } }
    const status = {}
    const itemMap = new Map()

    for (const o of list) {
      const key = o.payment_method === 'cash' ? 'cash' : 'qris'
      method[key].sum += Number(o.total) || 0
      method[key].n += 1
      status[o.status] = (status[o.status] || 0) + 1

      for (const line of o.lines || []) {
        const { itemName, qty, unit } = parseLine(line)
        const cur = itemMap.get(itemName) || { name: itemName, qty: 0, unit, total: 0 }
        cur.qty += qty
        cur.total += qty * unit
        itemMap.set(itemName, cur)
      }
    }

    const top = [...itemMap.values()].sort((a, b) => b.total - a.total).slice(0, 6)
    return { filtered: list, revenue: rev, count: n, avg: n ? rev / n : 0, byMethod: method, byStatus: status, topItems: top }
  }, [rows, period])

  const payTotal = byMethod.qris.sum + byMethod.cash.sum
  const statusLabels = {
    'Menunggu pembayaran': 'Menunggu pembayaran',
    'Menunggu konfirmasi kasir': 'Menunggu kasir',
    Diterima: 'Diterima',
    'Sedang disiapkan': 'Disiapkan',
    'Siap diantar': 'Siap antar',
    Diantar: 'Diantar',
    Selesai: 'Selesai',
    Ditolak: 'Ditolak',
  }
  const statusList = Object.entries(byStatus).sort((a, b) => b[1] - a[1])

  return (
    <AppShell active="Laporan" breadcrumb="Laporan">
          <section className="page-heading">
            <div>
              <p className="eyebrow">ANALITIK PENJUALAN</p>
              <h1>Laporan</h1>
            </div>
            <div className="period-tabs" role="tablist" aria-label="Periode laporan">
              {PERIODS.map((p) => (
                <button type="button" role="tab" aria-selected={period === p.id} key={p.id} className={period === p.id ? 'selected' : ''} onClick={() => setPeriod(p.id)}>{p.label}</button>
              ))}
            </div>
            <button type="button" className="report-export" onClick={exportCsv}><Ic.download width="16" height="16" /> Unduh CSV</button>
          </section>

          {err && <div className="report-error">{err}</div>}
          {loading ? <div className="report-loading">Memuat laporan…</div> : (
            <>
              <section className="stats-row">
                <div className="stat-card"><div className="stat-icon avail"><Ic.report width="20" height="20" /></div><div><b>{money(revenue)}</b><span>Total penjualan</span></div></div>
                <div className="stat-card"><div className="stat-icon total"><Ic.inbox width="20" height="20" /></div><div><b>{count}</b><span>Jumlah order</span></div></div>
                <div className="stat-card"><div className="stat-icon out"><Ic.clock width="20" height="20" /></div><div><b>{money(Math.round(avg))}</b><span>Rata-rata / order</span></div></div>
              </section>

              <div className="report-grid">
                <section className="menu-panel report-panel">
                  <div className="panel-heading report-panel-head"><div><h2>Metode pembayaran</h2><p>Total per metode pada periode ini</p></div></div>
                  <div className="pay-breakdown">
                    {Object.entries(byMethod).map(([key, m]) => {
                      const pct = payTotal ? Math.round((m.sum / payTotal) * 100) : 0
                      return (
                        <div className="pay-row" key={key}>
                          <div className="pay-row-top"><span className={`pay-dot ${key}`} /><b>{m.label}</b><strong>{money(m.sum)}</strong></div>
                          <div className="pay-track"><span style={{ width: `${pct}%` }} className={key} /></div>
                          <small>{m.n} order · {pct}%</small>
                        </div>
                      )
                    })}
                  </div>
                </section>

                <section className="menu-panel report-panel">
                  <div className="panel-heading report-panel-head"><div><h2>Status order</h2><p>Distribusi status pada periode ini</p></div></div>
                  <div className="status-list">
                    {statusList.length === 0 && <div className="report-empty">Belum ada order pada periode ini.</div>}
                    {statusList.map(([key, val]) => (
                      <div className="status-row" key={key}>
                        <span className="status-dot-k done" /><span>{statusLabels[key] || key}</span><em>{val}</em>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <section className="menu-panel report-panel top-panel">
                <div className="panel-heading report-panel-head"><div><h2>Item terlaris</h2><p>Menu dengan omzet tertinggi pada periode ini</p></div></div>
                {topItems.length === 0 ? <div className="report-empty">Belum ada penjualan item pada periode ini.</div> : (
                  <div className="top-items">
                    {topItems.map((t, i) => (
                      <div className="top-item" key={t.name}>
                        <span className="top-rank">{i + 1}</span>
                        <div className="top-item-body"><b>{t.name}</b><span>{t.qty} terjual</span></div>
                        <strong>{money(t.total)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="menu-panel report-panel">
                <div className="panel-heading report-panel-head"><div><h2>Riwayat order</h2><p>{filtered.length} order · diurutkan terlama dulu</p></div></div>
                <div className="report-table">
                  <div className="report-table-head"><span>Waktu</span><span>Meja</span><span>Metode</span><span>Status</span><span className="right">Total</span><span>Aksi</span></div>
                  {filtered.map((o) => {
                    const disc = Number(o.discount || 0)
                    const sr = o.service_rate ?? 0
                    return (
                      <div className="report-row" key={o.id}>
                        <span className="report-cell time"><b>{fmtDate(o.created_at)}</b><small>{fmtTime(o.created_at)}</small></span>
                        <span className="report-cell">{o.table}</span>
                        <span className="report-cell"><span className={`payment-tag ${o.paymentTone}`}><i />{o.payment}</span></span>
                        <span className="report-cell"><span className={`status-chip ${o.status.toLowerCase().replace(/\s+/g, '-')}`}>{o.status}</span></span>
                        <span className="report-cell right"><strong>{money(o.total)}</strong>{(disc > 0 || sr > 0) && <span className="report-sub">{disc > 0 && `−${money(disc)}`}{disc > 0 && sr > 0 && ' · '}{sr > 0 && `service ${sr}%`}</span>}</span>
                        <span className="report-cell"><button type="button" className="report-row-print" aria-label={`Cetak ulang struk #${o.num}`} title={`Cetak ulang struk #${o.num}`} onClick={() => setReprintId(o.id)}><Ic.print width="15" height="15" /></button></span>
                      </div>
                    )
                  })}
                  {filtered.length === 0 && <div className="report-empty">Tidak ada order pada periode ini.</div>}
                </div>
              </section>

              {reprintOrder && <Receipt order={reprintOrder} outlet={outlet} staff={user} />}
            </>
          )}
    </AppShell>
  )
}

export default Report
