// Login — the only "gate" in the app. Staff sign in with username + PIN;
// verification happens server-side via the login_staff RPC (bcrypt). The
// customer portal (#/meja?meja=N) is served separately and never lands here.

import React, { useState } from 'react'
import { useAuth, useStore } from './state.jsx'
import { supabase } from './supabase.js'

function Login() {
  const { login } = useAuth()
  const { outlet } = useStore()
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !pin || busy) return
    setBusy(true)
    setErr('')
    try {
      await login(username, pin)
    } catch {
      // Distinguish "no staff accounts at all" (seed not run) from a bad PIN.
      try {
        const { count } = await supabase.from('staff').select('id', { count: 'exact', head: true })
        if (count === 0) setErr('Belum ada akun staf — jalankan seed admin (username kasir, PIN 1234).')
        else setErr('Username atau PIN salah.')
      } catch {
        setErr('Gagal menghubungi server. Coba lagi.')
      }
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <div className="brand-mark">K</div>
          <div><strong>{outlet?.name || 'kasira'}</strong><span>CONTROL ROOM</span></div>
        </div>
        <h1>Masuk untuk memulai</h1>
        <p className="login-sub">Gunakan akun staf untuk membuka panel kasir.</p>
        <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="kasir" autoFocus autoComplete="username" /></label>
        <label>PIN<input
          type="password"
          inputMode="numeric"
          maxLength={6}
          autoComplete="current-password"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder="••••"
        /></label>
        {err && <div className="login-error">{err}</div>}
        <button type="submit" className="primary-button" disabled={busy || !username.trim() || !pin}>{busy ? 'Memeriksa…' : 'Masuk'}</button>
      </form>
    </main>
  )
}

export default Login