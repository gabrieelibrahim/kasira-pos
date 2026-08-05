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
  station: o.station === 'bar' ? 'bar' : 'dapur',
  discount: Number(o.discount || 0),
  service_rate: o.service_rate == null ? 0 : Number(o.service_rate),
  cash_received: o.cash_received == null ? null : Number(o.cash_received),
  items: o.lines && o.lines.length ? o.lines.reduce((n, l) => n + (Number(l[1].match(/\d+/)?.[0]) || 1), 0) : 0,
  age: 'baru saja',
  created_at: o.created_at,
  staff_id: o.staff_id || null,
  // Human-friendly sequential order number (Order #1, #2, …). Assigned by
  // `withOrderNums` from the created_at order — never persisted, so the order
  // a customer sees is stable and matches the receipt they were handed.
  num: 0,
})

// Calendar day key in the viewer's local timezone — used to reset order
// numbers each day. (Uses local getters, NOT the UTC string slice, so an
// order at 01:00 WIB still belongs to the local "today".)
const dayKey = (iso) => {
  const d = iso ? new Date(iso) : new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// Start of the local day as an ISO timestamp (for today-only queries).
const startOfDay = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

// Assign `num` (1, 2, 3, …) to an array of orders sorted by creation time,
// oldest first. Numbers restart at 1 on each new local calendar day, so today
// starts at #1 even if the app has run for weeks. Ordering is stable within a
// day so numbers never shift once assigned.
export const withOrderNums = (list) => list
  .slice()
  .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  .map((o, i, arr) => ({
    ...o,
    num: i > 0 && dayKey(arr[i - 1].created_at) !== dayKey(o.created_at) ? 1 : i > 0 ? arr[i - 1].num + 1 : 1,
  }))

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
        if (!mounted) return
        const incoming = normalizeOrder(payload.new)
        setOrders((prev) => {
          const next = [incoming, ...prev.filter((o) => o.id !== incoming.id)]
          const today = next.filter((o) => dayKey(o.created_at) === dayKey(incoming.created_at))
          return next.map((o) => ({ ...o, num: today.filter((x) => x.created_at <= o.created_at).length }))
        })
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
        // All orders since the start of the local day so #num is correct and
        // resets each day; yesterday's orders are out of the live board.
        oId ? supabase.from('orders').select('*').gte('created_at', startOfDay().toISOString()).order('created_at', { ascending: false }) : { data: [] },
        supabase.from('menu_items').select('*').order('name'),
        supabase.from('table_spots').select('*').order('number'),
      ])
      if (mounted) {
        setOrders(withOrderNums((o || []).map(normalizeOrder)))
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
      // Settle a cash order: mark paid + advance to cashier confirmation, and
      // optionally apply a discount (Rp), service charge (% of net total), and
      // record the cash received (for change on the receipt). total here is the
      // net pre-tax total (subtotal − discount).
      settleCash: async (id, adjustment = {}) => {
        const patch = { payment_status: 'paid', status: STATUS.CASHIER }
        if (adjustment.total != null) patch.total = Math.max(0, Math.round(Number(adjustment.total) || 0))
        if (adjustment.discount != null) patch.discount = Math.max(0, Math.round(Number(adjustment.discount) || 0))
        if (adjustment.service_rate != null) patch.service_rate = Number(adjustment.service_rate) || null
        if (adjustment.cash_received != null) patch.cash_received = Number(adjustment.cash_received) || null
        await update(id, patch)
        // Optimistic sync — derived fields too, so the very next keyboard action
        // (Enter → accept) sees this order as paid without waiting for realtime.
        setOrders((prev) => prev.map((o) => (o.id === id
          ? { ...o, ...patch, paymentTone: 'paid', payment: o.payment_method === 'cash' ? 'Tunai diterima' : 'QRIS terkonfirmasi' }
          : o)))
      },
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
          station: order.station === 'bar' ? 'bar' : 'dapur',
          staff_id: order.staff_id ?? null,
        }).select('id').single()
        if (error) throw error
        return data.id
      },
      reportOrders: async () => {
        const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: true })
        if (error) throw error
        return withOrderNums((data || []).map(normalizeOrder))
      },
      todayOrders: async () => {
        const start = new Date(); start.setHours(0, 0, 0, 0)
        const { data, error } = await supabase.from('orders').select('*').gte('created_at', start.toISOString()).order('created_at', { ascending: false })
        if (error) throw error
        return withOrderNums((data || []).map(normalizeOrder))
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
      // Staff management (admin): all writes go through SECURITY DEFINER RPCs
      // so PINs are hashed server-side and never sent raw to the client.
      staffList: async () => {
        if (!outletId) return []
        const { data, error } = await supabase.rpc('list_staff', { p_outlet_id: outletId })
        if (error) throw error
        return data || []
      },
      saveStaff: async (payload) => {
        await supabase.rpc('insert_staff', {
          p_outlet_id: outletId,
          p_name: payload.name,
          p_username: payload.username,
          p_pin: payload.pin,
          p_role: payload.role,
        })
      },
      toggleStaff: async (id, active) => {
        await supabase.rpc('toggle_staff', { p_staff_id: id, p_active: Boolean(active) })
      },
      changeStaffPin: async (id, pin) => {
        await supabase.rpc('set_staff_password', { p_staff_id: id, p_new_pin: String(pin) })
      },
      changeResetPin: async (pin) => {
        await supabase.rpc('set_outlet_reset_pin', { p_new_pin: String(pin) })
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