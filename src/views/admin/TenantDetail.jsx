// SaaS platform — single tenant detail: profile, live stats, recent orders,
// and platform actions (suspend / activate / set reset PIN / delete).

import React, { useEffect, useState } from 'react'
import { money } from '../../state.jsx'
import { supabase } from '../../supabase.js'
import { Ic } from '../../icons.jsx'

async function fetchTenant(id, pin) {
  const { data, error } = await supabase.rpc('outlet_stats', { p_super_pin: pin })
  if (error) throw error
  return (data || []).find((t) => t.id === id) || null
}

function Stat({ label, value }) {
  return <div className="tenant-stat"><b>{value}</b><span>{label}</span></div>
}

function TenantDetail({ id, pin, onPinRequired }) {
  const [t, setT] = useState(null)       // tenant
  const [orders, setOrders] = useState(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const [delPin, setDelPin] = useState('')

  const flash = (m) => { setMsg(m); window.setTimeout(() => setMsg(''), 2600) }

  const load = async () => {
    try {
      const tenant = await fetchTenant(id, pin)
      setT(tenant)
    } catch { onPinRequired(); return }
    // Recent orders for this tenant (RLS is open; scoped by outlet_id).
    try {
      const start = new Date(); start.setHours(0, 0, 0, 0)
      const { data } = await supabase.from('orders')
        .select('*').eq('outlet_id', id)
        .gte('created_at', start.toISOString()).order('created_at', { ascending: false }).limit(12)
      setOrders(data || [])
    } catch { setOrders([]) }
  }

  useEffect(() => { setT(null); setOrders(null); load() }, [id]) // eslint-disable-line

  const act = async (fn, key, okMsg) => {
    if (busy) return
    setBusy(key)
    try {
      await fn()
      flash(okMsg)
      await load()
    } catch (e) {
      if (String(e?.message || '').toLowerCase().includes('super admin')) onPinRequired()
      else flash('Gagal: ' + (e?.message || 'terjadi kesalahan'))
    } finally { setBusy('') }
  }

  const doDelete = async () => {
    if (busy) return
    setBusy('delete')
    try {
      await supabase.rpc('delete_tenant', { p_outlet_id: id, p_super_pin: delPin })
      window.location.hash = '#/admin/tenants'
    } catch (e) {
      if (String(e?.message || '').toLowerCase().includes('super admin')) onPinRequired()
      else flash('Gagal menghapus.')
      setBusy('')
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SAAS PLATFORM</p>
          <h1>{t ? t.name : 'Memuat…'}</h1>
          <p className="heading-sub">{t ? `Tenant sejak ${new Date(t.created_at).toLocaleDateString('id-ID')} · tier ${t.subscription_tier}` : ''}</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => { window.location.hash = '#/admin/tenants' }}><Ic.back width="15" height="15" /> Semua tenant</button>
      </div>

      {t ? (
        <>
          <div className="admin-stats">
            <Stat label="Pendapatan total" value={money(t.total_revenue)} />
            <Stat label="Order total" value={String(t.order_count)} />
            <Stat label="Order hari ini" value={String(t.today_orders)} />
            <Stat label="Meja" value={String(t.table_count)} />
            <Stat label="Staf aktif" value={String(t.staff_count)} />
            <Stat label="Menu" value={String(t.menu_count)} />
          </div>

          <div className="admin-two-col">
            <div className="admin-card">
              <div className="section-title"><h3>Status & langganan</h3></div>
              <div className="tenant-row-simple">
                <span>Status</span>
                <span className={`tenant-pill ${t.is_suspended ? 'bad' : 'ok'}`}>{t.is_suspended ? 'Ditangguhkan' : 'Aktif'}</span>
              </div>
              <div className="tenant-row-simple"><span>Langganan</span><b>{t.subscription_tier}</b></div>
              <div className="tenant-row-simple"><span>Berakhir</span><b>{t.subscription_expires_at ? new Date(t.subscription_expires_at).toLocaleDateString('id-ID') : '—'}</b></div>
              <div className="tenant-actions">
                {t.is_suspended
                  ? <button type="button" className="secondary-button" disabled={busy} onClick={() => act(() => supabase.rpc('activate_tenant', { p_outlet_id: id, p_super_pin: pin }), 'act', 'Tenant diaktifkan.')}><Ic.check width="15" height="15" /> Aktifkan</button>
                  : <button type="button" className="reject-button" disabled={busy || t.is_suspended} onClick={() => act(() => supabase.rpc('suspend_tenant', { p_outlet_id: id, p_super_pin: pin }), 'act', 'Tenant ditangguhkan — staf tidak bisa login.')}><Ic.power width="14" height="14" /> Tangguhkan</button>}
                <button type="button" className="row-action danger" disabled={busy} onClick={() => setConfirmDel(true)}><Ic.trash width="14" height="14" /> Hapus</button>
              </div>
            </div>

            <div className="admin-card">
              <div className="section-title"><h3>Order terakhir hari ini</h3></div>
              {orders && orders.length === 0 ? (
                <p className="muted-p">Belum ada order hari ini.</p>
              ) : (
                <ul className="admin-orders">
                  {(orders || []).map((o) => (
                    <li key={o.id}>
                      <span>{o.table_label || 'Meja –'} · {o.status}</span>
                      <b>{money(o.total)}</b>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="report-empty">Memuat tenant…</div>
      )}

      {msg && <div className="toast" role="status">{msg}</div>}

      {confirmDel && (
        <div className="modal-backdrop" role="presentation">
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="del-tenant">
            <h2 id="del-tenant">Hapus tenant ini?</h2>
            <p>Semua data outlet ini (order, menu, meja, akun staf) akan dihapus PERMANEN. Tindakan ini tidak bisa dibatalkan.</p>
            <label>Konfirmasi dengan PIN Super Admin<input type="password" inputMode="numeric" maxLength={6} autoFocus value={delPin} onChange={(e) => setDelPin(e.target.value.replace(/\D/g, ''))} placeholder="PIN" /></label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" disabled={busy} onClick={() => setConfirmDel(false)}>Batal</button>
              <button type="button" className="reset-submit" disabled={busy || delPin.length < 4} onClick={doDelete}>{busy === 'delete' ? 'Menghapus…' : 'Hapus permanen'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default TenantDetail