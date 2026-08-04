// Kasira shared state — backed by Supabase realtime.
// Orders, menu, and tables live in Postgres on the VPS; components read
// them through this store and subscribe to changes via supabase channel.

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase.js'
import { clearSession, getStoredUser, saveSession } from './auth.js'

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

const AuthContext = createContext(null)

// App-level staff auth. Session is restored synchronously from localStorage so
// there's no async flash of the login screen on reload.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser())

  const login = async (username, pin) => {
    const { data, error } = await supabase.rpc('login_staff', {
      p_username: String(username ?? '').trim(),
      p_pin: String(pin ?? ''),
    })
    if (error) throw error
    if (!data || data.length === 0) throw new Error('invalid')
    const u = data[0]
    const session = { id: u.id, name: u.name, username: u.username, role: u.role, outletId: u.outlet_id }
    saveSession(session)
    setUser(session)
    return session
  }

  const logout = () => { clearSession(); setUser(null) }

  const value = useMemo(() => ({ user, login, logout }), [user])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

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
      markCashPaid: (id) => update(id, { payment_status: 'paid', status: STATUS.CASHIER }),
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
          image: item.image || null,
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
      verifyResetPin: async (pin) => {
        const { data, error } = await supabase.rpc('verify_reset_pin', { p_pin: String(pin ?? '').trim() })
        if (error) throw error
        return Boolean(data)
      },
      // Reset seluruh aplikasi dari nol: hapus permanen semua order + kosongkan semua meja.
      resetAll: async () => {
        const { error } = await supabase.from('orders').delete().not('id', 'is', null)
        if (error) throw error
        const { error: terr } = await supabase.from('table_spots').update({ status: 'empty' }).not('id', 'is', null)
        if (terr) throw terr
        setOrders([])
        setTables((prev) => prev.map((t) => ({ ...t, status: 'empty' })))
      },
      // Reset batas akhir hari / tutup kasir: semua order aktif ditandai Selesai,
      // meja dikosongkan, tapi order TETAP tersimpan di riwayat/laporan.
      resetDay: async () => {
        const active = orders
          .filter((o) => [STATUS.PAYMENT, STATUS.CASHIER, STATUS.SENT, STATUS.PREP, STATUS.READY, STATUS.DELIVERED].includes(o.status))
          .map((o) => o.id)
        if (active.length) {
          const { error } = await supabase.from('orders').update({ status: STATUS.DONE }).in('id', active)
          if (error) throw error
          setOrders((prev) => prev.map((o) => (active.includes(o.id) ? { ...o, status: STATUS.DONE } : o)))
        }
        const { error: terr } = await supabase.from('table_spots').update({ status: 'empty' }).not('id', 'is', null)
        if (terr) throw terr
        setTables((prev) => prev.map((t) => ({ ...t, status: 'empty' })))
      },
    }
  }, [orders, menu, tables, ready, outletId, outlet]) // resetDay depends on orders

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}

export const money = (value) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)