// lib/supabaseClient.js
"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

let client;

export function supabase() {
  if (!client) {
    client = createClientComponentClient({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      options: { auth: { persistSession: true, autoRefreshToken: true } },
    });
  }
  return client;
}
