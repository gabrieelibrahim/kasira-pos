// Supabase client for Kasira. Points at the self-hosted backend on the VPS.
// In dev, values come from .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || 'http://203.145.35.68:8000'
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient(url, anonKey)