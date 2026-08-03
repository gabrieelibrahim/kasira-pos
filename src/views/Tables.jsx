// Portal meja (kasir) — live table monitoring. Occupancy is derived from
// orders (pay / eating / done) plus the persisted spot status. A done table
// waits for staff to tap "Tandai kosong" after cleaning, then flips to empty.

import React, { useMemo, useState } from 'react'
import { deriveTableStatus, money, useStore } from '../state.jsx'
import AppShell from '../AppShell.jsx'

const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—'
const TONES = [
  { tone: 'empty', label: 'Kosong' },
  { tone: 'occupied', label: 'Makan' },
  { tone: 'pay', label: 'Bayar' },
  { tone: 'done', label: 'Selesai / perlu dibersihkan' },
]

function Tables() {
  const { tables, orders, clearTable } = useStore()
  const [selId, setSelId] = useState(null)
  const [busy, setBusy] = useState(false)

  const derived = useMemo(() => deriveTableStatus(tables, orders), [tables, orders])
  const counts = useMemo(() => derived.reduce((acc, t) => { acc[t.tone] = (acc[t.tone] || 0) + 1; return acc }, {}), [derived])
  const selected = derived.find((t) => t.id === selId) || derived[0] || null

  const clear = async () => {
    if (!selected || busy) return
    setBusy(true)
    try { await clearTable(selected.id) } finally { setBusy(false) }
  }

  return (
    <AppShell active="Portal meja" breadcrumb="Portal meja">
      <section className="page-heading">
        <div><p className="eyebrow">MONITORING MEJA</p><h1>Portal meja</h1><p className="heading-sub">Status meja dihitung realtime dari order. Meja selesai menunggu konfirmasi bersih oleh petugas.</p></div>
      </section>

      <section className="table-panel">
        <div className="panel-heading"><div><h2>Status meja</h2><p>{derived.length} meja · {counts.occupied || 0} makan · {counts.pay || 0} bayar · {counts.done || 0} perlu dibersihkan</p></div></div>
        <div className="table-grid">
          {derived.map((t) => (
            <button type="button" key={t.id} className={`table-cell ${t.tone} is-clickable ${selected?.id === t.id ? 'selected' : ''}`} onClick={() => setSelId(t.id)}>
              <span>{t.number}</span><small>{t.spotLabel}</small>
            </button>
          ))}
        </div>
        <div className="tables-legend">
          {TONES.map((x) => <span key={x.tone}><i className={`legend-dot ${x.tone}`} />{x.label}</span>)}
        </div>
      </section>

      {selected && (
        <section className="menu-panel report-panel">
          <div className="panel-heading report-panel-head">
            <div><h2>{selected.label}</h2><p>Status: {selected.spotLabel} · {selected.orders.length} order terakhir</p></div>
            {selected.tone === 'done' && (
              <button type="button" className="primary-button" disabled={busy} onClick={clear} style={{ width: 'auto', padding: '0 18px' }}>{busy ? 'Memproses…' : 'Tandai kosong'}</button>
            )}
            {selected.tone !== 'done' && selected.tone !== 'empty' && (
              <button type="button" className="secondary-button" onClick={() => window.location.hash = '#/kasir'}>Buka di kasir</button>
            )}
          </div>
          {selected.orders.length === 0 ? (
            <div className="report-empty">Tidak ada order untuk meja ini.</div>
          ) : (
            <div className="report-table">
              <div className="report-table-head"><span>Waktu</span><span>ID</span><span>Metode</span><span>Status</span><span className="right">Total</span></div>
              {selected.orders.map((o) => (
                <div className="report-row" key={o.id}>
                  <span className="report-cell time"><b>{fmtTime(o.created_at)}</b><small>{o.items} item</small></span>
                  <span className="report-cell">{o.id}</span>
                  <span className="report-cell"><span className={`payment-tag ${o.paymentTone}`}><i />{o.payment}</span></span>
                  <span className="report-cell"><span className={`status-chip ${o.status.toLowerCase().replace(/\s+/g, '-')}`}>{o.status}</span></span>
                  <span className="report-cell right"><strong>{money(o.total)}</strong></span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </AppShell>
  )
}

export default Tables
