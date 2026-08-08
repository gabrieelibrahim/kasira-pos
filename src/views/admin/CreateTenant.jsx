// SaaS platform — create a new tenant. Provisions the outlet + admin staff +
// first tables in one server-side transaction (create_tenant RPC).

import React, { useState } from 'react'
import { supabase } from '../../supabase.js'
import { Ic } from '../../icons.jsx'

function Field({ label, value, onChange, type = 'text', inputMode, placeholder, autoFocus }) {
  return (
    <label>{label}<input
      type={type} inputMode={inputMode} value={value} autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
    /></label>
  )
}

function CreateTenant({ pin, onPinRequired }) {
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [pinText, setPinText] = useState('')
  const [adminName, setAdminName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setErr('')
    try {
      const { data, error } = await supabase.rpc('create_tenant', {
        p_name: name,
        p_admin_username: username,
        p_admin_pin: pinText,
        p_admin_name: adminName,
        p_super_pin: pin,
      })
      if (error) throw error
      window.location.hash = '#/admin/tenants/' + data.outlet_id
    } catch (errObj) {
      if (String(errObj?.message || '').toLowerCase().includes('super admin')) { onPinRequired(); return }
      setErr(errObj?.message || 'Gagal membuat tenant.')
      setBusy(false)
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SAAS PLATFORM</p>
          <h1>Buat tenant</h1>
          <p className="heading-sub">Outlet + akun admin + 5 meja awal dibuat sekaligus.</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => { window.location.hash = '#/admin/tenants' }}><Ic.back width="15" height="15" /> Kembali</button>
      </div>

      <div className="admin-card">
        <form className="menu-form" onSubmit={submit}>
          <Field label="Nama outlet" value={name} onChange={setName} placeholder="Contoh: Warung Padang Sari" autoFocus />
          <div className="form-grid">
            <Field label="Username admin" value={username} onChange={(v) => setUsername(v.toLowerCase().trim())} placeholder="admin_wps" />
            <Field label="PIN admin (4-6 digit)" value={pinText} onChange={(v) => setPinText(v.replace(/\D/g, ''))} type="password" inputMode="numeric" />
          </div>
          <Field label="Nama admin (opsional)" value={adminName} onChange={setAdminName} placeholder="Nama lengkap admin" />
          {err && <div className="reset-error">{err}</div>}
          <div className="modal-actions">
            <button type="button" className="secondary-button" disabled={busy} onClick={() => { window.location.hash = '#/admin/tenants' }}>Batal</button>
            <button type="submit" className="primary-button" disabled={busy || !name.trim() || !username.trim() || pinText.length < 4}>{busy ? 'Membuat…' : 'Buat tenant'}</button>
          </div>
        </form>
      </div>
    </>
  )
}

export default CreateTenant