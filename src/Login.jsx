// Login — the only "gate" in the app. Staff sign in with username + PIN via
// Supabase Auth (email = <username>@kasira.local, password = PIN). The
// customer portal (#/meja?meja=N) is served separately and never lands here.

import React, { useState } from 'react'
import { useAuth, useStore } from './state.jsx'
import { ROLE_HOME } from './permissions.js'

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
      const session = await login(username, pin)
      // Land the session on the role's home view — Dapur goes straight to the
      // KDS, Pelayan to Order masuk, Pemilik to Ringkasan, etc.
      window.location.hash = '#/' + (ROLE_HOME[session?.role] || '')
    } catch (e) {
      // Supabase Auth returns a single error for unknown user / wrong PIN.
      const code = e?.code || e?.status || (e?.message || '').toLowerCase()
      if (/invalid_credentials|invalid login/i.test(code)) setErr('Username atau PIN salah.')
      else setErr('Gagal masuk. Coba lagi.')
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