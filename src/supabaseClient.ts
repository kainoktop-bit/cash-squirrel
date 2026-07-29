import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = "https://yyzdadhwogumkazfkvsk.supabase.co";
export const supabaseAnonKey = "sb_publishable_E8iQRzBcctPPsn0ts4jOHg_10O0ab_r";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
