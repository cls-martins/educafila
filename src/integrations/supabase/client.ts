import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://zoikoxzdjhxlqglxdaik.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_fHbQVxT9euk_zfEfy557uw_xomsH3AU";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
