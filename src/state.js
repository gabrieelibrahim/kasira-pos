import { useState } from 'react'

// Shared fixture + state for the Kasira MVP. In production this is a
// realtime store; here it simulates a single source of truth shared by
// the cashier dashboard and the kitchen display.

export const STATUS = {
  PAYMENT: 'Menunggu pembayaran',
  CASHIER: 'Menunggu konfirmasi kasir',
  SENT: 'Diterima',
  PREP: 'Sedang disiapkan',
  READY: 'Siap diantar',
  DELIVERED: 'Diantar',
  DONE: 'Selesai',
  REJECTED: 'Ditolak',
}

// Which statuses still need cashier attention.
export const isActionable = (o) => o.status === STATUS.PAYMENT || o.status === STATUS.CASHIER

export const ORDER_STATUS = Object.values(STATUS)

const initialOrders = [
  {
    id: 'KS-1048', table: 'Meja 12', age: 'baru saja', minutes: 1, items: 4, total: 186000,
    payment: 'QRIS terkonfirmasi', paymentTone: 'paid', station: 'dapur', status: STATUS.CASHIER,
    customer: 'Rina · 3 orang', note: 'Satu nasi goreng tanpa pedas, ya.',
    lines: [['Nasi Goreng Kampung', '2 × Rp42.000', 'Tanpa pedas'], ['Es Kopi Susu Gula Aren', '1 × Rp28.000', 'Less ice'], ['Tahu Cabe Garam', '1 × Rp32.000', '']],
  },
  {
    id: 'KS-1047', table: 'Meja 04', age: '2 menit lalu', minutes: 2, items: 3, total: 124000,
    payment: 'Menunggu tunai', paymentTone: 'cash', station: 'dapur', status: STATUS.PAYMENT,
    customer: 'Dimas · 2 orang', note: 'Bayar di kasir sebelum pesanan diproses.',
    lines: [['Mie Ayam Sambal Matah', '1 × Rp38.000', 'Extra sambal'], ['Ayam Bakar Madu', '1 × Rp54.000', ''], ['Teh Sereh', '1 × Rp22.000', 'Hangat']],
  },
  {
    id: 'KS-1046', table: 'Meja 21', age: '4 menit lalu', minutes: 4, items: 6, total: 298000,
    payment: 'QRIS terkonfirmasi', paymentTone: 'paid', station: 'bar', status: STATUS.CASHIER,
    customer: 'Aldo · 5 orang', note: 'Tolong antar minuman duluan.',
    lines: [['Paket Nasi Ayam Bakar', '3 × Rp62.000', '2 tanpa sambal'], ['Es Teh Lemon', '2 × Rp20.000', ''], ['Kentang Goreng', '1 × Rp32.000', 'Saus terpisah']],
  },
  {
    id: 'KS-1045', table: 'Meja 08', age: '6 menit lalu', minutes: 6, items: 2, total: 90000,
    payment: 'QRIS terkonfirmasi', paymentTone: 'paid', station: 'dapur', status: STATUS.CASHIER,
    customer: 'Sari · 2 orang', note: '',
    lines: [['Soto Betawi', '1 × Rp58.000', ''], ['Air Mineral', '2 × Rp16.000', 'Dingin']],
  },
  {
    id: 'KS-1044', table: 'Meja 17', age: '8 menit lalu', minutes: 8, items: 5, total: 210000,
    payment: 'QRIS terkonfirmasi', paymentTone: 'paid', station: 'dapur', status: STATUS.CASHIER,
    customer: 'Yoga · 4 orang', note: 'Pisahkan sambal dan acar.',
    lines: [['Iga Bakar Komplit', '2 × Rp78.000', ''], ['Jus Alpukat', '1 × Rp32.000', 'Tanpa gula'], ['Nasi Putih', '2 × Rp11.000', '']],
  },
]

export function createStore() {
  return {
    orders: initialOrders,
  }
}

export function useCashierStore() {
  return useState(initialOrders)
}

export const money = (value) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)