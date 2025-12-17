import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const handler = async () => {
  const response = NextResponse.next();
  const supabase = createRouteHandlerClient({ cookies });
  await supabase.auth.getSession();
  return response;
};

export const GET = handler;
export const POST = handler;
