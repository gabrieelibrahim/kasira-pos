// Kasira shared state — backed by Supabase realtime.
// Orders, menu, and tables live in Postgres on the VPS; components read
// them through this store and subscribe to changes via supabase channel.

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase.js'

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
export const isInProduction = (o) => [STATUS.SENT, STATUS.PREP, STATUS.READY, STATUS.DELIVERED, STATUS.DONE].includes(o.status)

const StoreContext = createContext(null)

const normalizeOrder = (o) => ({
  id: o.id,
  table: o.table_label || 'Meja –',
  customer: o.customer_name || 'Pelanggan',
  note: o.note || '',
  status: o.status,
  total: Number(o.total || 0),
  payment: o.payment_status === 'paid' ? (o.payment_method === 'cash' ? 'Tunai diterima' : 'QRIS terkonfirmasi') : (o.payment_method === 'cash' ? 'Menunggu tunai' : 'Menunggu QRIS'),
  paymentTone: o.payment_status === 'paid' ? 'paid' : 'cash',
  lines: Array.isArray(o.lines) ? o.lines : [],
  station: 'dapur',
  items: o.lines && o.lines.length ? o.lines.reduce((n, l) => n + (Number(l[1].match(/\d+/)?.[0]) || 1), 0) : 0,
  age: 'baru saja',
  created_at: o.created_at,
})

export function StoreProvider({ children }) {
  const [orders, setOrders] = useState([])
  const [menu, setMenu] = useState([])
  const [tables, setTables] = useState([])
  const [ready, setReady] = useState(false)
  const [outletId, setOutletId] = useState(null)

  // Boot: load outlet + seed data, then subscribe to realtime changes.
  useEffect(() => {
    let mounted = true
    const channel = supabase
      .channel('kasira-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        if (mounted) setOrders((prev) => [normalizeOrder(payload.new), ...prev.filter((o) => o.id !== payload.new.id)])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        if (mounted) setOrders((prev) => prev.map((o) => (o.id === payload.new.id ? normalizeOrder(payload.new) : o)))
      })
      .subscribe()

    async function boot() {
      const { data: out } = await supabase.from('outlets').select('id').limit(1)
      const oid = out?.[0]?.id
      if (mounted) setOutletId(oid)

      const [{ data: o }, { data: m }, { data: t }] = await Promise.all([
        oid ? supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(30) : { data: [] },
        supabase.from('menu_items').select('*').order('name'),
        supabase.from('table_spots').select('*').order('number'),
      ])
      if (mounted) {
        setOrders((o || []).map(normalizeOrder))
        setMenu(m || [])
        setTables(t || [])
        setReady(true)
      }
    }
    boot()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [])

  const value = useMemo(() => {
    const update = async (id, patch) => {
      await supabase.from('orders').update(patch).eq('id', id)
      // optimistic local sync; realtime will confirm
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)))
    }

    return {
      orders,
      menu,
      tables,
      ready,
      outletId,
      accept: (id) => update(id, { status: STATUS.SENT }),
      markCashPaid: (id) => update(id, { payment: 'Tunai diterima', paymentTone: 'paid', status: STATUS.CASHIER }),
      reject: (id) => update(id, { status: STATUS.REJECTED }),
      advance: (id) => setOrders((prev) => prev.map((o) => {
        if (o.id !== id) return o
        const next = o.status === STATUS.SENT ? STATUS.PREP : o.status === STATUS.PREP ? STATUS.READY : STATUS.DONE
        update(id, { status: next })
        return { ...o, status: next }
      })),
      submitCustomerOrder: async (order) => {
        const { data, error } = await supabase.from('orders').insert({
          outlet_id: outletId,
          table_spot_id: null,
          table_label: order.table,
          customer_name: order.customer,
          note: order.note,
          status: order.paymentTone === 'cash' ? STATUS.PAYMENT : STATUS.CASHIER,
          payment_method: order.paymentTone === 'cash' ? 'cash' : 'qris',
          payment_status: order.paymentTone === 'cash' ? 'pending' : 'paid',
          total: order.total,
          lines: order.lines,
        }).select('id').single()
        if (error) throw error
        return data.id
      },
    }
  }, [orders, menu, tables, ready, outletId])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}

export const money = (value) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)