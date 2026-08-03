// Pengaturan — outlet profile stored in the shared store and persisted to
// Supabase. Used across the kasir chrome (outlet name in the sidebar top-up).
// Also hosts the guarded reset actions (reset all / end-of-day) with PIN.

import React, { useEffect, useState } from 'react'
import { useStore } from '../state.jsx'
import AppShell from '../AppShell.jsx'

function Settings() {
  const { outlet, updateOutlet, verifyResetPin, resetAll, resetDay } = useStore()
  const [form, setForm] = useState({ name: '', address: '', phone: '', open_time: '', close_time: '', tax_rate: 11 })
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  // Reset section state
  const [pin, setPin] = useState('')
  const [step, setStep] = useState('idle') // idle | confirm | done
  const [mode, setMode] = useState(null) // 'all' | 'day'
  const [resetBusy, setResetBusy] = useState(false)
  const [resetErr, setResetErr] = useState('')

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

  const openReset = (m) => {
    setMode(m)
    setPin('')
    setResetErr('')
    setStep('confirm')
  }

  const cancelReset = () => {
    setStep('idle')
    setMode(null)
    setPin('')
    setResetErr('')
  }

  const runReset = async () => {
    if (pin.trim().length < 4) { setResetErr('PIN minimal 4 digit.'); return }
    if (resetBusy) return
    setResetBusy(true)
    setResetErr('')
    try {
      const ok = await verifyResetPin(pin)
      if (!ok) { setResetErr('PIN salah. Ulangi kembali.'); setResetBusy(false); return }
      if (mode === 'all') await resetAll()
      else if (mode === 'day') await resetDay()
      setStep('done')
    } catch {
      setResetErr('Gagal melakukan reset. Coba lagi.')
    } finally { setResetBusy(false) }
  }

  const closeDone = () => {
    setStep('idle')
    setMode(null)
    setPin('')
    setResetErr('')
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

      {/* Reset transaksi */}
      <section className="menu-panel report-panel settings-reset">
        <div className="panel-heading report-panel-head"><div><h2>Reset transaksi</h2><p>Kembalikan aplikasi ke kondisi awal. Daftar menu tidak ikut dihapus.</p></div></div>

        {step === 'idle' && (
          <div className="reset-options">
            <div className="reset-option">
              <div><b>Reset semua aplikasi</b><span>Hapus permanen semua order & kosongkan semua meja. Aplikasi mulai dari nol — riwayat & laporan ikut hilang.</span></div>
              <button type="button" className="secondary-button danger-outline" onClick={() => openReset('all')}>Reset semua</button>
            </div>
            <div className="reset-option">
              <div><b>Reset batas akhir hari</b><span>Semua order aktif ditandai Selesai & meja dikosongkan. Order tetap tersimpan di riwayat — angka "hari ini" besok otomatis nol.</span></div>
              <button type="button" className="secondary-button" onClick={() => openReset('day')}>Tutup hari ini</button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="reset-confirm">
            <h3>{mode === 'all' ? 'Reset semua aplikasi?' : 'Tutup hari ini?'}</h3>
            <p>{mode === 'all'
              ? 'Semua order akan dihapus permanen dan semua meja dikosongkan. Tindakan ini tidak bisa dibatalkan.'
              : 'Semua order aktif akan ditandai Selesai dan semua meja dikosongkan. Riwayat order tetap tersimpan.'}</p>
            <label>Masukkan PIN untuk melanjutkan<input
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="PIN reset" /></label>
            {resetErr && <div className="reset-error">{resetErr}</div>}
            <div className="reset-confirm-actions">
              <button type="button" className="secondary-button" onClick={cancelReset} disabled={resetBusy}>Batal</button>
              <button type="button" className="reset-submit" onClick={runReset} disabled={resetBusy}>{resetBusy ? 'Memproses…' : (mode === 'all' ? 'Reset semua' : 'Tutup hari')}</button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="reset-done">
            <h3>✓ {mode === 'all' ? 'Reset selesai' : 'Hari ditutup'}</h3>
            <p>{mode === 'all' ? 'Semua order telah dihapus. Aplikasi mulai dari nol.' : 'Order aktif ditandai Selesai & meja dikosongkan.'}</p>
            <button type="button" className="primary-button" onClick={closeDone}>Oke</button>
          </div>
        )}
      </section>
    </AppShell>
  )
}

export default Settings