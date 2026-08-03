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
export const isInProduction = (o) => [STATUS.SENT, STATUS.PREP, STATUS.READY, STATUS.DELIVERED].includes(o.status)

// Normalize a table number for matching order.table_label ("Meja 03" -> "3").
const normNum = (t) => String(t ?? '').replace(/^0+(?=\d)/, '')

// Derive each table's monitoring state from orders + persisted spot status.
// Precedence: pay (needs action) > occupied (eating) > done (needs cleaning) > empty.
export function deriveTableStatus(spots, orders) {
  if (!spots) return []
  const live = orders.filter((o) => o.status !== STATUS.REJECTED)
  return spots.map((spot) => {
    const key = normNum(spot.number ?? spot.label)
    const list = live
      .filter((o) => normNum(o.table?.replace(/^meja\s*/i, '')) === key)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    let tone = 'empty'
    let label = 'Kosong'
    if (list.some(isActionable)) { tone = 'pay'; label = 'Bayar' }
    else if (list.some(isInProduction)) { tone = 'occupied'; label = 'Makan' }
    else if (list.length > 0 && spot.status !== 'empty') { tone = 'done'; label = 'Selesai' }
    return { id: spot.id, number: spot.number, label: `Meja ${String(spot.number ?? '').padStart(2, '0')}`, tone, spotLabel: label, orders: list, raw: spot }
  })
}

const StoreContext = createContext(null)

const normalizeOrder = (o) => ({
  id: o.id,
  table: o.table_label || 'Meja –',
  customer: o.customer_name || 'Pelanggan',
  note: o.note || '',
  status: o.status,
  total: Number(o.total || 0),
  payment_method: o.payment_method,
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
  const [outlet, setOutlet] = useState(null)

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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'menu_items' }, (payload) => {
        if (mounted) setMenu((prev) => [...prev, payload.new])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'menu_items' }, (payload) => {
        if (mounted) setMenu((prev) => prev.map((m) => (m.id === payload.new.id ? payload.new : m)))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'menu_items' }, (payload) => {
        if (mounted) setMenu((prev) => prev.filter((m) => m.id !== payload.old.id))
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'table_spots' }, (payload) => {
        if (mounted) setTables((prev) => prev.map((t) => (t.id === payload.new.id ? payload.new : t)))
      })
      .subscribe()

    async function boot() {
      const { data: out } = await supabase.from('outlets').select('*').limit(1)
      const oId = out?.[0]
      if (mounted) {
        setOutletId(oId?.id || null)
        setOutlet(oId || null)
      }

      const [{ data: o }, { data: m }, { data: t }] = await Promise.all([
        oId ? supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(30) : { data: [] },
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
      outlet,
      updateOutlet: async (patch) => {
        if (!outletId) return
        const { data, error } = await supabase.from('outlets').update(patch).eq('id', outletId).select().single()
        if (error) throw error
        setOutlet(data)
      },
      accept: (id) => update(id, { status: STATUS.SENT }),
      markCashPaid: (id) => update(id, { payment: 'Tunai diterima', paymentTone: 'paid', status: STATUS.CASHIER }),
      reject: (id) => update(id, { status: STATUS.REJECTED }),
      advance: (id) => setOrders((prev) => prev.map((o) => {
        if (o.id !== id) return o
        const next = o.status === STATUS.SENT ? STATUS.PREP : o.status === STATUS.PREP ? STATUS.READY : STATUS.DONE
        update(id, { status: next })
        return { ...o, status: next }
      })),
      upsertItem: async (item, id) => {
        const patch = {
          name: item.name,
          price: Number(item.price),
          category: item.category,
          description: item.description || '',
          modifier: item.modifier || [],
          available: Boolean(item.available),
        }
        if (id) {
          await supabase.from('menu_items').update(patch).eq('id', id)
        } else {
          await supabase.from('menu_items').insert({ ...patch, outlet_id: outletId })
        }
      },
      toggleAvailability: async (id, available) => {
        await supabase.from('menu_items').update({ available }).eq('id', id)
      },
      deleteItem: async (id) => {
        await supabase.from('menu_items').delete().eq('id', id)
      },
      submitCustomerOrder: async (order) => {
        const tableKey = normNum(order.table?.replace(/^meja\s*/i, ''))
        const spot = tables.find((t) => normNum(t.number ?? t.label) === tableKey)
        if (spot?.id) await supabase.from('table_spots').update({ status: 'occupied' }).eq('id', spot.id)
        const { data, error } = await supabase.from('orders').insert({
          outlet_id: outletId,
          table_spot_id: spot?.id || null,
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
      reportOrders: async () => {
        const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: true })
        if (error) throw error
        return (data || []).map(normalizeOrder)
      },
      todayOrders: async () => {
        const start = new Date(); start.setHours(0, 0, 0, 0)
        const { data, error } = await supabase.from('orders').select('*').gte('created_at', start.toISOString()).order('created_at', { ascending: false })
        if (error) throw error
        return (data || []).map(normalizeOrder)
      },
      clearTable: async (spotId) => {
        await supabase.from('table_spots').update({ status: 'empty' }).eq('id', spotId)
        setTables((prev) => prev.map((t) => (t.id === spotId ? { ...t, status: 'empty' } : t)))
      },
    }
  }, [orders, menu, tables, ready, outletId, outlet])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}

export const money = (value) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)