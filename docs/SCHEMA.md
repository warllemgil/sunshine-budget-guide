# Estrutura do Banco de Dados — Sunshine Budget Guide

Este documento descreve com precisão a estrutura de banco de dados que o aplicativo espera encontrar no Supabase.

---

## Tabelas utilizadas pelo aplicativo

O projeto utiliza **5 tabelas**:

1. `usuarios`
2. `cartoes`
3. `merchants`
4. `lancamentos`
5. `faturas`

---

## 1. Tabela `usuarios`

Armazena o perfil básico do usuário. O campo `id` corresponde ao `auth.users.id` do Supabase (criado automaticamente via trigger no signup).

| Coluna       | Tipo         | Restrições                        | Descrição                       |
|--------------|--------------|-----------------------------------|---------------------------------|
| `id`         | `uuid`       | PRIMARY KEY, NOT NULL             | Igual ao `auth.users.id`        |
| `nome`       | `text`       | NOT NULL, DEFAULT `''`            | Nome do usuário                 |
| `email`      | `text`       | NOT NULL, DEFAULT `''`            | E-mail do usuário               |
| `created_at` | `timestamptz`| NOT NULL, DEFAULT `now()`         | Data de criação                 |

### Operações utilizadas no código

| Operação  | Campos                     | Filtros           |
|-----------|----------------------------|-------------------|
| `SELECT`  | `*`                        | `id = auth.uid()` |
| `UPDATE`  | `nome`, `email`            | `id = auth.uid()` |
| `INSERT`  | `id`, `nome`, `email`      | —                 |

### SQL de criação

```sql
CREATE TABLE public.usuarios (
  id          UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome        TEXT          NOT NULL DEFAULT '',
  email       TEXT          NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);
```

---

## 2. Tabela `cartoes`

Cartões de crédito cadastrados pelo usuário.

| Coluna        | Tipo           | Restrições                        | Descrição                              |
|---------------|----------------|-----------------------------------|----------------------------------------|
| `id`          | `uuid`         | PRIMARY KEY, NOT NULL             | Identificador do cartão                |
| `usuario_id`  | `uuid`         | NOT NULL, FK → `auth.users(id)`   | Dono do cartão                         |
| `nome`        | `text`         | NOT NULL, DEFAULT `''`            | Nome/apelido do cartão                 |
| `limite`      | `numeric(12,2)`| NOT NULL, DEFAULT `0`             | Limite do cartão em reais              |
| `fechamento`  | `integer`      | NOT NULL, DEFAULT `1`             | Dia do mês em que a fatura fecha       |
| `vencimento`  | `integer`      | NOT NULL, DEFAULT `10`            | Dia do mês em que a fatura vence       |
| `created_at`  | `timestamptz`  | NOT NULL, DEFAULT `now()`         | Data de criação                        |

### Operações utilizadas no código

| Operação  | Campos                                             | Filtros / Ordem           |
|-----------|----------------------------------------------------|---------------------------|
| `SELECT`  | `*`                                                | `usuario_id = auth.uid()`, `ORDER BY created_at` |
| `INSERT`  | `usuario_id`, `nome`, `limite`, `fechamento`, `vencimento` | —               |
| `UPDATE`  | `nome`, `limite`, `fechamento`, `vencimento`       | `id = :id`                |
| `DELETE`  | —                                                  | `id = :id`                |

### SQL de criação

```sql
CREATE TABLE public.cartoes (
  id          UUID            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id  UUID            NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome        TEXT            NOT NULL DEFAULT '',
  limite      NUMERIC(12,2)   NOT NULL DEFAULT 0,
  fechamento  INTEGER         NOT NULL DEFAULT 1,
  vencimento  INTEGER         NOT NULL DEFAULT 10,
  created_at  TIMESTAMPTZ     NOT NULL DEFAULT now()
);
```

---

## 3. Tabela `merchants`

Diretório compartilhado de estabelecimentos/lojas. Não possui `usuario_id` — é global.

| Coluna               | Tipo         | Restrições                  | Descrição                                       |
|----------------------|--------------|-----------------------------|--------------------------------------------------|
| `id`                 | `uuid`       | PRIMARY KEY, NOT NULL       | Identificador do merchant                        |
| `name`               | `text`       | NOT NULL                    | Nome original do estabelecimento                 |
| `normalized_name`    | `text`       | NOT NULL, UNIQUE            | Nome normalizado (minúsculas, sem pontuação)     |
| `domain`             | `text`       | —                           | Domínio do site (ex: `amazon.com.br`)            |
| `logo_url`           | `text`       | —                           | URL pública do logotipo                          |
| `logo_storage_path`  | `text`       | —                           | Caminho no bucket `merchant-logos`               |
| `created_at`         | `timestamptz`| NOT NULL, DEFAULT `now()`   | Data de criação                                  |

