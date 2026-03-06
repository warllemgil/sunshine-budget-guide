-- ============================================================
-- SUNSHINE BUDGET GUIDE — SCHEMA COMPLETO DO BANCO DE DADOS
-- ============================================================
-- Este arquivo contém a criação completa do banco de dados
-- compatível com o aplicativo Sunshine Budget Guide.
--
-- Execute este SQL no editor SQL do Supabase para criar ou
-- recriar toda a estrutura do banco do zero.
--
-- Ordem de criação (respeita dependências / foreign keys):
--   1. usuarios
--   2. cartoes
--   3. merchants
--   4. lancamentos
--   5. faturas
-- ============================================================


-- ============================================================
-- FUNÇÕES AUXILIARES
-- ============================================================

-- Atualiza updated_at automaticamente em qualquer tabela que use essa trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;


-- ============================================================
-- TABELA 1: usuarios
-- ============================================================
-- Perfil do usuário vinculado ao sistema de autenticação do Supabase.
-- O campo `id` é igual ao auth.users.id — gerado pelo Supabase Auth.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.usuarios (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome        TEXT        NOT NULL DEFAULT '',
  email       TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

-- Políticas de segurança (RLS)
CREATE POLICY "Usuário pode ver seu próprio perfil"
  ON public.usuarios FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Usuário pode atualizar seu próprio perfil"
  ON public.usuarios FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Usuário pode inserir seu próprio perfil"
  ON public.usuarios FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Trigger: criar registro em usuarios automaticamente após cadastro no Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.usuarios (id, nome, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'nome', ''),
    COALESCE(NEW.email, '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- TABELA 2: cartoes
-- ============================================================
-- Cartões de crédito cadastrados pelo usuário.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cartoes (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome        TEXT        NOT NULL DEFAULT '',
  limite      NUMERIC(12,2) NOT NULL DEFAULT 0,
  fechamento  INTEGER     NOT NULL DEFAULT 1,   -- dia do mês em que a fatura fecha
  vencimento  INTEGER     NOT NULL DEFAULT 10,  -- dia do mês em que a fatura vence
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.cartoes ENABLE ROW LEVEL SECURITY;

-- Políticas de segurança (RLS)
CREATE POLICY "Usuário pode ver seus cartões"
  ON public.cartoes FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY "Usuário pode inserir seus cartões"
  ON public.cartoes FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Usuário pode atualizar seus cartões"
  ON public.cartoes FOR UPDATE
  USING (auth.uid() = usuario_id);

CREATE POLICY "Usuário pode excluir seus cartões"
  ON public.cartoes FOR DELETE
  USING (auth.uid() = usuario_id);


-- ============================================================
-- TABELA 3: merchants
-- ============================================================
-- Diretório de estabelecimentos/lojas com informações de logotipo.
-- Compartilhado entre todos os usuários (não tem usuario_id).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.merchants (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name                TEXT        NOT NULL,
  normalized_name     TEXT        NOT NULL UNIQUE,  -- nome normalizado (minúsculas, sem pontuação)
  domain              TEXT,                          -- domínio do site (ex: "amazon.com.br")
  logo_url            TEXT,                          -- URL pública do logotipo
  logo_storage_path   TEXT,                          -- caminho no bucket "merchant-logos"
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;

-- Políticas de segurança (RLS)
CREATE POLICY "Qualquer usuário pode ler merchants"
  ON public.merchants FOR SELECT
  USING (true);

CREATE POLICY "Usuários autenticados podem inserir merchants"
  ON public.merchants FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Usuários autenticados podem atualizar merchants"
  ON public.merchants FOR UPDATE
  USING (auth.role() = 'authenticated');


-- ============================================================
-- TABELA 4: lancamentos
-- ============================================================
-- Lançamentos financeiros (despesas e receitas) do usuário.
--
-- Campos importantes:
--   data        → data efetiva usada para agrupar na fatura (pode ser ajustada
--                  com +1 mês se a compra for após o fechamento do cartão)
--   data_compra → data original da compra escolhida pelo usuário
--   fixa        → true = despesa fixa (repetida mensalmente)
--   parcela_atual / parcelas → ex: 3/12 (3ª parcela de 12)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lancamentos (
  id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  descricao         TEXT        NOT NULL DEFAULT '',
  valor             NUMERIC(12,2) NOT NULL DEFAULT 0,
  data              DATE        NOT NULL DEFAULT CURRENT_DATE,
  data_compra       DATE,                              -- data original da compra (nullable)
  categoria         TEXT        NOT NULL DEFAULT 'outros',
  fixa              BOOLEAN     NOT NULL DEFAULT false,
  cartao_id         UUID        REFERENCES public.cartoes(id) ON DELETE SET NULL,
  parcela_atual     INTEGER,                           -- número da parcela atual (nullable)
  parcelas          INTEGER,                           -- total de parcelas (nullable)
  loja              TEXT,                              -- nome da loja/estabelecimento (nullable)
  merchant_id       UUID        REFERENCES public.merchants(id) ON DELETE SET NULL,
  merchant_logo_url TEXT,                              -- URL do logo do merchant (cache) (nullable)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS lancamentos_usuario_id_data_idx
  ON public.lancamentos (usuario_id, data DESC);

CREATE INDEX IF NOT EXISTS lancamentos_cartao_id_idx
  ON public.lancamentos (cartao_id);

CREATE INDEX IF NOT EXISTS lancamentos_merchant_id_idx
  ON public.lancamentos (merchant_id);

-- Habilitar RLS
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;

-- Políticas de segurança (RLS)
CREATE POLICY "Usuário pode ver seus lançamentos"
  ON public.lancamentos FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY "Usuário pode inserir seus lançamentos"
  ON public.lancamentos FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Usuário pode atualizar seus lançamentos"
  ON public.lancamentos FOR UPDATE
  USING (auth.uid() = usuario_id);

CREATE POLICY "Usuário pode excluir seus lançamentos"
  ON public.lancamentos FOR DELETE
  USING (auth.uid() = usuario_id);


-- ============================================================
-- TABELA 5: faturas
-- ============================================================
-- Faturas mensais dos cartões de crédito.
-- Cada fatura é única por cartão + mês + ano (UNIQUE constraint).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.faturas (
  id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cartao_id   UUID        NOT NULL REFERENCES public.cartoes(id) ON DELETE CASCADE,
  mes         INTEGER     NOT NULL,  -- mês da fatura (1-12)
  ano         INTEGER     NOT NULL,  -- ano da fatura (ex: 2026)
  valor_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  status      TEXT        NOT NULL DEFAULT 'pendente'  -- 'pago' ou 'pendente'
                CHECK (status IN ('pago', 'pendente')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cartao_id, mes, ano)
);

-- Índice para consultas por usuário + período
CREATE INDEX IF NOT EXISTS faturas_usuario_id_mes_ano_idx
  ON public.faturas (usuario_id, ano DESC, mes DESC);

-- Habilitar RLS
ALTER TABLE public.faturas ENABLE ROW LEVEL SECURITY;

-- Políticas de segurança (RLS)
CREATE POLICY "Usuário pode ver suas faturas"
  ON public.faturas FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY "Usuário pode inserir suas faturas"
  ON public.faturas FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Usuário pode atualizar suas faturas"
  ON public.faturas FOR UPDATE
  USING (auth.uid() = usuario_id);

CREATE POLICY "Usuário pode excluir suas faturas"
  ON public.faturas FOR DELETE
  USING (auth.uid() = usuario_id);


-- ============================================================
-- STORAGE BUCKETS
-- ============================================================

-- Bucket para comprovantes de pagamento (privado)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('comprovantes', 'comprovantes', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Usuário pode fazer upload de comprovantes"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'comprovantes'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Usuário pode visualizar seus comprovantes"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'comprovantes'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Usuário pode excluir seus comprovantes"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'comprovantes'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Bucket para logotipos de merchants (público)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('merchant-logos', 'merchant-logos', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Usuários autenticados podem fazer upload de logos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'merchant-logos' AND auth.role() = 'authenticated');

CREATE POLICY "Usuários autenticados podem atualizar logos"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'merchant-logos' AND auth.role() = 'authenticated');

CREATE POLICY "Qualquer um pode visualizar logos de merchants"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'merchant-logos');
