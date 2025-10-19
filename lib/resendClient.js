// lib/resendClient.js
import { Resend } from "resend";

let _resend;
export function getResend() {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY missing");
    _resend = new Resend(key);
  }
  return _resend;
}
