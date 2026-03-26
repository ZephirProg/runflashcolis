import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://mxgpezbonzynrzluyyod.supabase.co';
const SUPABASE_KEY = 'sb_publishable_0alSt0lQd1qyVx2UPF90rw_uoVLin9B';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);