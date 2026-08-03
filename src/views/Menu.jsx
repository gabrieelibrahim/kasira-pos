// Menu & stok — manage menu items and toggle availability.
// CRUD writes go to Supabase; the store's realtime subscription keeps the
// customer portal and every kasir screen in sync.

import React, { useMemo, useState } from 'react'
import { money, useStore } from '../state.jsx'
import { Ic } from '../icons.jsx'
import AppShell from '../AppShell.jsx'

const CATEGORIES = ['Makanan', 'Minuman', 'Camilan']
const EMPTY_FORM = { name: '', price: '', category: 'Makanan', description: '', modifier: '', available: true }

function Menu() {
  const { menu, upsertItem, toggleAvailability, deleteItem } = useStore()
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState('Semua')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null) // item being edited, or null for add
  const [form, setForm] = useState(EMPTY_FORM)
  const [confirmDel, setConfirmDel] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const flash = (msg) => { setNotice(msg); window.setTimeout(() => setNotice(''), 2400) }

  const items = useMemo(() => menu
    .filter((m) => cat === 'Semua' || m.category === cat)
    .filter((m) => m.name?.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name)), [menu, cat, query])

  const availableCount = menu.filter((m) => m.available).length
  const outCount = menu.length - availableCount

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setFormOpen(true) }
  const openEdit = (item) => {
    setEditing(item)
    setForm({
      name: item.name, price: String(item.price), category: item.category,
      description: item.description || '', modifier: (item.modifier || []).join(', '), available: item.available,
    })
    setFormOpen(true)
  }

  const save = async (e) => {
    e.preventDefault()
    if (!form.name.trim() || !form.price) return
    setBusy(true)
    try {
      await upsertItem({
        name: form.name.trim(),
        price: Number(form.price),
        category: form.category,
        description: form.description.trim(),
        modifier: form.modifier.split(',').map((s) => s.trim()).filter(Boolean),
        available: form.available,
      }, editing?.id)
      flash(editing ? 'Item diperbarui.' : 'Item ditambahkan.')
      setFormOpen(false); setForm(EMPTY_FORM); setEditing(null)
    } catch { flash('Gagal menyimpan item.') } finally { setBusy(false) }
  }

  const toggle = async (item) => {
    try { await toggleAvailability(item.id, !item.available); flash(item.available ? `${item.name} ditandai habis.` : `${item.name} tersedia lagi.`) }
    catch { flash('Gagal mengubah status.') }
  }

  const remove = async () => {
    if (!confirmDel) return
    setBusy(true)
    try { await deleteItem(confirmDel.id); flash(`${confirmDel.name} dihapus.`); setConfirmDel(null) }
    catch { flash('Gagal menghapus item.') } finally { setBusy(false) }
  }

  return (
    <AppShell active="Menu & stok" breadcrumb="Menu & stok">
      <section className="page-heading"><div><p className="eyebrow">KATALOG OUTLET</p><h1>Menu & stok</h1></div><button type="button" className="primary-button" onClick={openAdd}><span className="btn-plus"><Ic.plus width="16" height="16" /></span> Tambah item</button></section>

          <section className="stats-row">
            <div className="stat-card"><div className="stat-icon avail"><Ic.check width="20" height="20" /></div><div><b>{availableCount}</b><span>Tersedia</span></div></div>
            <div className="stat-card"><div className="stat-icon out"><Ic.clock width="20" height="20" /></div><div><b>{outCount}</b><span>Habis</span></div></div>
            <div className="stat-card"><div className="stat-icon total"><Ic.menu width="20" height="20" /></div><div><b>{menu.length}</b><span>Total item</span></div></div>
          </section>

          <section className="menu-panel">
            <div className="queue-toolbar">
              <div className="filter-tabs" role="tablist" aria-label="Filter kategori">{['Semua', ...CATEGORIES].map((c) => <button type="button" role="tab" aria-selected={cat === c} key={c} className={cat === c ? 'selected' : ''} onClick={() => setCat(c)}>{c}</button>)}</div>
              <label className="search-field"><span aria-hidden="true" className="icon"><Ic.search width="16" height="16" /></span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari item" aria-label="Cari item" /></label>
            </div>

            <div className="menu-table">
              <div className="menu-table-head"><span>Item</span><span>Kategori</span><span>Harga</span><span>Stok</span><span className="right">Aksi</span></div>
              {items.map((m) => (
                <div className="menu-row" key={m.id}>
                  <div className="menu-cell name"><span className="menu-emoji" aria-hidden="true">{m.name.slice(0, 1)}</span><div><b>{m.name}</b><small>{m.description || 'Tanpa deskripsi'}</small></div></div>
                  <div className="menu-cell"><span className="cat-pill">{m.category}</span></div>
                  <div className="menu-cell price">{money(m.price)}</div>
                  <div className="menu-cell"><label className="switch-wrap" title={m.available ? 'Tersedia' : 'Habis'}>
                    <input type="checkbox" checked={!!m.available} onChange={() => toggle(m)} aria-label={`Stok ${m.name}`} />
                    <span className={m.available ? 'switch on' : 'switch off'}><i /></span>
                  </label></div>
                  <div className="menu-cell right">
                    <button type="button" className="row-action" onClick={() => openEdit(m)}>Edit</button>
                    <button type="button" className="row-action danger" onClick={() => setConfirmDel(m)}>Hapus</button>
                  </div>
                </div>
              ))}
              {items.length === 0 && <div className="menu-empty">Tidak ada item {cat === 'Semua' ? '' : `di ${cat}`}. Tambahkan item baru.</div>}
            </div>
          </section>

      {formOpen && (
        <div className="modal-backdrop" role="presentation">
          <form className="confirm-modal menu-form" role="dialog" aria-modal="true" aria-labelledby="menu-form-title" onSubmit={save}>
            <h2 id="menu-form-title">{editing ? `Edit ${editing.name}` : 'Tambah item'}</h2>
            <label>Nama item<input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Contoh: Nasi Goreng Kampung" required /></label>
            <div className="form-grid">
              <label>Harga (Rp)<input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="42000" required /></label>
              <label>Kategori<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
            </div>
            <label>Deskripsi<textarea rows="2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Deskripsi singkat yang tampil di portal meja" /></label>
            <label>Pilihan tambahan<textarea rows="2" value={form.modifier} onChange={(e) => setForm({ ...form, modifier: e.target.value })} placeholder="Pisahkan dengan koma: Level pedas, Tanpa bawang" /></label>
            <label className="form-switch"><span>Status stok</span>
              <span className="switch-wrap"><input type="checkbox" checked={form.available} onChange={(e) => setForm({ ...form, available: e.target.checked })} /><span className={form.available ? 'switch on' : 'switch off'}><i /></span></span>
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => { setFormOpen(false); setEditing(null); setForm(EMPTY_FORM) }}>Batal</button>
              <button type="submit" className="primary-button" disabled={busy || !form.name.trim() || !form.price}>{busy ? 'Menyimpan…' : 'Simpan item'}</button>
            </div>
          </form>
        </div>
      )}

      {confirmDel && (
        <div className="modal-backdrop" role="presentation">
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="del-title">
            <h2 id="del-title">Hapus {confirmDel.name}?</h2>
            <p>Item akan dihapus dari menu dan portal pelanggan. Tindakan ini tidak bisa dibatalkan.</p>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setConfirmDel(null)}>Batal</button>
              <button type="button" className="reject-button" disabled={busy} onClick={remove}>{busy ? 'Menghapus…' : 'Hapus item'}</button>
            </div>
          </div>
        </div>
      )}

      {notice && <div className="toast" role="status"><span className="toast-check"><Ic.check width="14" height="14" /></span>{notice}</div>}
    </AppShell>
  )
}

export default Menu
