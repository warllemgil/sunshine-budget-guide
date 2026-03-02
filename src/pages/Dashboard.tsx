import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import MonthSelector from "@/components/MonthSelector";
import NovoLancamentoModal from "@/components/NovoLancamentoModal";
import { formatCurrency } from "@/lib/formatters";
import { getCategoriaInfo } from "@/lib/categories";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingUp, TrendingDown, CreditCard, ShoppingBag,
  ChevronDown, ChevronUp, Plus, Trash2, Edit2, Check, Undo2, Paperclip,
} from "lucide-react";
import { ReceiptUploadButton } from '@/components/ReceiptUploadButton';
import { ReceiptViewer } from '@/components/ReceiptViewer';
import type { Tables } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { useShareTarget } from "@/hooks/useShareTarget";

const Dashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());
  const [editItem, setEditItem] = useState<Tables<"lancamentos"> | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [showPagarModal, setShowPagarModal] = useState(false);
  const [pagarCartaoId, setPagarCartaoId] = useState<string | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptLancamento, setReceiptLancamento] = useState<Tables<"lancamentos"> | null>(null);
  const [pendingDeleteItem, setPendingDeleteItem] = useState<Tables<"lancamentos"> | null>(null);

  const { sharedFile, clearSharedFile } = useShareTarget();

  // Auto-open the new transaction modal when the app receives a shared receipt
  useEffect(() => {
    if (sharedFile && user) {
      setEditItem(null);
      setShowEdit(true);
    }
  }, [sharedFile, user]);

  const startDate = `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
  const endDate = mes === 11 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 2).padStart(2, "0")}-01`;

  const { data: lancamentos = [] } = useQuery({
    queryKey: ["lancamentos", user?.id, mes, ano],
    queryFn: async () => {
      const { data, error } = await supabase.from("lancamentos").select("*")
        .eq("user_id", user!.id).gte("data", startDate).lt("data", endDate)
        .order("data", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: cartoes = [], isSuccess: cartoesLoaded } = useQuery({
    queryKey: ["cartoes", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("cartoes").select("*").eq("user_id", user!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: faturas = [] } = useQuery({
    queryKey: ["faturas", user?.id, mes, ano],
    queryFn: async () => {
      const { data, error } = await supabase.from("faturas").select("*").eq("user_id", user!.id)
        .eq("mes", mes + 1).eq("ano", ano);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const stats = useMemo(() => {
    const receitas = lancamentos.filter((l) => l.tipo === "receita");
    const despesas = lancamentos.filter((l) => l.tipo === "despesa");
    const totalReceita = receitas.reduce((s, l) => s + l.valor, 0);
    const totalDespesa = despesas.reduce((s, l) => s + l.valor, 0);
    const fixasReceita = receitas.filter((l) => l.fixo);
    const fixasDespesa = despesas.filter((l) => l.fixo && l.metodo === "avista");
    const cartaoIds = new Set(cartoes.map((c) => c.id));
    // Only include card expenses that are linked to an existing card
    const cartaoLanc = despesas.filter((l) => l.metodo === "cartao" && !!l.cartao_id && cartaoIds.has(l.cartao_id));
    const variaveis = despesas.filter((l) => !l.fixo && l.metodo === "avista");
    // Orphaned: metodo=cartao but no valid card → invisible and causes ghost balance reduction
    const orfaos = cartoesLoaded
      ? despesas.filter((l) => l.metodo === "cartao" && (!l.cartao_id || !cartaoIds.has(l.cartao_id)))
      : [];
    return { totalReceita, totalDespesa, fixasReceita, fixasDespesa, cartaoLanc, variaveis, orfaos };
  }, [lancamentos, cartoes, cartoesLoaded]);

  const saldo = stats.totalReceita - stats.totalDespesa;
  const pctGasto = stats.totalReceita > 0
    ? Math.min(100, Math.round((stats.totalDespesa / stats.totalReceita) * 100)) : 0;

  const openEdit = (item: Tables<"lancamentos">) => {
    setEditItem(item);
    setShowEdit(true);
  };

  const closePendingDelete = (open: boolean) => {
    if (!open) setPendingDeleteItem(null);
  };

  // Group card expenses by card, including cards with no expenses
  const cartaoGroups = useMemo(() => {
    const groups = new Map<string, { cartao: Tables<"cartoes">; total: number; pago: boolean; fatura: Tables<"faturas"> | null; compras: Tables<"lancamentos">[] }>();

    // Init all cards
    cartoes.forEach((c) => {
      const fatura = faturas.find((f) => f.cartao_id === c.id);
      groups.set(c.id, { cartao: c, total: 0, pago: fatura?.pago ?? false, fatura: fatura ?? null, compras: [] });
    });

    stats.cartaoLanc.forEach((l) => {
      if (!l.cartao_id) return;
      const g = groups.get(l.cartao_id);
      if (g) {
        g.total += l.valor;
        g.compras.push(l);
      }
    });

    return Array.from(groups.values());
  }, [stats.cartaoLanc, cartoes, faturas]);

  const deleteLancamento = useMutation({
    mutationFn: async (l: Tables<"lancamentos">) => {
      if (l.parcela_grupo_id) {
        // Delete all installments in the same group (past, present and future)
        const { error } = await supabase
          .from("lancamentos")
          .delete()
          .eq("parcela_grupo_id", l.parcela_grupo_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("lancamentos").delete().eq("id", l.id);
        if (error) throw error;
      }
    },
    onSuccess: (_data, l) => {
      qc.invalidateQueries({ queryKey: ["lancamentos"] });
      toast({
        title: l.parcela_grupo_id ? "Parcelas removidas!" : "Compra removida!",
        description: l.parcela_grupo_id ? "Todas as parcelas da compra foram excluídas." : undefined,
      });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao excluir", description: err.message, variant: "destructive" });
    },
  });

  const togglePago = useMutation({
    mutationFn: async ({ cartaoId, pago }: { cartaoId: string; pago: boolean }) => {
      const fatura = faturas.find((f) => f.cartao_id === cartaoId);
      if (pago) {
        // Undo payment
        if (fatura) {
          const { error } = await supabase.from("faturas").update({ pago: false, valor_pago: null, data_pagamento: null }).eq("id", fatura.id);
          if (error) throw error;
        }
      } else {
        // Open pay modal
        setPagarCartaoId(cartaoId);
        setShowPagarModal(true);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["faturas"] }),
  });

  return (
    <div className="mx-auto max-w-lg space-y-5 p-4">
      <MonthSelector mes={mes} ano={ano} onChange={(m, a) => { setMes(m); setAno(a); setExpandedCard(null); }} />

      {/* Saldo */}
      <Card>
        <CardContent className="p-5">
          <p className="text-sm text-muted-foreground">Saldo disponível</p>
          <p className={cn("text-3xl font-bold", saldo >= 0 ? "text-success" : "text-destructive")}>
            {formatCurrency(saldo)}
          </p>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{pctGasto}% gasto</span>
            <span className="text-muted-foreground">{formatCurrency(stats.totalDespesa)} / {formatCurrency(stats.totalReceita)}</span>
          </div>
          <Progress value={pctGasto} className="mt-2 h-2" />
        </CardContent>
      </Card>

      {/* Entradas Fixas */}
      {stats.fixasReceita.length > 0 && (
        <Section title="Entradas Fixas" icon={<TrendingUp className="h-4 w-4 text-success" />}>
          {stats.fixasReceita.map((l) => (
            <LancamentoRow key={l.id} item={l} onClick={() => openEdit(l)} />
          ))}
        </Section>
      )}

      {/* Grid: Saídas Fixas + Cartões lado a lado */}
      <div className="grid grid-cols-2 gap-3">
        {/* Saídas Fixas */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <TrendingDown className="h-3.5 w-3.5 text-destructive" />
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Saídas Fixas</h3>
          </div>
          {stats.fixasDespesa.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma</p>
          )}
          {stats.fixasDespesa.map((l) => (
            <MiniLancamentoRow
              key={l.id}
              item={l}
              onClick={() => openEdit(l)}
              onReceiptClick={() => { setReceiptLancamento(l); setShowReceiptModal(true); }}
            />
          ))}
          {stats.fixasDespesa.length > 0 && (
            <div className="rounded-lg bg-destructive/10 px-2 py-1.5 text-center">
              <p className="text-xs font-semibold text-destructive">
                Total: {formatCurrency(stats.fixasDespesa.reduce((s, l) => s + l.valor, 0))}
              </p>
            </div>
          )}
        </div>

        {/* Cartões resumido */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5 text-primary" />
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cartões</h3>
          </div>
          {cartaoGroups.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum cartão</p>
          )}
          {cartaoGroups.map(({ cartao, total, pago }) => (
            <button
              key={cartao.id}
              onClick={() => setExpandedCard(expandedCard === cartao.id ? null : cartao.id)}
              className="w-full rounded-lg bg-card border border-border p-2 text-left hover:shadow-sm transition-shadow"
            >
              <p className="text-xs font-medium truncate">{cartao.instituicao}</p>
              <p className="text-sm font-semibold">{formatCurrency(total)}</p>
              <div className="flex items-center justify-between mt-1">
                <span className={cn("text-[10px]", pago ? "text-success" : "text-warning")}>
                  {pago ? "✓ Pago" : "Pendente"}
                </span>
                {expandedCard === cartao.id ? (
                  <ChevronUp className="h-3 w-3 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Fatura expandida - compras do cartão selecionado */}
      {expandedCard && (() => {
        const group = cartaoGroups.find((g) => g.cartao.id === expandedCard);
        if (!group) return null;
        return (
          <Card className="border-primary/30">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Fecha dia {group.cartao.dia_fechamento}</p>
                </div>
                <div className="flex flex-col items-center">
                  <CreditCard className="h-6 w-6 text-primary mb-0.5" />
                  <p className="text-sm font-semibold text-center leading-tight">{group.cartao.instituicao}</p>
                  <p className="text-[10px] text-muted-foreground">•••• {group.cartao.final_cartao}</p>
                </div>
                <div className="flex-1 text-right">
                  <p className="text-lg font-bold">{formatCurrency(group.total)}</p>
                  <p className="text-xs text-muted-foreground">Vence dia {group.cartao.dia_vencimento}</p>
                  <span className={cn("text-[10px]", group.pago ? "text-success" : "text-warning")}>
                    {group.pago ? "✓ Pago" : "Pendente"}
                  </span>
                </div>
              </div>

              {/* Lista de compras */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Compras ({group.compras.length})</p>
                {group.compras.length === 0 && (
                  <p className="text-xs text-muted-foreground">Nenhuma compra neste mês.</p>
                )}
                {group.compras.map((l) => {
                  const cat = getCategoriaInfo(l.categoria);
                  const Icon = cat.icon;
                  // Show the original user-chosen purchase date when available
                  const displayDate = l.data_compra || l.data;
                  const formattedDate = new Date(displayDate + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                  return (
                    <div key={l.id} className="flex items-center gap-2 rounded-md bg-secondary p-2">
                      {/* Left: store logo + description */}
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {l.loja ? (
                          <BrandLogo store={l.loja} fallbackIcon={<Icon className="h-3.5 w-3.5" style={{ color: cat.color }} />} fallbackBg={cat.color + "20"} />
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-md flex-shrink-0" style={{ backgroundColor: cat.color + "20" }}>
                            <Icon className="h-3.5 w-3.5" style={{ color: cat.color }} />
                          </div>
                        )}
                        <div className="min-w-0">
                          {l.loja && <p className="text-[10px] text-muted-foreground truncate">{l.loja}</p>}
                          <p className="text-xs font-medium truncate">
                            <span className="text-muted-foreground font-normal mr-1">{formattedDate}</span>
                            {l.descricao}
                          </p>
                          {l.parcela_atual && l.total_parcelas ? (
                            <p className="text-[10px] text-muted-foreground">{l.parcela_atual}/{l.total_parcelas}</p>
                          ) : null}
                        </div>
                      </div>
                      {/* Right: value + actions */}
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <p className="text-xs font-semibold">{formatCurrency(l.valor)}</p>
                        <button onClick={() => openEdit(l)} className="p-1 text-muted-foreground hover:text-foreground">
                          <Edit2 className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => l.parcela_grupo_id ? setPendingDeleteItem(l) : deleteLancamento.mutate(l)}
                          className="p-1 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Ações da fatura */}
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-xs"
                  onClick={() => {
                    setEditItem(null);
                    setShowEdit(true);
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" /> Compra
                </Button>
                {group.pago ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-xs"
                    onClick={() => togglePago.mutate({ cartaoId: group.cartao.id, pago: true })}
                  >
                    <Undo2 className="h-3 w-3 mr-1" /> Desfazer Pgto
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={() => togglePago.mutate({ cartaoId: group.cartao.id, pago: false })}
                  >
                    <Check className="h-3 w-3 mr-1" /> Pagar Fatura
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Despesas órfãs — card expenses with no valid card (ghost expenses) */}
      {stats.orfaos.length > 0 && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-destructive">⚠️</span>
            <p className="text-xs font-semibold text-destructive">Lançamentos sem cartão associado</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Estes lançamentos estão afetando o saldo mas não estão vinculados a nenhum cartão. Toque em um para editar ou excluir.
          </p>
          <div className="space-y-2">
            {stats.orfaos.map((l) => (
              <LancamentoRow key={l.id} item={l} onClick={() => openEdit(l)} />
            ))}
          </div>
        </div>
      )}

      {/* Variáveis */}
      {stats.variaveis.length > 0 && (
        <Section title="Variáveis" icon={<ShoppingBag className="h-4 w-4 text-warning" />}>
          {stats.variaveis.map((l) => (
            <LancamentoRow key={l.id} item={l} onClick={() => openEdit(l)} />
          ))}
        </Section>
      )}

      {lancamentos.length === 0 && cartaoGroups.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          <p>Nenhum lançamento neste mês.</p>
          <p className="text-sm">Toque no + para adicionar.</p>
        </div>
      )}

      <NovoLancamentoModal
        open={showEdit}
        onOpenChange={setShowEdit}
        editItem={editItem}
        sharedFile={sharedFile}
        onSharedFileConsumed={clearSharedFile}
      />

      {/* Modal Comprovante Despesa Fixa */}
      <ReceiptDespesaFixaModal
        open={showReceiptModal}
        onOpenChange={(v) => { setShowReceiptModal(v); if (!v) setReceiptLancamento(null); }}
        lancamento={receiptLancamento}
        onSaved={() => qc.invalidateQueries({ queryKey: ["lancamentos"] })}
      />

      {/* Modal Pagar Fatura */}
      <PagarFaturaModal
        open={showPagarModal}
        onOpenChange={setShowPagarModal}
        cartaoId={pagarCartaoId}
        userId={user?.id || ""}
        mes={mes + 1}
        ano={ano}
        valorTotal={cartaoGroups.find((g) => g.cartao.id === pagarCartaoId)?.total ?? 0}
        faturaExistente={faturas.find((f) => f.cartao_id === pagarCartaoId) ?? null}
      />

      {/* Confirmation dialog for installment group deletion */}
      <AlertDialog open={!!pendingDeleteItem} onOpenChange={closePendingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir parcelamento</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá excluir todas as parcelas do mesmo parcelamento (incluindo meses anteriores). Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDeleteItem) {
                  deleteLancamento.mutate(pendingDeleteItem);
                  setPendingDeleteItem(null);
                }
              }}
            >
              Excluir tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

/* ---- Sub-components ---- */

/**
 * BrandLogo: shows a brand logo fetched from Clearbit Logo API.
 * Falls back to the category icon if the logo cannot be loaded.
 * When VITE_BRANDFETCH_CLIENT_ID is set, uses the Brandfetch CDN instead.
 */
const BrandLogo = ({
  store,
  fallbackIcon,
  fallbackBg,
}: {
  store: string;
  fallbackIcon: React.ReactNode;
  fallbackBg: string;
}) => {
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!store) return;
    setFailed(false);
    // Derive a best-guess domain from the store name (try .com first, then .com.br)
    const slug = store
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");

    const rawClientId = import.meta.env.VITE_BRANDFETCH_CLIENT_ID;
    // Sanitize client ID: only allow alphanumeric chars and hyphens
    const clientId = rawClientId ? String(rawClientId).replace(/[^a-zA-Z0-9-]/g, "") : null;

    if (clientId) {
      setLogoSrc(`https://cdn.brandfetch.io/${slug}.com/w/56/h/56?c=${clientId}`);
    } else {
      setLogoSrc(`https://logo.clearbit.com/${slug}.com`);
    }
  }, [store]);

  const handleError = () => {
    if (!failed && logoSrc) {
      // Try .com.br domain before giving up
      const slug = store
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");
      const fallbackUrl = `https://logo.clearbit.com/${slug}.com.br`;
      if (logoSrc !== fallbackUrl) {
        setLogoSrc(fallbackUrl);
        return;
      }
    }
    setFailed(true);
  };

  if (failed || !logoSrc) {
    return (
      <div className="flex h-7 w-7 items-center justify-center rounded-md flex-shrink-0 bg-primary/10">
        <span className="text-[9px] font-bold text-primary leading-none text-center">
          {store.slice(0, 3).toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-md flex-shrink-0 overflow-hidden bg-white">
      <img
        src={logoSrc}
        alt={store}
        className="h-full w-full object-contain"
        onError={handleError}
      />
    </div>
  );
};

const Section = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <div className="space-y-2">
    <div className="flex items-center gap-2">
      {icon}
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h3>
    </div>
    <div className="space-y-2">{children}</div>
  </div>
);

const LancamentoRow = ({ item, onClick }: { item: Tables<"lancamentos">; onClick: () => void }) => {
  const cat = getCategoriaInfo(item.categoria);
  const Icon = cat.icon;
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-lg bg-card p-3 text-left shadow-sm hover:shadow-md transition-shadow border border-border">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: cat.color + "20" }}>
        <Icon className="h-4 w-4" style={{ color: cat.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{item.descricao}</p>
        <p className="text-xs text-muted-foreground">{cat.label}{item.loja ? ` · ${item.loja}` : ""}</p>
      </div>
      <p className={cn("text-sm font-semibold", item.tipo === "receita" ? "text-success" : "text-foreground")}>
        {item.tipo === "receita" ? "+" : "-"}{formatCurrency(item.valor)}
      </p>
    </button>
  );
};

const MiniLancamentoRow = ({ item, onClick, onReceiptClick }: { item: Tables<"lancamentos">; onClick: () => void; onReceiptClick?: () => void }) => {
  const cat = getCategoriaInfo(item.categoria);
  const Icon = cat.icon;
  return (
    <div className="flex w-full items-center gap-2 rounded-lg bg-card p-2 border border-border hover:shadow-sm transition-shadow">
      <button onClick={onClick} className="flex flex-1 items-center gap-2 text-left min-w-0">
        <div className="flex h-6 w-6 items-center justify-center rounded-md flex-shrink-0" style={{ backgroundColor: cat.color + "20" }}>
          <Icon className="h-3 w-3" style={{ color: cat.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{item.descricao}</p>
        </div>
        <p className="text-xs font-semibold">{formatCurrency(item.valor)}</p>
      </button>
      {onReceiptClick && (
        <button
          onClick={onReceiptClick}
          className={cn("p-1 flex-shrink-0", item.comprovante_url ? "text-success" : "text-muted-foreground hover:text-foreground")}
          title={item.comprovante_url ? "Ver/Alterar comprovante" : "Anexar comprovante"}
        >
          <Paperclip className="h-3 w-3" />
        </button>
      )}
    </div>
  );
};

/* ---- Comprovante Despesa Fixa Modal ---- */

interface ReceiptDespesaFixaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lancamento: Tables<"lancamentos"> | null;
  onSaved: () => void;
}

const ReceiptDespesaFixaModal = ({ open, onOpenChange, lancamento, onSaved }: ReceiptDespesaFixaModalProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [receiptPath, setReceiptPath] = useState<string>('');
  const [receiptFileName, setReceiptFileName] = useState<string>('');

  useEffect(() => {
    if (lancamento) {
      setReceiptPath(lancamento.comprovante_url || '');
      setReceiptFileName(lancamento.comprovante_url ? 'Comprovante' : '');
    } else {
      setReceiptPath('');
      setReceiptFileName('');
    }
  }, [lancamento, open]);

  const handleSave = async () => {
    if (!lancamento) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from("lancamentos")
        .update({ comprovante_url: receiptPath || null })
        .eq("id", lancamento.id);
      if (error) throw error;
      toast({ title: "Comprovante salvo!" });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>📎 Comprovante — {lancamento?.descricao}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg bg-secondary p-3 text-center">
            <p className="text-sm text-muted-foreground">Valor</p>
            <p className="text-2xl font-bold">{formatCurrency(lancamento?.valor ?? 0)}</p>
          </div>
          {receiptPath ? (
            <ReceiptViewer
              filePath={receiptPath}
              fileName={receiptFileName || 'Comprovante'}
              onRemove={() => { setReceiptPath(''); setReceiptFileName(''); }}
            />
          ) : (
            <ReceiptUploadButton
              onUploadSuccess={(path, fileName) => {
                setReceiptPath(path);
                setReceiptFileName(fileName);
              }}
            />
          )}
          <Button className="w-full" onClick={handleSave} disabled={loading}>
            {loading ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ---- Pagar Fatura Modal ---- */

interface PagarFaturaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cartaoId: string | null;
  userId: string;
  mes: number;
  ano: number;
  valorTotal: number;
  faturaExistente: Tables<"faturas"> | null;
}

const PagarFaturaModal = ({ open, onOpenChange, cartaoId, userId, mes, ano, valorTotal, faturaExistente }: PagarFaturaModalProps) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [valorPago, setValorPago] = useState("");
  const [loading, setLoading] = useState(false);
  const [receiptPath, setReceiptPath] = useState<string>('');
  const [receiptFileName, setReceiptFileName] = useState<string>('');

  const handlePagar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cartaoId) return;
    setLoading(true);
    try {
      const valor = parseFloat(valorPago) || valorTotal;
      if (faturaExistente) {
        const { error } = await supabase.from("faturas")
          .update({ pago: true, valor_pago: valor, data_pagamento: new Date().toISOString().split("T")[0], comprovante_url: receiptPath || null })
          .eq("id", faturaExistente.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("faturas").insert({
          user_id: userId, cartao_id: cartaoId, mes, ano,
          pago: true, valor_pago: valor, data_pagamento: new Date().toISOString().split("T")[0],
          comprovante_url: receiptPath || null,
        });
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["faturas"] });
      toast({ title: "Fatura paga!" });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Pagar Fatura</DialogTitle>
        </DialogHeader>
        <form onSubmit={handlePagar} className="space-y-4">
          <div className="rounded-lg bg-secondary p-3 text-center">
            <p className="text-sm text-muted-foreground">Valor da fatura</p>
            <p className="text-2xl font-bold">{formatCurrency(valorTotal)}</p>
          </div>
          <div className="space-y-2">
            <Label>Valor efetivo pago (R$)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder={String(valorTotal)}
              value={valorPago}
              onChange={(e) => setValorPago(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Deixe em branco para usar o valor da fatura</p>
          </div>
                     {/* SEÇÃO DE COMPROVANTE DO PAGAMENTO */}
           <div className="border-t pt-4">
             <h4 className="font-semibold text-sm mb-3">📸 Comprovante do Pagamento</h4>
             {receiptPath ? (
               <ReceiptViewer
                 filePath={receiptPath}
                 fileName={receiptFileName}
                 onRemove={() => { setReceiptPath(''); setReceiptFileName(''); }}
               />
             ) : (
               <ReceiptUploadButton
                 onUploadSuccess={(path, fileName) => {
                   setReceiptPath(path);
                   setReceiptFileName(fileName);
                 }}
               />
             )}
           </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Processando..." : "Confirmar Pagamento"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default Dashboard;