### Operações utilizadas no código

| Operação  | Campos                                                       | Filtros                         |
|-----------|--------------------------------------------------------------|---------------------------------|
| `SELECT`  | `id`, `logo_url`, `domain`                                   | `normalized_name = :name`       |
| `INSERT`  | `name`, `normalized_name`, `domain`, `logo_url`              | —                               |
| `UPDATE`  | `domain`, `logo_url`                                         | `id = :id`                      |

### SQL de criação

```sql
CREATE TABLE public.merchants (
  id                  UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name                TEXT          NOT NULL,
  normalized_name     TEXT          NOT NULL UNIQUE,
  domain              TEXT,
  logo_url            TEXT,
  logo_storage_path   TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);
```

---

## 4. Tabela `lancamentos`

Lançamentos financeiros do usuário (despesas com cartão, despesas avulsas, despesas fixas, parcelamentos).

| Coluna               | Tipo           | Restrições                        | Descrição                                                         |
|----------------------|----------------|-----------------------------------|-------------------------------------------------------------------|
| `id`                 | `uuid`         | PRIMARY KEY, NOT NULL             | Identificador do lançamento                                       |
| `usuario_id`         | `uuid`         | NOT NULL, FK → `auth.users(id)`   | Dono do lançamento                                                |
| `descricao`          | `text`         | NOT NULL, DEFAULT `''`            | Descrição da despesa                                              |
| `valor`              | `numeric(12,2)`| NOT NULL, DEFAULT `0`             | Valor em reais                                                    |
| `data`               | `date`         | NOT NULL, DEFAULT `CURRENT_DATE`  | Data efetiva para agrupamento na fatura (pode ser ajustada +1 mês)|
| `data_compra`        | `date`         | —                                 | Data original da compra escolhida pelo usuário (nullable)         |
| `categoria`          | `text`         | NOT NULL, DEFAULT `'outros'`      | Categoria da despesa                                              |
| `fixa`               | `boolean`      | NOT NULL, DEFAULT `false`         | Indica se é despesa fixa mensal                                   |
| `cartao_id`          | `uuid`         | FK → `cartoes(id)`, nullable      | Cartão usado (null se for pagamento à vista)                      |
| `parcela_atual`      | `integer`      | —                                 | Número da parcela atual (ex: 3 de 12) (nullable)                  |
| `parcelas`           | `integer`      | —                                 | Total de parcelas (nullable)                                      |
| `loja`               | `text`         | —                                 | Nome da loja/estabelecimento (nullable)                           |
| `merchant_id`        | `uuid`         | FK → `merchants(id)`, nullable    | Referência ao merchant (nullable)                                 |
| `merchant_logo_url`  | `text`         | —                                 | URL em cache do logo do merchant (nullable)                       |
| `created_at`         | `timestamptz`  | NOT NULL, DEFAULT `now()`         | Data de criação                                                   |

### Operações utilizadas no código

| Operação  | Campos                                                                                                                    | Filtros / Ordem                                                     |
|-----------|---------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------|
| `SELECT`  | `*`                                                                                                                       | `usuario_id = auth.uid()`, `data >= :startDate`, `data < :endDate`, `ORDER BY data DESC` |
| `INSERT`  | `usuario_id`, `descricao`, `valor`, `data`, `data_compra`, `categoria`, `fixa`, `cartao_id`, `parcela_atual`, `parcelas`, `loja`, `merchant_id`, `merchant_logo_url` | — |
| `UPDATE`  | `descricao`, `valor`, `data`, `data_compra`, `categoria`, `fixa`, `cartao_id`, `parcela_atual`, `parcelas`, `loja`, `merchant_id`, `merchant_logo_url` | `id = :id` |
| `DELETE`  | —                                                                                                                         | `id = :id`                                                          |

### SQL de criação

```sql
CREATE TABLE public.lancamentos (
  id                UUID            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id        UUID            NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  descricao         TEXT            NOT NULL DEFAULT '',
  valor             NUMERIC(12,2)   NOT NULL DEFAULT 0,
  data              DATE            NOT NULL DEFAULT CURRENT_DATE,
  data_compra       DATE,
  categoria         TEXT            NOT NULL DEFAULT 'outros',
  fixa              BOOLEAN         NOT NULL DEFAULT false,
  cartao_id         UUID            REFERENCES public.cartoes(id) ON DELETE SET NULL,
  parcela_atual     INTEGER,
  parcelas          INTEGER,
  loja              TEXT,
  merchant_id       UUID            REFERENCES public.merchants(id) ON DELETE SET NULL,
  merchant_logo_url TEXT,
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT now()
);
```

---

## 5. Tabela `faturas`

Faturas mensais de cartões de crédito. Cada registro é único por cartão + mês + ano.

