import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const supabaseConfig = {
  supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

const handler = async () => {
  const response = NextResponse.next();
  const supabase = createRouteHandlerClient({ cookies }, supabaseConfig);
  await supabase.auth.getSession();
  return response;
};

export const GET = handler;
export const POST = handler;
