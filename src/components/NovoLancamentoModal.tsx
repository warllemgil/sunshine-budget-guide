import { useState, useEffect, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { CATEGORIAS } from "@/lib/categories";
import { cn } from "@/lib/utils";
import { getEffectiveInvoiceDate } from "@/lib/billingDate";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { ReceiptUploadButton } from '@/components/ReceiptUploadButton';
import { ReceiptViewer } from '@/components/ReceiptViewer';
import { useReceipts } from '@/hooks/useReceipts';
import BrandLogo from '@/components/BrandLogo';
import { findOrCreateMerchant, uploadMerchantLogoFile } from "@/lib/merchantLogo";

type SupabaseLikeError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

const RECEIPT_COLUMNS = ["comprovante_url", "comprovante", "anexo_url", "anexo", "receipt_url"] as const;

const LOGO_SUGGESTIONS: Array<{ name: string; domain: string }> = [
  { name: "Nubank", domain: "nubank.com.br" },
  { name: "Caixa", domain: "caixa.gov.br" },
  { name: "Santander", domain: "santander.com.br" },
  { name: "Bradesco", domain: "bradesco.com.br" },
  { name: "Itau", domain: "itau.com.br" },
  { name: "Banco do Brasil", domain: "bb.com.br" },
  { name: "PicPay", domain: "picpay.com" },
  { name: "Mercado Pago", domain: "mercadopago.com.br" },
  { name: "iFood", domain: "ifood.com.br" },
  { name: "Rappi", domain: "rappi.com.br" },
  { name: "99 Food", domain: "99app.com" },
  { name: "Uber Eats", domain: "ubereats.com" },
  { name: "Aiqfome", domain: "aiqfome.com" },
  { name: "Ze Delivery", domain: "zedelivery.com.br" },
];
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editItem?: Tables<"lancamentos"> | null;
  /** File shared from an external app (e.g. bank payment receipt). Auto-uploaded when the modal opens. */
  sharedFile?: File | null;
  /** Called after the shared file has been processed so the parent can clear it. */
  onSharedFileConsumed?: () => void;
}

