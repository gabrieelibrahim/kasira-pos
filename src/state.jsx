import { createContext, useContext, useMemo, useState } from 'react'

// Shared fixture + state for the Kasira MVP. In production this is a
// realtime store; here a single React context serves as one source of
// truth read and mutated by the cashier dashboard and the KDS alike.

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

export const isActionable = (o) => o.status === STATUS.PAYMENT || o.status === STATUS.CASHIER

// Statuses currently on the kitchen board.
export const isInProduction = (o) => [STATUS.SENT, STATUS.PREP, STATUS.READY, STATUS.DELIVERED, STATUS.DONE].includes(o.status)

const seed = [
  { id: 'KS-1048', table: 'Meja 12', items: 4, total: 186000, payment: 'QRIS terkonfirmasi', paymentTone: 'paid', station: 'dapur', status: STATUS.CASHIER, customer: 'Rina · 3 orang', note: 'Satu nasi goreng tanpa pedas, ya.', lines: [['Nasi Goreng Kampung', '2 × Rp42.000', 'Tanpa pedas'], ['Es Kopi Susu Gula Aren', '1 × Rp28.000', 'Less ice'], ['Tahu Cabe Garam', '1 × Rp32.000', '']] },
  { id: 'KS-1047', table: 'Meja 04', items: 3, total: 124000, payment: 'Menunggu tunai', paymentTone: 'cash', station: 'dapur', status: STATUS.PAYMENT, customer: 'Dimas · 2 orang', note: 'Bayar di kasir sebelum pesanan diproses.', lines: [['Mie Ayam Sambal Matah', '1 × Rp38.000', 'Extra sambal'], ['Ayam Bakar Madu', '1 × Rp54.000', ''], ['Teh Sereh', '1 × Rp22.000', 'Hangat']] },
  { id: 'KS-1046', table: 'Meja 21', items: 6, total: 298000, payment: 'QRIS terkonfirmasi', paymentTone: 'paid', station: 'bar', status: STATUS.CASHIER, customer: 'Aldo · 5 orang', note: 'Tolong antar minuman duluan.', lines: [['Paket Nasi Ayam Bakar', '3 × Rp62.000', '2 tanpa sambal'], ['Es Teh Lemon', '2 × Rp20.000', ''], ['Kentang Goreng', '1 × Rp32.000', 'Saus terpisah']] },
  { id: 'KS-1045', table: 'Meja 08', items: 2, total: 90000, payment: 'QRIS terkonfirmasi', paymentTone: 'paid', station: 'dapur', status: STATUS.CASHIER, customer: 'Sari · 2 orang', note: '', lines: [['Soto Betawi', '1 × Rp58.000', ''], ['Air Mineral', '2 × Rp16.000', 'Dingin']] },
  { id: 'KS-1044', table: 'Meja 17', items: 5, total: 210000, payment: 'QRIS terkonfirmasi', paymentTone: 'paid', station: 'dapur', status: STATUS.CASHIER, customer: 'Yoga · 4 orang', note: 'Pisahkan sambal dan acar.', lines: [['Iga Bakar Komplit', '2 × Rp78.000', ''], ['Jus Alpukat', '1 × Rp32.000', 'Tanpa gula'], ['Nasi Putih', '2 × Rp11.000', '']] },
  // In production already
  { id: 'KS-1042', table: 'Meja 15', items: 4, station: 'dapur', status: STATUS.READY, customer: 'Andi · 3 orang', note: 'Sambal terpisah', lines: [['Mie Goreng', '2 × Rp35.000', ''], ['Jus Mangga', '1 × Rp30.000', ''], ['Air Putih', '1 × Rp12.000', '']] },
  { id: 'KS-1041', table: 'Meja 07', items: 2, station: 'bar', status: STATUS.SENT, customer: 'Budi · 1 orang', note: '', lines: [['Es Kopi Susu', '2 × Rp28.000', 'Less ice']] },
  { id: 'KS-1040', table: 'Meja 02', items: 3, station: 'dapur', status: STATUS.PREP, customer: 'Caca · 2 orang', note: 'Tanpa bawang', lines: [['Ayam Bakar Madu', '1 × Rp54.000', ''], ['Nasi Putih', '1 × Rp11.000', ''], ['Es Teh', '1 × Rp18.000', 'Dingin']] },
]

const StoreContext = createContext(null)

export function StoreProvider({ children }) {
  const [orders, setOrders] = useState(seed)

  const value = useMemo(() => {
    const update = (id, patch) => setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)))

    return {
      orders,
      accept: (id) => update(id, { status: STATUS.SENT }),
      markCashPaid: (id) => update(id, { payment: 'Tunai diterima', paymentTone: 'paid', status: STATUS.CASHIER }),
      reject: (id) => update(id, { status: STATUS.REJECTED }),
      submitCustomerOrder: (order) => {
        const id = `KS-${1000 + seed.length + Math.floor(Math.random() * 90)}`
        const placed = { ...order, id, age: 'baru saja', minutes: 0, status: order.paymentTone === 'cash' ? STATUS.PAYMENT : STATUS.CASHIER }
        setOrders((prev) => [...prev, placed])
        return id
      },
      advance: (id) => setOrders((prev) => prev.map((o) => {
        if (o.id !== id) return o
        if (o.status === STATUS.SENT) return { ...o, status: STATUS.PREPARED }
        if (o.status === STATUS.PREPARED) return { ...o, status: STATUS.READY }
        return { ...o, status: STATUS.DONE }
      })),
    }
  }, [orders])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}

export const money = (value) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)