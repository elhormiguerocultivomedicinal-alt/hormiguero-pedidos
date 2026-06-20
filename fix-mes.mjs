import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const { error } = await supabase.from("pedidos").update({ mes: "6/2026" }).is("mes", null);
if (error) console.error("ERROR:", error.message);
else console.log("Pedidos actualizados con mes 6/2026");
