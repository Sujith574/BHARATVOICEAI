import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = (process.env["EXPO_PUBLIC_SUPABASE_URL"] as string) || "https://placeholder-ref.supabase.co";
const SUPABASE_ANON_KEY = (process.env["EXPO_PUBLIC_SUPABASE_ANON_KEY"] as string) || "placeholder-anon-key";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
