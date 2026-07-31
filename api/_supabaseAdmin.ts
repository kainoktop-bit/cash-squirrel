import { createClient } from '@supabase/supabase-js';
import { supabaseUrl } from '../src/supabaseClient.js';

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
}

// Server-only client that bypasses Row Level Security. Never import this from client code.
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
