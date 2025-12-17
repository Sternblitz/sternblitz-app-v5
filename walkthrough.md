# Walkthrough - Admin Special Discount

## Overview
Implemented a feature for admins to create special, one-time discount links. The discount is a fixed Euro amount that overrides any referral codes.

## Changes

### Dashboard (`/dashboard`)
- Added a "Rabatt" button (formerly "Spezial") to the header.
- Restored "Meine Aufträge" button for easy access to orders.
- "Rabatt" button is **only visible to admins** (checked via Supabase `profiles.role`, supports both "ADMIN" and "admin").
- Clicking "Rabatt" prompts for a discount amount (in Euro).
- Stores the discount in `sessionStorage` and redirects to the Sign page.

### Sign Page (`/sign`)
- Restored and updated logic to handle `customDiscount`.
- Displays a "Spezial-Rabatt" banner if a custom discount is active.
- Updates price calculation to use the custom discount.
- `createShareLink` includes the `customDiscount` in the generated link payload.
- `submit` sends the `customDiscount` to the backend.

### Backend API
- **`POST /api/sign/prefill`**: Updated to allow `customDiscount` in the payload.
- **`POST /api/sign/submit`**: 
    - Accepts `customDiscount`.
    - If `customDiscount` is present (> 0), it **overrides** any referral code logic.
    - Sets `appliedDiscount` to the custom amount.
    - Clears `referralCode` to avoid confusion in PDF/Email.
    - Passes the discount to `pdfGenerator` and email templates.

### PDF & Email
- **PDF**: Displays "Fixpreis: [Base] -> [Final] (Promo aktiv)" or similar.
- **Email**: Shows the discounted price and "Fixpreis" calculation.

## Verification
- **Admin Check**: The "Spezial" button is wrapped in an `isAdmin` check.
- **Persistence**: The discount is passed from Dashboard -> Session -> Sign Page -> Share Link -> Backend.
- **Security**: The discount is applied server-side based on the payload (which comes from the signed link or session).
