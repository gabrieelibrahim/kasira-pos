// Customer QR portal — scan a table's QR to browse the menu, build a
// cart, choose QRIS or cash-at-cashier, and track the order status.
// Uses the shared store so a submitted order reaches the cashier and KDS.

import React, { useEffect, useMemo, useState } from 'react'
import { money, STATUS, useStore } from './state.jsx'
import { Ic } from './icons.jsx'
import { storageUrl } from './supabase.js'

const CATEGORIES = ['Semua', 'Makanan', 'Minuman', 'Camilan']

// Menu comes ONLY from the tenant's DB (via the shared store). There is no
// hardcoded fallback — an outlet with zero menu items must show an empty
// state, not a baked-in list that looks like another tenant's menu.

// Table comes from the URL hash (#/meja?meja=5), not the query string.
const tableFromParams = () => {
  const q = new URLSearchParams(window.location.hash.split('?')[1] || '')
  return q.get('meja') || q.get('table') || '01'
}

// Tenant comes from the URL hash as `outlet=<uuid>` (added this release). It's
// how a public (no-session) portal knows which tenant's menu/orders to load.
const outletFromParams = () => {
  const q = new URLSearchParams(window.location.hash.split('?')[1] || '')
  return q.get('outlet') || null
}

function MenuCard({ item, onAdd }) {
  const name = item.name
  const price = Number(item.price || 0)
  const desc = item.description || item.desc || ''
  const mods = item.modifier || []
  const [mod, setMod] = useState(mods.length ? mods[0] : '')
  return (
    <div className="menu-card">
      {item.image ? <img className="menu-thumb-img-lg" src={storageUrl(item.image)} alt={name} loading="lazy" /> : <div className="menu-thumb" aria-hidden="true">{name.slice(0, 1)}</div>}
      <div className="menu-body">
        <h3>{name}</h3>
        <p>{desc}</p>
        <span className="menu-price">{money(price)}</span>
        {mods.length > 0 && (
          <label className="menu-modifier">
            <select value={mod} onChange={(e) => setMod(e.target.value)} aria-label={`Pilihan tambahan ${name}`}>
              {mods.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        )}
      </div>
      <button type="button" className="menu-add" aria-label={`Tambah ${name}`} onClick={() => onAdd(item, mods.length ? mod : '')}><Ic.plus width="18" height="18" /></button>
    </div>
  )
}

function Customer() {
  const { orders, menu, submitCustomerOrder, resolveOutlet } = useStore()
  const [table] = useState(tableFromParams)
  const [route, setRoute] = useState('menu') // menu | cart | checkout | order
  const [cat, setCat] = useState('Semua')
  const [cart, setCart] = useState([])
  const [payment, setPayment] = useState('qris')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [placedId, setPlacedId] = useState(null)
  // Public portal has no session → the store outlet must come from the URL.
  const [outletResolved, setOutletResolved] = useState(false)
  const [outletOk, setOutletOk] = useState(true)
  const tableName = `Meja ${table}`

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const ok = await resolveOutlet(outletFromParams())
        if (mounted) { setOutletOk(ok); setOutletResolved(true) }
      } catch {
        if (mounted) { setOutletOk(false); setOutletResolved(true) }
      }
    })()
    return () => { mounted = false }
  }, [])

  // customer order = the order this session just placed
  const myOrder = useMemo(() => orders.find((o) => o.id === placedId) || null, [orders, placedId])

  useEffect(() => { window.scrollTo(0, 0) }, [route])

  // Menu comes only from the tenant's DB. DB items use `category`; normalize
  // so the category filter works. Unavailable items stay hidden.
  const catOf = (m) => m.category || m.cat || 'Lainnya'
  const visibleMenu = menu.filter((m) => cat === 'Semua' || catOf(m) === cat)
    .filter((m) => m.available !== false)

  const addItem = (item, modifier = '') => {
    setCart((prev) => {
      const key = (l) => l.id + '|' + (l.modifier || '')
      const found = prev.find((l) => key(l) === key({ id: item.id, modifier }))
      if (found) return prev.map((l) => key(l) === key({ id: item.id, modifier }) ? { ...l, qty: l.qty + 1 } : l)
      return [...prev, { ...item, qty: 1, modifier }]
    })
  }

  const changeQty = (id, modifier, delta) => {
    setCart((prev) => prev.flatMap((l) => {
      if (l.id !== id || (l.modifier || '') !== (modifier || '')) return [l]
      const qty = l.qty + delta
      return qty <= 0 ? [] : [{ ...l, qty }]
    }))
  }

  const subtotal = cart.reduce((sum, l) => sum + l.price * l.qty, 0)

  const submit = async () => {
    if (cart.length === 0 || submitting) return
    setSubmitting(true)
    // Route the whole order to the kitchen station: all drinks → Bar, anything
    // else → Dapur. Mixed carts go to Dapur so food and drinks leave together.
    const station = cart.every((l) => (l.category || l.cat || 'Makanan') === 'Minuman') ? 'bar' : 'dapur'
    try {
      const id = await submitCustomerOrder({
        table: tableName,
        items: cart.reduce((n, l) => n + l.qty, 0),
        total: subtotal,
        paymentTone: payment === 'qris' ? 'paid' : 'cash',
        station,
        customer: 'Pelanggan meja',
        note: note.trim(),
        lines: cart.map((l) => [`${l.qty}× ${l.name}${l.modifier ? ` (${l.modifier})` : ''}`, money(l.price * l.qty), '']),
      })
      setPlacedId(id)
      setCart([])
      setRoute('order')
    } catch (error) {
      setRoute('cart')
    } finally {
      setSubmitting(false)
    }
  }

  // Resolve the tenant from the QR `outlet` param before rendering anything.
  // Keeps loading until resolved, then shows a clear error if the outlet id is
  // bogus (a hand-typed URL), otherwise renders the menu as usual.
  if (!outletResolved) {
    return <main className="customer"><div className="customer-shell"><div className="order-track"><span className="live-dot" /><div><h1>{tableName}</h1><p>Memuat menu…</p></div></div></div></main>
  }
  if (!outletOk) {
    return (
      <main className="customer">
        <div className="customer-shell">
          <div className="order-track"><span className="live-dot" /><div><h1>Menu tidak ditemukan</h1><p>{tableName}</p></div></div>
          <section className="track-lines">
            <p className="muted-p">Restoran ini tidak ditemukan. Periksa kembali kode QR atau minta bantuan staf.</p>
          </section>
        </div>
      </main>
    )
  }

  if (route === 'order') {
    const done = myOrder && [STATUS.DONE, STATUS.REJECTED].includes(myOrder.status)
    return (
      <main className="customer">
        <div className="customer-shell">
          <div className="order-track">
            <span className="live-dot" />
            <div>
              <h1>Pesanan kamu</h1>
              <p>{tableName} · {myOrder ? '#' + myOrder.num : 'Memuat…'}</p>
            </div>
          </div>
          {myOrder && (
            <div className="track-status">
              <span className={`status-dot-k ${myOrder.status.toLowerCase().replace(/\s+/g, '-')}`} />
              <div>
                <b>{myOrder.status}</b>
                <p>Perbarui otomatis saat kasir atau dapur mengubah status.</p>
              </div>
            </div>
          )}
          <section className="track-lines">
            {myOrder ? myOrder.lines.map(([name, price, noteLine]) => (
              <div className="line-item" key={name}>
                <div><b>{name}</b>{noteLine && <span>{noteLine}</span>}</div>
                <strong>{price}</strong>
              </div>
            )) : <p className="muted-p">Memuat pesanan…</p>}
          </section>
          {myOrder && (
            <div className="track-total">
              <span>Total</span><strong>{money(myOrder.total)}</strong>
            </div>
          )}
          <div className="track-actions">
            <button type="button" className="secondary-button" onClick={() => setRoute('menu')}><Ic.plus width="16" height="16" /> Pesan lagi</button>
            {done && <button type="button" className="primary-button" onClick={() => { setPlacedId(null); setRoute('menu'); setCart([]) }}>Selesai</button>}
          </div>
        </div>
      </main>
    )
  }

  if (route === 'cart') {
    return (
      <main className="customer">
        <div className="customer-shell">
          <header className="customer-header">
            <button type="button" className="back-button" aria-label="Kembali ke menu" onClick={() => setRoute('menu')}><Ic.back width="20" height="20" /></button>
            <div><h1>Keranjang</h1><p>{tableName} · {cart.reduce((n, l) => n + l.qty, 0)} item</p></div>
          </header>
          {cart.length === 0 ? (
            <div className="cart-empty">
              <div className="empty-icon"><Ic.plus width="26" height="26" /></div>
              <b>Keranjang masih kosong</b>
              <p>Tambahkan menu dari daftar pesanan.</p>
              <button type="button" className="secondary-button" onClick={() => setRoute('menu')}>Pilih menu</button>
            </div>
          ) : (
            <>
              <section className="cart-list">
                {cart.map((l) => (
                  <div className="cart-item" key={l.id}>
                    <div className="cart-item-body">
                      <b>{l.name}</b>
                      {l.modifier && <small className="cart-modifier">{l.modifier}</small>}
                      <span>{money(l.price)}</span>
                    </div>
                    <div className="qty-stepper">
                      <button type="button" aria-label={`Kurangi ${l.name}`} onClick={() => changeQty(l.id, l.modifier, -1)}><Ic.minus width="15" height="15" /></button>
                      <em>{l.qty}</em>
                      <button type="button" aria-label={`Tambah ${l.name}`} onClick={() => changeQty(l.id, l.modifier, 1)}><Ic.plus width="15" height="15" /></button>
                    </div>
                    <strong className="cart-line-total">{money(l.price * l.qty)}</strong>
                  </div>
                ))}
              </section>
              <div className="checkout-summary">
                <div className="line-item"><div><b>Subtotal</b></div><strong>{money(subtotal)}</strong></div>
                <div className="line-item"><div><b>Pajak 11%</b></div><strong>{money(Math.round(subtotal * 0.11))}</strong></div>
                <div className="checkout-total"><span>Total</span><strong>{money(subtotal + Math.round(subtotal * 0.11))}</strong></div>
              </div>
              <button type="button" className="primary-button checkout-submit" onClick={() => setRoute('checkout')}>
                Lanjut ke pembayaran · {money(subtotal + Math.round(subtotal * 0.11))}
              </button>
            </>
          )}
        </div>
      </main>
    )
  }

  if (route === 'checkout') {
    return (
      <main className="customer">
        <div className="customer-shell">
          <header className="customer-header">
            <button type="button" className="back-button" aria-label="Kembali ke keranjang" onClick={() => setRoute('cart')}><Ic.back width="20" height="20" /></button>
            <div><h1>Pembayaran</h1><p>{tableName}</p></div>
          </header>
          <section className="checkout-summary">
            <div className="line-item"><div><b>Subtotal</b></div><strong>{money(subtotal)}</strong></div>
            <div className="line-item"><div><b>Pajak 11%</b></div><strong>{money(Math.round(subtotal * 0.11))}</strong></div>
            <div className="checkout-total"><span>Total</span><strong>{money(subtotal + Math.round(subtotal * 0.11))}</strong></div>
          </section>
          <section className="checkout-methods">
            <h2>Metode pembayaran</h2>
            <label className={`pay-option ${payment === 'qris' ? 'selected' : ''}`}>
              <input type="radio" name="pay" checked={payment === 'qris'} onChange={() => setPayment('qris')} />
              <div><b>QRIS</b><span>Bayar langsung dari aplikasi pembayaran</span></div>
            </label>
            <label className={`pay-option ${payment === 'cash' ? 'selected' : ''}`}>
              <input type="radio" name="pay" checked={payment === 'cash'} onChange={() => setPayment('cash')} />
              <div><b>Tunai di kasir</b><span>Bayar setelah pesanan diproses</span></div>
            </label>
          </section>
          <section className="checkout-note">
            <h2>Catatan</h2>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Contoh: tanpa bawang, pisahkan sambal" />
          </section>
          <button type="button" className="primary-button checkout-submit" onClick={submit} disabled={cart.length === 0}>
            Kirim pesanan · {money(subtotal + Math.round(subtotal * 0.11))}
          </button>
        </div>
      </main>
    )
  }

  // cart or menu — the default menu route
  const menuPortal = (
    <main className="customer">
      <header className="customer-top">
        <div className="customer-brand"><div className="brand-mark">K</div><div><strong>kasira</strong><small>{tableName}</small></div></div>
      </header>

      <section className="customer-hero">
        <h1>Selamat datang</h1>
        <p>Pilih menu favorit kamu dan pesan tanpa menunggu antrean.</p>
      </section>

      <nav className="cat-nav" aria-label="Kategori menu">
        {CATEGORIES.map((c) => <button key={c} className={cat === c ? 'selected' : ''} onClick={() => setCat(c)}>{c}</button>)}
      </nav>

      {visibleMenu.length === 0 ? (
        <div className="report-empty">Belum ada menu. Hubungi staf untuk memesan.</div>
      ) : (
        <section className="menu-grid">
          {visibleMenu.map((item) => <MenuCard key={item.id} item={item} onAdd={addItem} />)}
        </section>
      )}

      {cart.length > 0 && (
        <div className="cart-bar">
          <button type="button" className="primary-button" onClick={() => setRoute('cart')}>
            Lihat keranjang · {cart.reduce((n, l) => n + l.qty, 0)} item · {money(subtotal)}
          </button>
        </div>
      )}
    </main>
  )

  return menuPortal
}

export default Customer