const NovoLancamentoModal = ({ open, onOpenChange, editItem, sharedFile, onSharedFileConsumed }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { uploadReceipt, loading: uploadingShared } = useReceipts();

  const [tipo, setTipo] = useState<"receita" | "despesa">("despesa");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(new Date().toISOString().split("T")[0]);
  const [categoria, setCategoria] = useState("outros");
  const [fixo, setFixo] = useState(false);
  const [metodo, setMetodo] = useState<"avista" | "cartao">("avista");
  const [cartaoId, setCartaoId] = useState("");
  const [totalParcelas, setTotalParcelas] = useState("1");
  const [loja, setLoja] = useState("");
  const [debouncedLoja, setDebouncedLoja] = useState("");
  const [merchantLogoUrl, setMerchantLogoUrl] = useState<string | null>(null);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [usarReservaReceita, setUsarReservaReceita] = useState(false);
  const [uploadingManualLogo, setUploadingManualLogo] = useState(false);
  const [cartoes, setCartoes] = useState<Tables<"cartoes">[]>([]);
  const [loading, setLoading] = useState(false);
  // Estados para comprovante
  const [receiptPath, setReceiptPath] = useState<string>('');
  const [receiptFileName, setReceiptFileName] = useState<string>('');
  const manualLogoInputRef = useRef<HTMLInputElement | null>(null);

  const isUnknownColumnError = (error: unknown, column: string): boolean => {
    const e = error as SupabaseLikeError;
    const msg = `${e.message ?? ""} ${e.details ?? ""}`.toLowerCase();
    return e.code === "42703" && msg.includes(column.toLowerCase());
  };

  const updateLancamentoWithReceiptFallback = async (id: string, basePayload: TablesInsert<"lancamentos">) => {
    if (!receiptPath) {
      const { error } = await supabase.from("lancamentos").update(basePayload).eq("id", id);
      if (error) throw error;
      return;
    }

    for (const col of RECEIPT_COLUMNS) {
      const { error } = await supabase.from("lancamentos").update({
        ...basePayload,
        [col]: receiptPath,
      } as never).eq("id", id);
      if (!error) return;
      if (isUnknownColumnError(error, col)) continue;
      throw error;
    }

    const { error } = await supabase.from("lancamentos").update(basePayload).eq("id", id);
    if (error) throw error;
  };

  const insertLancamentosWithReceiptFallback = async (
    payload: TablesInsert<"lancamentos"> | TablesInsert<"lancamentos">[],
  ) => {
    if (!receiptPath) {
      const { error } = await supabase.from("lancamentos").insert(payload);
      if (error) throw error;
      return;
    }

    for (const col of RECEIPT_COLUMNS) {
      const withReceipt = Array.isArray(payload)
        ? payload.map((item) => ({ ...item, [col]: receiptPath }))
        : { ...payload, [col]: receiptPath };
      const { error } = await supabase.from("lancamentos").insert(withReceipt as never);
      if (!error) return;
      if (isUnknownColumnError(error, col)) continue;
      throw error;
    }

    const { error } = await supabase.from("lancamentos").insert(payload);
    if (error) throw error;
  };

  const logoSuggestions = useMemo(() => {
    const term = loja.trim().toLowerCase();
    if (term.length < 2) return [];
    return LOGO_SUGGESTIONS
      .filter((item) => item.name.toLowerCase().includes(term))
      .slice(0, 5);
  }, [loja]);

  const descricaoHint = useMemo(() => {
    const value = descricao.trim().toLowerCase();
    if (!value) return null;
    if (/plano|internet|telefone|celular|operadora/.test(value)) {
      return {
        text: "Referencia detectada: plano/telefonia. Use a loja como operadora (ex: Vivo, Claro, TIM).",
        category: "servicos",
      };
    }
    if (/lanche|pizza|hamburg|restaurante|delivery/.test(value)) {
      return {
        text: "Referencia detectada: alimentacao/delivery. Informe a loja ou app para melhorar o logo.",
        category: "alimentacao",
      };
    }
    return null;
  }, [descricao]);

  useEffect(() => {
    if (!user || !open) return;
    supabase.from("cartoes").select("*").eq("usuario_id", user.id).then(({ data }) => {
      if (data) setCartoes(data);
    });
  }, [user, open]);

  // Auto-upload a file shared from an external app (Web Share Target).
  // Only runs when the modal is opened for a new transaction (not editing).
  // Dependencies intentionally limited: uploadReceipt and onSharedFileConsumed are
  // stable references; re-running on editItem changes is not needed here.
  useEffect(() => {
    if (!open || !sharedFile || !user || editItem) return;
    uploadReceipt(sharedFile, user.id)
      .then((path) => {
        if (path) {
          setReceiptPath(path);
          setReceiptFileName(sharedFile.name);
        }
      })
      .finally(() => {
        onSharedFileConsumed?.();
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sharedFile, user]);

  // Debounce loja changes so the logo API is not called on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedLoja(loja), 500);
    return () => clearTimeout(timer);
  }, [loja]);

  useEffect(() => {
    if (editItem) {
      setTipo("despesa");
      // Strip the "(N/M)" installment suffix so the user edits the base description
      const baseDescricao = editItem.parcela_atual && editItem.parcelas
        ? editItem.descricao.replace(/ \(\d+\/\d+\)$/, "")
        : editItem.descricao;
      setDescricao(baseDescricao);
      setValor(String(editItem.valor));
      setData(editItem.data);
      setCategoria(editItem.categoria);
      setFixo(editItem.fixa);
      setMetodo(editItem.cartao_id ? "cartao" : "avista");
      setCartaoId(editItem.cartao_id || "");
      setTotalParcelas(String(editItem.parcelas || 1));
      setLoja(editItem.loja || "");
      setMerchantLogoUrl(editItem.merchant_logo_url || null);
      setMerchantId(editItem.merchant_id || null);
      setTipo(editItem.tipo === "receita" ? "receita" : "despesa");
      setUsarReservaReceita(false);
      setReceiptPath('');
      setReceiptFileName('');
    } else {
      resetForm();
    }
  }, [editItem, open]);

  const resetForm = () => {
    setTipo("despesa");
    setDescricao("");
    setValor("");
    setData(new Date().toISOString().split("T")[0]);
    setCategoria("outros");
    setFixo(false);
    setMetodo("avista");
    setCartaoId("");
    setTotalParcelas("1");
    setLoja("");
    setMerchantLogoUrl(null);
    setMerchantId(null);
    setUsarReservaReceita(false);
    setReceiptPath("");
    setReceiptFileName("");
  };

  const handleManualLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    if (!loja.trim()) {
      toast({
        title: "Informe a loja antes do upload",
        description: "Digite o nome da loja para vincular a logo enviada.",
        variant: "destructive",
      });
      return;
    }

    setUploadingManualLogo(true);
    try {
      const publicUrl = await uploadMerchantLogoFile(loja, file);
      if (!publicUrl) throw new Error("Nao foi possivel enviar a logo da loja.");

      setMerchantLogoUrl(publicUrl);
      const merchant = await findOrCreateMerchant(loja, null, publicUrl);
      if (merchant?.id) setMerchantId(merchant.id);

      toast({ title: "Logo da loja enviada com sucesso!" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erro inesperado";
      toast({ title: "Erro no upload da logo", description: message, variant: "destructive" });
    } finally {
      setUploadingManualLogo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const isReceita = tipo === "receita";
    const metodoEfetivo = isReceita ? "avista" : metodo;
    const fixaEfetiva = isReceita ? false : fixo;

    if (metodoEfetivo === "cartao" && !cartaoId) {
      toast({ title: "Selecione um cartão", description: "É necessário selecionar um cartão para lançamentos no cartão.", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      const valorNum = parseFloat(valor);
      if (isNaN(valorNum) || valorNum <= 0) throw new Error("Valor inválido");
      const valorEfetivo = valorNum;
      const tipoEfetivo = isReceita ? "receita" : "despesa";

      if (isReceita && usarReservaReceita) {
        const { data: reserva, error: reservaError } = await supabase
          .from("objetivos_globais")
          .select("id, valor_atual")
          .eq("user_id", user.id)
          .eq("tipo", "reserva")
          .maybeSingle();

        if (reservaError) throw reservaError;
        if (!reserva) {
          throw new Error("Reserva financeira nao cadastrada. Crie a reserva em Objetivos.");
        }
        if (reserva.valor_atual < valorNum) {
          throw new Error("Saldo insuficiente na reserva financeira.");
        }

        const { error: updateReservaError } = await supabase
          .from("objetivos_globais")
          .update({ valor_atual: reserva.valor_atual - valorNum })
          .eq("id", reserva.id);
        if (updateReservaError) throw updateReservaError;
        queryClient.invalidateQueries({ queryKey: ["objetivos_globais"] });
      }

      if (editItem) {
        // For card purchases, recalculate the effective invoice date from the user-chosen date.
        let effectiveDataEdit = data;
        if (metodoEfetivo === "cartao" && cartaoId) {
          const selectedCartao = cartoes.find((c) => c.id === cartaoId);
          const diaFechamento = selectedCartao?.fechamento ?? 31;
          effectiveDataEdit = getEffectiveInvoiceDate(data, diaFechamento);
        }

        const updatePayload: TablesInsert<"lancamentos"> = {
          descricao, valor: valorEfetivo,
          data: effectiveDataEdit,
          data_compra: data,
          tipo: tipoEfetivo,
          categoria, fixa: fixaEfetiva,
          cartao_id: metodoEfetivo === "cartao" ? cartaoId || null : null,
          parcelas: metodoEfetivo === "cartao" ? parseInt(totalParcelas) : null,
          loja,
          merchant_id: merchantId || null,
          merchant_logo_url: merchantLogoUrl || null,
        };
        await updateLancamentoWithReceiptFallback(editItem.id, updatePayload);
      } else if (!isReceita && fixaEfetiva && metodoEfetivo !== "cartao") {
        // Fixed expense: repeat for every remaining month of the year.
        const baseDate = new Date(data + "T00:00:00");
        const endMonth = 11; // December
        const inserts: TablesInsert<"lancamentos">[] = [];
        for (let m = baseDate.getMonth(); m <= endMonth; m++) {
          const d = new Date(baseDate.getFullYear(), m, baseDate.getDate());
          inserts.push({
            usuario_id: user.id, descricao, valor: valorEfetivo,
            data: d.toISOString().split("T")[0],
            data_compra: data,
            tipo: "despesa",
            categoria, fixa: true,
            cartao_id: null, loja,
            merchant_id: merchantId || null,
            merchant_logo_url: merchantLogoUrl || null,
          });
        }
        await insertLancamentosWithReceiptFallback(inserts);
      } else if (!isReceita && metodoEfetivo === "cartao" && parseInt(totalParcelas) > 1) {
        const numParcelas = parseInt(totalParcelas);
        const valorParcela = +(valorNum / numParcelas).toFixed(2);

        // Determine the correct invoice month for the first installment.
        const selectedCartao = cartoes.find((c) => c.id === cartaoId);
        const diaFechamento = selectedCartao?.fechamento ?? 31;
        const startDateStr = getEffectiveInvoiceDate(data, diaFechamento);
        const startDate = new Date(startDateStr + "T00:00:00");

        const inserts: TablesInsert<"lancamentos">[] = Array.from({ length: numParcelas }, (_, i) => {
          const d = new Date(startDate);
          d.setMonth(d.getMonth() + i);
          return {
            usuario_id: user.id, descricao: `${descricao} (${i + 1}/${numParcelas})`,
            valor: valorParcela, data: d.toISOString().split("T")[0],
            data_compra: data,
            tipo: "despesa",
            categoria, fixa: false,
            cartao_id: cartaoId || null,
            parcela_atual: i + 1, parcelas: numParcelas,
            loja,
            merchant_id: merchantId || null,
            merchant_logo_url: merchantLogoUrl || null,
          };
        });

        await insertLancamentosWithReceiptFallback(inserts);
      } else {
        // For single-installment card purchases, also apply the closing-date rule.
        let effectiveData = data;
        if (metodoEfetivo === "cartao" && cartaoId) {
          const selectedCartao = cartoes.find((c) => c.id === cartaoId);
          const diaFechamento = selectedCartao?.fechamento ?? 31;
          effectiveData = getEffectiveInvoiceDate(data, diaFechamento);
        }
        await insertLancamentosWithReceiptFallback({
          usuario_id: user.id, descricao, valor: valorEfetivo, data: effectiveData,
          data_compra: data,
          tipo: tipoEfetivo,
          categoria, fixa: fixaEfetiva, cartao_id: metodoEfetivo === "cartao" ? cartaoId || null : null, loja,
          merchant_id: merchantId || null,
          merchant_logo_url: merchantLogoUrl || null,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      toast({ title: editItem ? "Lançamento atualizado!" : "Lançamento adicionado!" });
      onOpenChange(false);
      resetForm();
    } catch (err: unknown) {
      const supabaseErr = err as SupabaseLikeError;
      const message = err instanceof Error
        ? err.message
        : (typeof supabaseErr?.message === "string" && supabaseErr.message.trim().length > 0
          ? `${supabaseErr.message}${supabaseErr.details ? ` (${supabaseErr.details})` : ""}`
          : "Erro inesperado");
      toast({ title: "Erro", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!editItem) return;
    setLoading(true);
    const { error } = await supabase.from("lancamentos").delete().eq("id", editItem.id);
    if (error) {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      toast({ title: "Excluído!" });
      onOpenChange(false);
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editItem ? "Editar Lançamento" : "Novo Lançamento"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Tipo toggle */}
          <div className="flex gap-2">
            <Button type="button" variant={tipo === "receita" ? "default" : "outline"}
              className={cn("flex-1", tipo === "receita" && "bg-success hover:bg-success/90")}
              onClick={() => setTipo("receita")}>
              Receita
            </Button>
            <Button type="button" variant={tipo === "despesa" ? "default" : "outline"}
              className={cn("flex-1", tipo === "despesa" && "bg-destructive hover:bg-destructive/90")}
              onClick={() => setTipo("despesa")}>
              Despesa
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} required />
            {descricaoHint && (
              <div className="rounded-md bg-secondary p-2 text-xs text-muted-foreground">
                <p>{descricaoHint.text}</p>
                {descricaoHint.category && categoria !== descricaoHint.category && (
                  <button
                    type="button"
                    className="mt-1 font-medium text-primary hover:underline"
                    onClick={() => setCategoria(descricaoHint.category)}
                  >
                    Aplicar categoria sugerida
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" min="0.01" value={valor}
                onChange={(e) => setValor(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>{metodo === "cartao" ? "Data da Compra" : "Data"}</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} required />
              {metodo === "cartao" && cartaoId && data && (() => {
                const selectedCartao = cartoes.find((c) => c.id === cartaoId);
                const diaFechamento = selectedCartao?.fechamento ?? 31;
                const effectiveDate = getEffectiveInvoiceDate(data, diaFechamento);
                const effectiveDateObj = new Date(effectiveDate + "T00:00:00");
                if (isNaN(effectiveDateObj.getTime())) return null;
                const effectiveMonth = effectiveDateObj.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
                return (
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    📅 Fatura de <span className="font-medium text-primary">{effectiveMonth}</span>
                  </p>
                );
              })()}
            </div>
          </div>

          {/* Categorias grid */}
          <div className="space-y-2">
            <Label>Categoria</Label>
            <div className="grid grid-cols-4 gap-2">
              {CATEGORIAS.map((cat) => (
                <button key={cat.id} type="button"
                  onClick={() => setCategoria(cat.id)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg p-2 text-xs transition-all",
                    categoria === cat.id
                      ? "bg-primary/10 text-primary ring-1 ring-primary"
                      : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                  )}>
                  <cat.icon className="h-4 w-4" />
                  <span className="truncate">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-secondary p-3">
            <Label>Fixo (mensal)</Label>
            <Switch checked={fixo} onCheckedChange={setFixo} />
          </div>

          {tipo === "receita" && (
            <div className="flex items-center justify-between rounded-lg bg-success/10 p-3">
              <div>
                <Label>Receita usando reserva financeira</Label>
                <p className="text-xs text-muted-foreground">Ao salvar, o valor sera abatido da sua reserva.</p>
              </div>
              <Switch checked={usarReservaReceita} onCheckedChange={setUsarReservaReceita} />
            </div>
          )}

          {tipo === "despesa" && (
            <>
              <div className="flex gap-2">
                <Button type="button" variant={metodo === "avista" ? "default" : "outline"}
                  className="flex-1" onClick={() => setMetodo("avista")}>À Vista</Button>
                <Button type="button" variant={metodo === "cartao" ? "default" : "outline"}
                  className="flex-1" onClick={() => setMetodo("cartao")}>Cartão</Button>
              </div>

              {metodo === "cartao" && (
                <div className="space-y-3">
                  <Select value={cartaoId} onValueChange={setCartaoId}>
                    <SelectTrigger><SelectValue placeholder="Selecione o cartão" /></SelectTrigger>
                    <SelectContent>
                      {cartoes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="space-y-2">
                    <Label>Parcelas</Label>
                    <Input type="number" min="1" max="48" value={totalParcelas}
                      onChange={(e) => setTotalParcelas(e.target.value)} />
                  </div>
                </div>
              )}
            </>
          )}

          <div className="space-y-2">
            <Label>Loja (opcional)</Label>
            <div className="flex items-center gap-2">
              <Input value={loja} onChange={(e) => setLoja(e.target.value)} className="flex-1" />
              {debouncedLoja && (
                <BrandLogo
                  store={debouncedLoja}
                  size={32}
                  onLogoResolved={setMerchantLogoUrl}
                  onMerchantResolved={setMerchantId}
                />
              )}
            </div>
            {logoSuggestions.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">Sugestoes de logo (max. 5):</p>
                <div className="grid grid-cols-1 gap-1">
                  {logoSuggestions.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-left hover:bg-secondary"
                      onClick={() => {
                        setLoja(item.name);
                        setMerchantLogoUrl(`https://logo.clearbit.com/${item.domain}`);
                      }}
                    >
                      <BrandLogo store={item.name} initialUrl={`https://logo.clearbit.com/${item.domain}`} size={18} />
                      <span className="text-xs">{item.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <input
              ref={manualLogoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleManualLogoUpload}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploadingManualLogo}
              onClick={() => manualLogoInputRef.current?.click()}
            >
              {uploadingManualLogo ? "Enviando logo..." : "Enviar logo da loja"}
            </Button>
          </div>

          {/* SEÇÃO DE COMPROVANTE */}
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-3 text-sm">📎 Comprovante</h3>
            {uploadingShared ? (
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Carregando comprovante compartilhado...
              </div>
            ) : receiptPath ? (
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
          </div>

          <div className="flex gap-2 pt-2">
            {editItem && (
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={loading}>
                Excluir
              </Button>
            )}
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "Salvando..." : editItem ? "Atualizar" : "Adicionar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NovoLancamentoModal;
