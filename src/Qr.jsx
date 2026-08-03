// QR per-meja — printable cards that open the customer portal for the
// right table when scanned.

import React from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Ic } from './icons.jsx'

const TABLES = Array.from({ length: 24 }, (_, i) => String(i + 1).padStart(2, '0'))

function Qr() {
  return (
    <main className="qr-page">
      <header className="qr-header">
        <div className="qr-title">
          <button type="button" className="back-button" aria-label="Kembali ke dashboard" onClick={() => window.location.hash = '#/'}><Ic.back width="20" height="20" /></button>
          <div>
            <h1>QR meja</h1>
            <p>Cetak dan tempel di meja. Pelanggan memindai untuk membuka menu, pesan, dan bayar.</p>
          </div>
        </div>
        <button type="button" className="secondary-button" onClick={() => window.print()}>Cetak semua QR</button>
      </header>
      <section className="qr-grid">
        {TABLES.map((n) => {
          const url = `${window.location.origin}/#/meja?meja=${n}`
          return (
            <article className="qr-card" key={n}>
              <div className="qr-brand"><div className="brand-mark">K</div><span>kasira</span></div>
              <QRCodeSVG value={url} size={168} level="M" fgColor="#181a1d" bgColor="#ffffff" />
              <strong className="qr-table">Meja {n}</strong>
              <p>Scan untuk pesan & bayar</p>
            </article>
          )
        })}
      </section>
    </main>
  )
}

export default Qr