// QR per-meja — printable cards that open the customer portal for the
// right table when scanned. Rendered inside the kasir app shell.
//
// The grid is driven by the live `table_spots` store (the same list the
// Portal meja / kasir read), so a table added or removed here shows up
// everywhere. Admin can add a new table and remove an existing one.

import React, { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import AppShell from './AppShell.jsx'
import { useAuth, useStore } from './state.jsx'
import { STATUS, isInProduction } from './state.jsx'
import { Ic } from './icons.jsx'

// An order that still "occupies" a table — blocks removing that table's QR.
const isLive = (o) => o.status !== STATUS.DONE && o.status !== STATUS.REJECTED

function Qr() {
  const { tables, orders, addTable, deleteTable } = useStore()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [adding, setAdding] = useState(false)
  const [number, setNumber] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [addErr, setAddErr] = useState('')
  const [delFor, setDelFor] = useState(null) // table id pending delete
  const [delBusy, setDelBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const flash = (msg) => { setNotice(msg); window.setTimeout(() => setNotice(''), 2400) }

  const submit = async (e) => {
    e.preventDefault()
    if (addBusy) return
    setAddBusy(true)
    setAddErr('')
    try {
      await addTable(number ? Number(number) : null)
      setAdding(false)
      setNumber('')
      flash('Meja baru ditambahkan.')
    } catch {
      setAddErr('Gagal menambah meja — nomor mungkin sudah dipakai.')
    } finally { setAddBusy(false) }
  }

  const doDelete = async () => {
    if (!delFor || delBusy) return
    setDelBusy(true)
    try {
      await deleteTable(delFor)
      flash('Meja dihapus.')
    } catch { flash('Gagal menghapus meja.') } finally { setDelBusy(false); setDelFor(null) }
  }

  return (
    <AppShell active="QR meja" breadcrumb="QR meja">
      <section className="page-heading">
        <div>
          <p className="eyebrow">QR PER-MEJA</p>
          <h1>QR meja</h1>
          <p className="heading-sub">Cetak dan tempel di meja. Pelanggan memindai untuk membuka menu, pesan, dan bayar.</p>
        </div>
        <div className="qr-actions">
          {isAdmin && (
            <button type="button" className="secondary-button" onClick={() => setAdding(true)}><Ic.plus width="15" height="15" /> Tambah meja</button>
          )}
          <button type="button" className="secondary-button" onClick={() => window.print()}>Cetak semua QR</button>
        </div>
      </section>

      {tables.length === 0 ? (
        <div className="report-empty">Belum ada meja. Admin bisa menambah meja di halaman ini.</div>
      ) : (
        <section className="qr-grid">
          {tables.map((t) => {
            const n = String(t.number ?? '').padStart(2, '0')
            const url = `${window.location.origin}/#/meja?meja=${n}`
            const blocked = orders.some((o) => isLive(o) && String(o.table || '').replace(/^meja\s*/i, '') === String(t.number))
            return (
              <article className="qr-card" key={t.id}>
                <div className="qr-brand">
                  <div className="brand-mark">K</div><span>kasira</span>
                  {isAdmin && (
                    <button type="button" className="qr-remove" title={blocked ? 'Masih ada order aktif di meja ini' : 'Hapus meja ini'} disabled={blocked} onClick={() => setDelFor(t.id)}><Ic.trash width="14" height="14" /></button>
                  )}
                </div>
                <QRCodeSVG value={url} size={168} level="M" fgColor="#181a1d" bgColor="#ffffff" />
                <strong className="qr-table">Meja {n}</strong>
                <p>{blocked ? 'Ada order aktif — belum bisa dihapus' : 'Scan untuk pesan & bayar'}</p>
              </article>
            )
          })}
        </section>
      )}

      {adding && (
        <div className="modal-backdrop" role="presentation">
          <form className="confirm-modal menu-form" role="dialog" aria-modal="true" aria-labelledby="add-table-title" onSubmit={submit}>
            <h2 id="add-table-title">Tambah meja</h2>
            <label>Nomor meja (kosongkan = nomor berikutnya)<input
              autoFocus
              type="text"
              inputMode="numeric"
              value={number}
              onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))}
              placeholder="Kosongkan untuk otomatis"
            /></label>
            {addErr && <div className="reset-error">{addErr}</div>}
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => { setAdding(false); setNumber(''); setAddErr('') }} disabled={addBusy}>Batal</button>
              <button type="submit" className="primary-button" disabled={addBusy}>{addBusy ? 'Menambah…' : 'Tambah meja'}</button>
            </div>
          </form>
        </div>
      )}

      {delFor && (
        <div className="modal-backdrop" role="presentation">
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-table-title">
            <h2 id="delete-table-title">Hapus meja ini?</h2>
            <p className="confirm-text">QR meja ini tidak akan bisa dipakai lagi. Riwayat order meja tersebut tetap tersimpan.</p>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setDelFor(null)} disabled={delBusy}>Batal</button>
              <button type="button" className="reset-submit" onClick={doDelete} disabled={delBusy}>{delBusy ? 'Menghapus…' : 'Hapus meja'}</button>
            </div>
          </div>
        </div>
      )}

      {notice && <div className="toast" role="status"><span className="toast-check"><Ic.check width="14" height="14" /></span>{notice}</div>}
    </AppShell>
  )
}

export default Qr
