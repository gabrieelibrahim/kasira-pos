// SaaS platform — tenant list. Reads outlet_stats via RPC (gated on the
// super-admin PIN) and renders each tenant's live usage in a table.

import React, { useEffect, useState } from 'react'
import { supabase } from '../../supabase.js'
import { Ic } from '../../icons.jsx'

function TenantsList({ pin, onPinRequired }) {
  const [rows, setRows] = useState(null) // null = loading

  const load = async () => {
    try {
      const { data, error } = await supabase.rpc('outlet_stats', { p_super_pin: pin })
      if (error) throw error
      setRows(data || [])
    } catch {
      onPinRequired()
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  const open = (id) => { window.location.hash = '#/admin/tenants/' + id }

  const activeCount = (rows || []).filter((t) => !t.is_suspended).length

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SAAS PLATFORM</p>
          <h1>Tenants</h1>
          <p className="heading-sub">Semua outlet, satu dashboard. Klik baris untuk kelola tenant.</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => { window.location.hash = '#/admin/create' }}><Ic.plus width="15" height="15" /> Buat tenant</button>
      </div>

      {rows === null ? (
        <div className="report-empty">Memuat tenant…</div>
      ) : rows.length === 0 ? (
        <div className="report-empty">Belum ada tenant. Buat yang pertama untuk memulai.</div>
      ) : (
        <>
          <div className="stats-row cards-3">
            <div className="stat-card">
              <span className="stat-icon total"><Ic.tables width="20" height="20" /></span>
              <div><b>{rows.length}</b><span>Total tenant</span></div>
            </div>
            <div className="stat-card">
              <span className="stat-icon avail"><Ic.checkCircle width="20" height="20" /></span>
              <div><b>{activeCount}</b><span>Aktif</span></div>
            </div>
            <div className="stat-card">
              <span className="stat-icon out"><Ic.power width="20" height="20" /></span>
              <div><b>{rows.length - activeCount}</b><span>Ditangguhkan</span></div>
            </div>
          </div>

          <div className="tenant-table" role="table" aria-label="Daftar tenant">
            <div className="tenant-row tenant-head" role="row">
              <span role="columnheader">Outlet</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Staf</span>
              <span role="columnheader">Meja</span>
              <span role="columnheader">Menu</span>
            </div>
            {rows.map((t) => (
              <button type="button" key={t.id} className="tenant-row tenant-data" role="row" onClick={() => open(t.id)}>
                <span className="tenant-name" role="cell">
                  <b>{t.name}</b>
                  <small>{t.subscription_tier}{t.subscription_expires_at ? ` · s/d ${new Date(t.subscription_expires_at).toLocaleDateString('id-ID')}` : ''}</small>
                </span>
                <span role="cell"><span className={`tenant-pill ${t.is_suspended ? 'bad' : 'ok'}`}>{t.is_suspended ? 'Ditangguhkan' : 'Aktif'}</span></span>
                <span role="cell"><b className="num">{t.staff_count}</b></span>
                <span role="cell"><b className="num">{t.table_count}</b></span>
                <span role="cell"><b className="num">{t.menu_count}</b></span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}

export default TenantsList