// Receipt — a 58mm thermal-stripe receipt for a single order.
//
// It renders an off-screen `.print-receipt` block plus an injected <style>
// that scopes ALL print rules (@page size, visibility) to the mounted
// component. Because the <style> only exists in the DOM while a Receipt is
// mounted, printing from other views (e.g. the QR-cards page, which has its
// own @media print block) is completely unaffected. The "Cetak struk" button
// in the cashier just calls window.print().

import React from 'react'
import { money } from './state.jsx'

const W = 40 // ~58mm at 11px Courier

// Fixed-width line: truncate long labels, right-align the value.
function row(left, right, width = W) {
  const l = left.length > width - 12 ? left.slice(0, width - 13) + '…' : left
  const r = String(right ?? '')
  return l + ' '.repeat(Math.max(1, width - l.length - r.length)) + r
}

const fmt = (n) => money(n).replace(/^Rp\s*/, '') // "Rp 25.000" -> "25.000"

export default function Receipt({ order, outlet, staff }) {
  const tax = Number(outlet?.tax_rate ?? 11)
  const subtotal = Math.round(Number(order.total || 0) / (1 + tax / 100))
  const taxAmt = Number(order.total || 0) - subtotal
  const when = new Date(order.created_at).toLocaleString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const lines = (order.lines || [])
    .map(([name, price, note]) => `${row(name, price)}${note ? '\n  ' + note : ''}`)
    .join('\n')

  const body = [
    `${outlet?.name || 'kasira'}`,
    `${outlet?.address || ''}`,
    `${outlet?.phone || ''}`,
    '='.repeat(W),
    row('Order', order.id),
    row('Meja', order.table),
    row('Tanggal', when),
    row('Kasir', staff?.name || ''),
    '-'.repeat(W),
    lines,
    '-'.repeat(W),
    row('Subtotal', fmt(subtotal)),
    row('PPN ' + tax + '%', fmt(taxAmt)),
    row('TOTAL', fmt(order.total)),
    '-'.repeat(W),
    row(order.payment_method === 'cash' ? 'TUNAI' : 'QRIS', order.payment),
    '='.repeat(W),
    'Terima kasih!',
  ].filter(Boolean).join('\n')

  return (
    <>
      <style>{`
        @page { size: 58mm auto; margin: 2mm; }
        @media print {
          body * { visibility: hidden !important; }
          .print-receipt, .print-receipt * { visibility: visible !important; }
          .print-receipt { position: absolute; left: 0; top: 0; width: 58mm; }
        }
      `}</style>
      <div className="print-receipt" aria-hidden="true">
        <pre>{body}</pre>
      </div>
    </>
  )
}