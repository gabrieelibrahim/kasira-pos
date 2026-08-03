// Pengaturan — outlet profile stored in the shared store and persisted to
// Supabase. Used across the kasir chrome (outlet name in the sidebar top-up).

import React, { useEffect, useState } from 'react'
import { useStore } from '../state.jsx'
import AppShell from '../AppShell.jsx'

function Settings() {
  const { outlet, updateOutlet } = useStore()
  const [form, setForm] = useState({ name: '', address: '', phone: '', open_time: '', close_time: '', tax_rate: 11 })
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (outlet) setForm({
      name: outlet.name || '',
      address: outlet.address || '',
      phone: outlet.phone || '',
      open_time: outlet.open_time || '',
      close_time: outlet.close_time || '',
      tax_rate: Number(outlet.tax_rate ?? 11),
    })
  }, [outlet])

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false) }

  const save = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setBusy(true)
    try {
      await updateOutlet({ name: form.name.trim(), address: form.address.trim(), phone: form.phone.trim(), open_time: form.open_time.trim(), close_time: form.close_time.trim(), tax_rate: Number(form.tax_rate) || 11 })
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2200)
    } catch { /* surface a toast */ } finally { setBusy(false) }
  }

  return (
    <AppShell active="Pengaturan" breadcrumb="Pengaturan">
      <section className="page-heading">
        <div>
          <p className="eyebrow">KONFIGURASI OUTLET</p>
          <h1>Pengaturan</h1>
          <p className="heading-sub">Profil outlet, jam operasional, dan pajak yang dipakai di seluruh modul.</p>
        </div>
      </section>

      <form className="settings-form" onSubmit={save}>
        <section className="menu-panel report-panel">
          <div className="panel-heading report-panel-head"><div><h2>Profil outlet</h2><p>Nama & identitas yang tampil di aplikasi</p></div></div>
          <div className="settings-fields">
            <label className="field-wide">Nama outlet<input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Contoh: Outlet Senopati" required /></label>
            <label className="field-wide">Alamat<input value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Jl. Senopati No. 8, Jakarta" /></label>
            <label>Telepon<input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="08xx-xxxx-xxxx" /></label>
          </div>
        </section>

        <section className="menu-panel report-panel">
          <div className="panel-heading report-panel-head"><div><h2>Operasional</h2><p>Jam buka & pajak untuk perhitungan order</p></div></div>
          <div className="settings-fields">
            <label>Jam buka<input value={form.open_time} onChange={(e) => set('open_time', e.target.value)} placeholder="10:00" /></label>
            <label>Jam tutup<input value={form.close_time} onChange={(e) => set('close_time', e.target.value)} placeholder="22:00" /></label>
            <label>Pajak (%)<input type="number" min="0" max="100" value={form.tax_rate} onChange={(e) => set('tax_rate', e.target.value)} /></label>
          </div>
        </section>

        <div className="settings-actions">
          <button type="submit" className="primary-button" disabled={busy || !form.name.trim()}>{busy ? 'Menyimpan…' : 'Simpan pengaturan'}</button>
          {saved && <span className="settings-saved">✓ Tersimpan</span>}
        </div>
      </form>
    </AppShell>
  )
}

export default Settings