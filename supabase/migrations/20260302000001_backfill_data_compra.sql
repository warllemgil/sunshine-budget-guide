-- Backfill data_compra for card purchases recorded before this column was saved.
--
-- Billing-date rule (applied at insert time):
--   If purchase day > card dia_fechamento → effective date = purchase date + 1 month
--   Otherwise                            → effective date = purchase date
--
-- Reverse rule (used here to recover the original purchase date):
--   If stored effective-date day > card dia_fechamento → original = effective date − 1 month
--   Otherwise                                          → original = effective date
--
-- For installment groups (parcela_grupo_id), all parcels share the same original purchase
-- date, so we derive it from the FIRST installment's effective date.

-- Step 1: Installment groups linked to a card
WITH group_origin AS (
  SELECT
    l.parcela_grupo_id,
    MIN(l.data) AS first_data,
    c.dia_fechamento
  FROM public.lancamentos l
  JOIN public.cartoes c ON c.id = l.cartao_id
  WHERE l.data_compra IS NULL
    AND l.metodo = 'cartao'
    AND l.parcela_grupo_id IS NOT NULL
    AND l.cartao_id IS NOT NULL
  GROUP BY l.parcela_grupo_id, c.dia_fechamento
)
UPDATE public.lancamentos l
SET data_compra = CASE
  WHEN go.dia_fechamento IS NOT NULL AND EXTRACT(DAY FROM go.first_data) > go.dia_fechamento
    THEN (go.first_data - INTERVAL '1 month')::DATE
  ELSE go.first_data
END
FROM group_origin go
WHERE l.parcela_grupo_id = go.parcela_grupo_id
  AND l.data_compra IS NULL;

-- Step 2: Single card purchases (no installment group) linked to a card
UPDATE public.lancamentos l
SET data_compra = CASE
  WHEN c.dia_fechamento IS NOT NULL AND EXTRACT(DAY FROM l.data) > c.dia_fechamento
    THEN (l.data - INTERVAL '1 month')::DATE
  ELSE l.data
END
FROM public.cartoes c
WHERE l.data_compra IS NULL
  AND l.metodo = 'cartao'
  AND l.cartao_id = c.id
  AND l.parcela_grupo_id IS NULL;

-- Step 3: Any remaining entries without data_compra default to data
UPDATE public.lancamentos
SET data_compra = data
WHERE data_compra IS NULL;
