-- Add PAID_DELETED to order_status enum
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'PAID_DELETED';
