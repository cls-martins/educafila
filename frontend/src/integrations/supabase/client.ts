import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = "https://zoikoxzdjhxlqglxdaik.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvaWtveHpkamh4bHFnbHhkYWlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MzQwMDgsImV4cCI6MjA5MTUxMDAwOH0.MsdsbCE0lhc2jtTDcZpi4LxS44BE4sNy-cHDOzsRO0g";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
