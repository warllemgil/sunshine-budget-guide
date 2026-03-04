-- ============================================
-- 1. ADD merchant_logo_url TO lancamentos
-- ============================================
ALTER TABLE public.lancamentos
  ADD COLUMN IF NOT EXISTS merchant_logo_url TEXT;

-- ============================================
-- 2. CREATE PUBLIC merchant-logos BUCKET
-- ============================================
INSERT INTO storage.buckets (id, name, public)
  VALUES ('merchant-logos', 'merchant-logos', true)
  ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload/upsert logos
CREATE POLICY "Authenticated users can upload merchant logos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'merchant-logos' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update merchant logos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'merchant-logos' AND auth.role() = 'authenticated');

-- Allow anyone to view (public bucket)
CREATE POLICY "Anyone can view merchant logos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'merchant-logos');