| Coluna        | Tipo           | Restrições                                    | Descrição                            |
|---------------|----------------|-----------------------------------------------|--------------------------------------|
| `id`          | `uuid`         | PRIMARY KEY, NOT NULL                         | Identificador da fatura              |
| `usuario_id`  | `uuid`         | NOT NULL, FK → `auth.users(id)`               | Dono da fatura                       |
| `cartao_id`   | `uuid`         | NOT NULL, FK → `cartoes(id)`                  | Cartão da fatura                     |
| `mes`         | `integer`      | NOT NULL                                      | Mês da fatura (1–12)                 |
| `ano`         | `integer`      | NOT NULL                                      | Ano da fatura (ex: 2026)             |
| `valor_total` | `numeric(12,2)`| NOT NULL, DEFAULT `0`                         | Valor total dos lançamentos na fatura|
| `status`      | `text`         | NOT NULL, DEFAULT `'pendente'`, CHECK `IN ('pago','pendente')` | Status da fatura |
| `created_at`  | `timestamptz`  | NOT NULL, DEFAULT `now()`                     | Data de criação                      |

**Restrição única:** `(cartao_id, mes, ano)` — não podem existir duas faturas do mesmo cartão no mesmo mês/ano.

### Operações utilizadas no código

| Operação  | Campos                                          | Filtros                                             |
|-----------|-------------------------------------------------|-----------------------------------------------------|
| `SELECT`  | `*`                                             | `usuario_id = auth.uid()`, `mes = :mes`, `ano = :ano` |
| `INSERT`  | `usuario_id`, `cartao_id`, `mes`, `ano`, `status`, `valor_total` | — |
| `UPDATE`  | `status`, `valor_total`                         | `id = :id`                                          |

### SQL de criação

```sql
CREATE TABLE public.faturas (
  id          UUID            NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id  UUID            NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cartao_id   UUID            NOT NULL REFERENCES public.cartoes(id) ON DELETE CASCADE,
  mes         INTEGER         NOT NULL,
  ano         INTEGER         NOT NULL,
  valor_total NUMERIC(12,2)   NOT NULL DEFAULT 0,
  status      TEXT            NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pago', 'pendente')),
  created_at  TIMESTAMPTZ     NOT NULL DEFAULT now(),
  UNIQUE (cartao_id, mes, ano)
);
```

---

## Relacionamentos (Foreign Keys)

```
usuarios.id          ← auth.users.id  (mesmo valor; trigger auto-cria registro)
cartoes.usuario_id   → auth.users(id)  ON DELETE CASCADE
lancamentos.usuario_id → auth.users(id) ON DELETE CASCADE
lancamentos.cartao_id  → cartoes(id)   ON DELETE SET NULL
lancamentos.merchant_id → merchants(id) ON DELETE SET NULL
faturas.usuario_id   → auth.users(id)  ON DELETE CASCADE
faturas.cartao_id    → cartoes(id)     ON DELETE CASCADE
```

---

## Storage Buckets

| Bucket           | Visibilidade | Uso                                                |
|------------------|--------------|----------------------------------------------------|
| `comprovantes`   | Privado      | Comprovantes de pagamento de fatura (por usuário)  |
| `merchant-logos` | Público      | Logotipos de merchants/estabelecimentos            |

---

## SQL Completo

O arquivo [`supabase/schema_completo.sql`](../supabase/schema_completo.sql) contém o SQL completo para criação de todas as tabelas, índices, políticas RLS e storage buckets compatíveis com o aplicativo.

Para aplicar em uma instância Supabase nova ou existente, basta abrir o **SQL Editor** no painel do Supabase e executar o conteúdo do arquivo.

---

## Notas de implementação

### Lógica de data de fatura (`data` vs `data_compra`)

- `data_compra`: data original da compra informada pelo usuário.
- `data`: data efetiva usada para determinar em qual fatura o lançamento aparece.
  - Se o dia da compra for **após** o `fechamento` do cartão → `data = data_compra + 1 mês` (vai para a próxima fatura).
  - Caso contrário → `data = data_compra` (fica na fatura atual).

### Parcelamentos

- Cada parcela é um **registro separado** em `lancamentos`.
- `parcela_atual` = número da parcela (ex: 1, 2, 3…).
- `parcelas` = total de parcelas (ex: 12).
- A `descricao` inclui o sufixo ` (N/M)` para identificação.

### Merchants e logos

- `merchants.normalized_name` é UNIQUE — evita duplicatas de estabelecimentos.
- A lógica de busca de logo usa (em ordem): cache local do browser → tabela `merchants` no DB → bucket `merchant-logos` no Supabase Storage → APIs externas (Brandfetch / Google Favicon).
- `lancamentos.merchant_logo_url` é um campo de cache local para evitar consultas repetidas.
