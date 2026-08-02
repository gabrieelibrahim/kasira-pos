// Customer QR portal — scan a table's QR to browse the menu, build a
// cart, choose QRIS or cash-at-cashier, and track the order status.
// Uses the shared store so a submitted order reaches the cashier and KDS.

import React, { useEffect, useMemo, useState } from 'react'
import { money, STATUS, useStore } from './state.jsx'

const CATEGORIES = ['Semua', 'Makanan', 'Minuman', 'Camilan']

// Table comes from the URL hash (#/meja?meja=5), not the query string.
const tableFromParams = () => {
  const q = new URLSearchParams(window.location.hash.split('?')[1] || '')
  return q.get('meja') || q.get('table') || '01'
}

const MENU = [
  { id: 'nasi-goreng', name: 'Nasi Goreng Kampung', price: 42000, cat: 'Makanan', desc: 'Beras wangi, ayam suwir, telur, acar.', modifier: ['Level pedas', 'Tanpa bawang', 'Telur tambah'] },
  { id: 'mie-goreng', name: 'Mie Goreng Spesial', price: 35000, cat: 'Makanan', desc: 'Mie kuning, bakso sapi, sayur, sambal.', modifier: ['Level pedas', 'Extra bakso'] },
  { id: 'ayam-bakar', name: 'Ayam Bakar Madu', price: 54000, cat: 'Makanan', desc: 'Ayam bakar bumbu madu, sambal terasi.', modifier: ['Paha / Dada', 'Sambal terpisah'] },
  { id: 'soto-betawi', name: 'Soto Betawi', price: 58000, cat: 'Makanan', desc: 'Kuah santan, daging sapi, kentang, tomat.', modifier: ['Level pedas', 'Kerupuk'] },
  { id: 'es-kopi-susu', name: 'Es Kopi Susu Gula Aren', price: 28000, cat: 'Minuman', desc: 'Espresso, susu, gula aren.', modifier: ['Less ice', 'Extra shot', 'Tanpa gula'] },
  { id: 'teh-lemon', name: 'Es Teh Lemon', price: 20000, cat: 'Minuman', desc: 'Teh hitam, lemon, es.', modifier: ['Less ice', 'Ekstra lemon'] },
  { id: 'jus-alpukat', name: 'Jus Alpukat', price: 32000, cat: 'Minuman', desc: 'Alpukat segar, susu, cokelat.', modifier: ['Tanpa gula', 'Extra susu'] },
  { id: 'kentang', name: 'Kentang Goreng', price: 32000, cat: 'Camilan', desc: 'Kentang crispy, saus tomat.', modifier: ['Saus terpisah', 'Extra saus'] },
  { id: 'tahu-garam', name: 'Tahu Cabe Garam', price: 32000, cat: 'Camilan', desc: 'Tahu goreng, bawang, cabe.', modifier: ['Pedas gila'] },
  { id: 'air-mineral', name: 'Air Mineral', price: 16000, cat: 'Minuman', desc: 'Air mineral kemasan.', modifier: [] },
]

function MenuCard({ item, onAdd }) {
  const name = item.name
  const price = Number(item.price || 0)
  const desc = item.description || item.desc || ''
  const mods = item.modifier || []
  return (
    <div className="menu-card">
      <div className="menu-thumb" aria-hidden="true">{name.slice(0, 1)}</div>
      <div className="menu-body">
        <h3>{name}</h3>
        <p>{desc}</p>
        <span className="menu-price">{money(price)}</span>
        {mods.length > 0 && <small className="menu-modifier">{mods.length} pilihan tambahan</small>}
      </div>
      <button type="button" className="menu-add" aria-label={`Tambah ${name}`} onClick={() => onAdd(item)}>+</button>
    </div>
  )
}

