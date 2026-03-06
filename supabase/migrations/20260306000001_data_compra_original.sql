-- Ensure data_compra column exists in lancamentos to store the original
-- purchase date chosen by the user. The `data` column continues to hold
-- the effective invoice date used for month filtering/grouping.
ALTER TABLE public.lancamentos ADD COLUMN IF NOT EXISTS data_compra DATE;

-- Backfill existing rows: for rows that still have no data_compra,
-- default to the effective date stored in `data`.
UPDATE public.lancamentos
SET data_compra = data
WHERE data_compra IS NULL;
