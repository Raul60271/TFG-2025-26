import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// URL real basada en el ID del proyecto
const supabaseUrl = 'https://ymwuwkptaqaptoyvbnbk.supabase.co'; 

// Clave pública Anon real
const supabaseKey = 'sb_publishable_SwsT7Ttgb-RaAdDNiqvDlw_GeFffyp7';

export const supabase = createClient(supabaseUrl, supabaseKey);