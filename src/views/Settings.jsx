// Pengaturan — outlet profile stored in the shared store and persisted to
// Supabase. Used across the kasir chrome (outlet name in the sidebar top-up).
// Also hosts the guarded reset actions (reset all / end-of-day) with PIN, and
// staff management (admin): add cashiers, toggle active, change PINs.

import React, { useEffect, useState } from 'react'
import { useAuth, useStore } from '../state.jsx'
import { ROLE_LABELS, ROLE_ORDER } from '../permissions.js'
import AppShell from '../AppShell.jsx'
import { Ic } from '../icons.jsx'

function Settings() {
  const { outlet, updateOutlet, verifyResetPin, resetAll, resetDay, staffList, saveStaff, toggleStaff, changeStaffPin, changeResetPin } = useStore()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [form, setForm] = useState({ name: '', address: '', phone: '', open_time: '', close_time: '', tax_rate: 11 })
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  // Staff section state
  const [staff, setStaff] = useState([])
  const [staffErr, setStaffErr] = useState('')
  const [staffNotice, setStaffNotice] = useState('')
  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', username: '', pin: '', role: 'kasir' })
  const [addBusy, setAddBusy] = useState(false)
  const [pinFor, setPinFor] = useState(null) // staff row id being PIN-changed, or 'reset' for the reset PIN
  const [pinValue, setPinValue] = useState('')
  const [pinBusy, setPinBusy] = useState(false)

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

  // Load staff list when the admin opens Settings.
  useEffect(() => {
    if (!isAdmin) return
    let alive = true
    staffList().then((d) => { if (alive) setStaff(d) }).catch(() => { if (alive) setStaffErr('Gagal memuat daftar staf.') })
    return () => { alive = false }
  }, [isAdmin, staffList])

  const staffFlash = (msg) => { setStaffNotice(msg); window.setTimeout(() => setStaffNotice(''), 2400) }

  const doAddStaff = async (e) => {
    e.preventDefault()
    if (!addForm.name.trim() || !addForm.username.trim() || addForm.pin.length < 4) return
    setAddBusy(true)
    try {
      await saveStaff({ name: addForm.name.trim(), username: addForm.username.trim(), pin: addForm.pin, role: addForm.role })
      setAdding(false)
      setAddForm({ name: '', username: '', pin: '', role: 'kasir' })
      staffFlash(`${ROLE_LABELS[addForm.role] || addForm.role} ditambahkan.`)
      setStaff(await staffList())
    } catch { staffFlash('Gagal menambah kasir (username mungkin sudah dipakai).') } finally { setAddBusy(false) }
  }

  const doToggle = async (s) => {
    try { await toggleStaff(s.id, !s.active); staffFlash(s.active ? `${s.name} dinonaktifkan.` : `${s.name} diaktifkan.`); setStaff(await staffList()) }
    catch { staffFlash('Gagal mengubah status staf.') }
  }

  const openPin = (target) => { setPinFor(target); setPinValue(''); }
  const closePin = () => { setPinFor(null); setPinValue('') }

  const doPin = async (e) => {
    e.preventDefault()
    if (pinValue.length < 4) return
    setPinBusy(true)
    try {
      if (pinFor === 'reset') await changeResetPin(pinValue)
      else await changeStaffPin(pinFor, pinValue)
      closePin()
      staffFlash(pinFor === 'reset' ? 'PIN reset transaksi diganti.' : 'PIN staf diganti.')
    } catch { staffFlash('Gagal mengganti PIN.') } finally { setPinBusy(false) }
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

      {/* Manajemen staf (admin only) */}
      {isAdmin && <section className="menu-panel report-panel settings-reset">
        <div className="panel-heading report-panel-head">
          <div><h2>Manajemen staf</h2><p>Kelola akun kasir, status aktif, dan PIN.</p></div>
          <button type="button" className="primary-button" style={{ width: 'auto', padding: '0 16px' }} onClick={() => setAdding(true)}><Ic.plus width="15" height="15" /> Tambah kasir</button>
        </div>
        {staffErr && <div className="reset-error">{staffErr}</div>}
        <div className="staff-list">
          {staff.map((s) => (
            <div className="staff-row" key={s.id}>
              <div className="staff-avatar">{s.name.slice(0, 1).toUpperCase()}</div>
              <div className="staff-main"><b>{s.name}</b><span>@{s.username} · {ROLE_LABELS[s.role] || s.role}</span></div>
              {s.role !== 'admin' && (
                <button type="button" className="row-action" onClick={() => openPin(s.id)}>Ganti PIN</button>
              )}
              {s.role === 'admin' && <span className="staff-you">Akun kamu</span>}
              {s.role !== 'admin' && (
                <label className="switch-wrap" title={s.active ? 'Aktif' : 'Nonaktif'}>
                  <input type="checkbox" checked={!!s.active} onChange={() => doToggle(s)} aria-label={`Aktifkan ${s.name}`} />
                  <span className={s.active ? 'switch on' : 'switch off'}><i /></span>
                </label>
              )}
            </div>
          ))}
        </div>
        <div className="reset-option">
          <div><b>PIN reset transaksi</b><span>PIN yang diminta saat mereset semua aplikasi / menutup hari. Bisa diganti kapan saja.</span></div>
          <button type="button" className="secondary-button" onClick={() => openPin('reset')}>Ganti PIN reset</button>
        </div>
      </section>}

      {/* Reset transaksi (admin only) */}
      {isAdmin && <section className="menu-panel report-panel settings-reset">
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
      </section>}

      {staffNotice && <div className="toast" role="status"><span className="toast-check"><Ic.check width="14" height="14" /></span>{staffNotice}</div>}

      {adding && (
        <div className="modal-backdrop" role="presentation">
          <form className="confirm-modal menu-form" role="dialog" aria-modal="true" aria-labelledby="add-staff-title" onSubmit={doAddStaff}>
            <h2 id="add-staff-title">Tambah kasir</h2>
            <label>Nama<input autoFocus value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} placeholder="Contoh: Raka" required /></label>
            <label>Username<input value={addForm.username} onChange={(e) => setAddForm({ ...addForm, username: e.target.value.toLowerCase() })} placeholder="Contoh: raka" required /></label>
            <label>PIN (4-6 digit)<input type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={addForm.pin} onChange={(e) => setAddForm({ ...addForm, pin: e.target.value.replace(/\D/g, '') })} placeholder="1234" required /></label>
            <label>Role<select value={addForm.role} onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}>{ROLE_ORDER.filter((r) => r !== 'admin').map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => { setAdding(false); setAddForm({ name: '', username: '', pin: '' }) }}>Batal</button>
              <button type="submit" className="primary-button" disabled={addBusy || !addForm.name.trim() || !addForm.username.trim() || addForm.pin.length < 4}>{addBusy ? 'Menyimpan…' : 'Tambah kasir'}</button>
            </div>
          </form>
        </div>
      )}

      {pinFor && (
        <div className="modal-backdrop" role="presentation">
          <form className="confirm-modal menu-form" role="dialog" aria-modal="true" aria-labelledby="pin-title" onSubmit={doPin}>
            <h2 id="pin-title">Ganti PIN {pinFor === 'reset' ? 'reset transaksi' : 'staf'}</h2>
            <label>PIN baru (4-6 digit)<input autoFocus type="password" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={pinValue} onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ''))} placeholder="1234" required /></label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={closePin} disabled={pinBusy}>Batal</button>
              <button type="submit" className="primary-button" disabled={pinBusy || pinValue.length < 4}>{pinBusy ? 'Menyimpan…' : 'Ganti PIN'}</button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  )
}

export default Settings