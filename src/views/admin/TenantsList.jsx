// SaaS platform — tenant list. Reads outlet_stats via RPC (gated on the
// super-admin PIN) and renders each tenant's live usage in a table.

import React, { useEffect, useState } from 'react'
import { money } from '../../state.jsx'
import { supabase } from '../../supabase.js'
import { Ic } from '../../icons.jsx'

function TenantsList({ pin, onPinRequired }) {
  const [rows, setRows] = useState(null) // null = loading
  const [err, setErr] = useState('')

  const load = async () => {
    try {
      const { data, error } = await supabase.rpc('outlet_stats', { p_super_pin: pin })
      if (error) throw error
      setRows(data || [])
      setErr('')
    } catch (e) {
      onPinRequired()
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  const open = (id) => { window.location.hash = '#/admin/tenants/' + id }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SAAS PLATFORM</p>
          <h1>Tenants</h1>
          <p className="heading-sub">Semua outlet kasira, satu dashboard. Klik baris untuk kelola.</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => { window.location.hash = '#/admin/create' }}><Ic.plus width="15" height="15" /> Buat tenant</button>
      </div>

      {rows === null ? (
        <div className="report-empty">Memuat tenant…</div>
      ) : rows.length === 0 ? (
        <div className="report-empty">Belum ada tenant. Buat yang pertama untuk memulai.</div>
      ) : (
        <div className="tenant-table" role="table" aria-label="Daftar tenant">
          <div className="tenant-row tenant-head" role="row">
            <span role="columnheader">Outlet</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Staf</span>
            <span role="columnheader">Meja</span>
            <span role="columnheader">Order</span>
            <span role="columnheader">Hari ini</span>
            <span role="columnheader">Total</span>
          </div>
          {rows.map((t) => (
            <button type="button" key={t.id} className="tenant-row tenant-data" role="row" onClick={() => open(t.id)}>
              <span className="tenant-name" role="cell">
                <b>{t.name}</b>
                <small>{t.subscription_tier}{t.subscription_expires_at ? ` · s/d ${new Date(t.subscription_expires_at).toLocaleDateString('id-ID')}` : ''}</small>
              </span>
              <span role="cell"><span className={`tenant-pill ${t.is_suspended ? 'bad' : 'ok'}`}>{t.is_suspended ? 'Ditangguhkan' : 'Aktif'}</span></span>
              <span role="cell"><b>{t.staff_count}</b></span>
              <span role="cell"><b>{t.table_count}</b></span>
              <span role="cell"><b>{t.order_count}</b></span>
              <span role="cell"><b>{String(t.today_orders)}</b></span>
              <span role="cell" className="tenant-rev">{money(t.total_revenue)}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

export default TenantsList