function Customer() {
  const { orders, menu, submitCustomerOrder } = useStore()
  const [table] = useState(tableFromParams)
  const [route, setRoute] = useState('menu') // menu | cart | checkout | order
  const [cat, setCat] = useState('Semua')
  const [cart, setCart] = useState([])
  const [payment, setPayment] = useState('qris')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [placedId, setPlacedId] = useState(null)
  const tableName = `Meja ${table}`

  // customer order = the order this session just placed
  const myOrder = useMemo(() => orders.find((o) => o.id === placedId) || null, [orders, placedId])

  useEffect(() => { window.scrollTo(0, 0) }, [route])

  const visibleMenu = (menu.length ? menu : MENU).filter((m) => cat === 'Semua' || m.cat === cat)

  const addItem = (item) => {
    setCart((prev) => {
      const found = prev.find((l) => l.id === item.id)
      if (found) return prev.map((l) => l.id === item.id ? { ...l, qty: l.qty + 1 } : l)
      return [...prev, { ...item, qty: 1 }]
    })
  }

  const changeQty = (id, delta) => {
    setCart((prev) => prev.flatMap((l) => {
      if (l.id !== id) return [l]
      const qty = l.qty + delta
      return qty <= 0 ? [] : [{ ...l, qty }]
    }))
  }

  const subtotal = cart.reduce((sum, l) => sum + l.price * l.qty, 0)

  const submit = async () => {
    if (cart.length === 0 || submitting) return
    setSubmitting(true)
    try {
      const id = await submitCustomerOrder({
        table: tableName,
        items: cart.reduce((n, l) => n + l.qty, 0),
        total: subtotal,
        paymentTone: payment === 'qris' ? 'paid' : 'cash',
        station: 'dapur',
        customer: 'Pelanggan meja',
        note: note.trim(),
        lines: cart.map((l) => [`${l.qty}× ${l.name}`, money(l.price * l.qty), '']),
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

  if (route === 'order') {
    const done = myOrder && [STATUS.DONE, STATUS.REJECTED].includes(myOrder.status)
    return (
      <main className="customer">
        <div className="customer-shell">
          <div className="order-track">
            <span className="live-dot" />
            <div>
              <h1>Pesanan kamu</h1>
              <p>{tableName} · {myOrder ? myOrder.id : 'Memuat…'}</p>
            </div>
          </div>
          {myOrder && (
            <div className="track-status">
              <span className={`status-dot-k ${myOrder.status.toLowerCase()}`} />
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
            <button type="button" className="secondary-button" onClick={() => setRoute('menu')}>+ Pesan lagi</button>
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
            <button type="button" className="back-button" onClick={() => setRoute('menu')}>←</button>
            <div><h1>Keranjang</h1><p>{tableName} · {cart.reduce((n, l) => n + l.qty, 0)} item</p></div>
          </header>
          {cart.length === 0 ? (
            <div className="cart-empty">
              <div className="empty-icon">+</div>
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
                      <span>{money(l.price)}</span>
                    </div>
                    <div className="qty-stepper">
                      <button type="button" aria-label={`Kurangi ${l.name}`} onClick={() => changeQty(l.id, -1)}>−</button>
                      <em>{l.qty}</em>
                      <button type="button" aria-label={`Tambah ${l.name}`} onClick={() => changeQty(l.id, 1)}>+</button>
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
            <button type="button" className="back-button" onClick={() => setRoute('cart')}>←</button>
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

  // cart or menu
  return (
    <main className="customer">
      <header className="customer-top">
        <div className="customer-brand"><div className="brand-mark">K</div><div><strong>kasira</strong><small>{tableName}</small></div></div>
        <span className="customer-hint">Scan dari meja · {orders.filter((o) => o.table === tableName).length} pesanan aktif</span>
      </header>

      <section className="customer-hero">
        <h1>Selamat datang</h1>
        <p>Pilih menu favorit kamu dan pesan tanpa menunggu antrean.</p>
      </section>

      <nav className="cat-nav" aria-label="Kategori menu">
        {CATEGORIES.map((c) => <button key={c} className={cat === c ? 'selected' : ''} onClick={() => setCat(c)}>{c}</button>)}
      </nav>

      <section className="menu-grid">
        {visibleMenu.map((item) => <MenuCard key={item.id} item={item} onAdd={addItem} />)}
      </section>

      {cart.length > 0 && (
        <div className="cart-bar">
          <button type="button" className="primary-button" onClick={() => setRoute('cart')}>
            Lihat keranjang · {cart.reduce((n, l) => n + l.qty, 0)} item · {money(subtotal)}
          </button>
        </div>
      )}
    </main>
  )
}

export default Customer