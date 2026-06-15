import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// Tu URL real basada en el ID de tu proyecto
const supabaseUrl = 'https://ymwuwkptaqaptoyvbnbk.supabase.co'; 

// Tu clave pública Anon real
const supabaseKey = 'sb_publishable_SwsT7Ttgb-RaAdDNiqvDlw_GeFffyp7';

export const supabase = createClient(supabaseUrl, supabaseKey);