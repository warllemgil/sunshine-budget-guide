import { useState, useEffect } from "react";
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
  const [cartoes, setCartoes] = useState<Tables<"cartoes">[]>([]);
  const [loading, setLoading] = useState(false);
  // Estados para comprovante
  const [receiptPath, setReceiptPath] = useState<string>('');
  const [receiptFileName, setReceiptFileName] = useState<string>('');

  useEffect(() => {
    if (!user || !open) return;
    supabase.from("cartoes").select("*").eq("user_id", user.id).then(({ data }) => {
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

  useEffect(() => {
    if (editItem) {
      setTipo(editItem.tipo as "receita" | "despesa");
      // Strip the "(N/M)" installment suffix so the user edits the base description
      const baseDescricao = editItem.parcela_atual && editItem.total_parcelas
        ? editItem.descricao.replace(/ \(\d+\/\d+\)$/, "")
        : editItem.descricao;
      setDescricao(baseDescricao);
      setValor(String(editItem.valor));
      // For card purchases, prefer the original user-chosen date (data_compra) over the effective invoice date (data)
      setData(editItem.data_compra || editItem.data);
      setCategoria(editItem.categoria);
      setFixo(editItem.fixo);
      setMetodo(editItem.metodo as "avista" | "cartao");
      setCartaoId(editItem.cartao_id || "");
      setTotalParcelas(String(editItem.total_parcelas || 1));
      setLoja(editItem.loja || "");
      setReceiptPath(editItem.comprovante_url || "");
      setReceiptFileName(editItem.comprovante_url ? "Comprovante" : "");
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
    setReceiptPath("");
    setReceiptFileName("");
  };

  // Helper: strip data_compra from a payload object or array (fallback when column is missing in DB)
  const omitDataCompra = (payload: TablesInsert<"lancamentos">): Omit<TablesInsert<"lancamentos">, "data_compra"> => {
    const { data_compra: _dc, ...rest } = payload;
    return rest;
  };

  // Detect whether a Supabase/PostgREST error is caused by the data_compra column not existing
  const isDataCompraSchemaError = (err: { message?: string; code?: string } | null) =>
    err?.message?.includes("data_compra") || err?.code === "42703" || err?.code === "PGRST204";

  // Wrapper: insert and retry without data_compra if the column is not yet in the schema
  const insertLancamentos = async (payload: TablesInsert<"lancamentos"> | TablesInsert<"lancamentos">[]) => {
    const { error } = await supabase.from("lancamentos").insert(payload);
    if (isDataCompraSchemaError(error)) {
      const fallback = Array.isArray(payload) ? payload.map(omitDataCompra) : omitDataCompra(payload);
      const { error: e2 } = await supabase.from("lancamentos").insert(fallback as TablesInsert<"lancamentos">[] | TablesInsert<"lancamentos">);
      if (e2) throw e2;
    } else if (error) {
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (metodo === "cartao" && !cartaoId) {
      toast({ title: "Selecione um cartão", description: "É necessário selecionar um cartão para lançamentos no cartão.", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      const valorNum = parseFloat(valor);
      if (isNaN(valorNum) || valorNum <= 0) throw new Error("Valor inválido");

      if (editItem) {
        // For card purchases, recalculate the effective invoice date from the user-chosen date.
        let effectiveDataEdit = data;
        if (metodo === "cartao" && cartaoId) {
          const selectedCartao = cartoes.find((c) => c.id === cartaoId);
          const diaFechamento = selectedCartao?.dia_fechamento ?? 31;
          effectiveDataEdit = getEffectiveInvoiceDate(data, diaFechamento);
        }

        if (editItem.parcela_grupo_id && editItem.parcela_atual && editItem.total_parcelas) {
          // Parceled purchase: update this installment and all future installments in the group.
          // Fetch all future installments (by data >= this installment's data).
          const { data: futureInstallments, error: fetchErr } = await supabase
            .from("lancamentos")
            .select("id, parcela_atual, total_parcelas, data")
            .eq("parcela_grupo_id", editItem.parcela_grupo_id)
            .gte("data", editItem.data)
            .order("data", { ascending: true });
          if (fetchErr) throw fetchErr;

          await Promise.all(
            (futureInstallments ?? []).map((inst) => {
              const instDescricao = inst.parcela_atual && inst.total_parcelas
                ? `${descricao} (${inst.parcela_atual}/${inst.total_parcelas})`
                : descricao;
              return supabase.from("lancamentos").update({
                descricao: instDescricao,
                valor: valorNum,
                categoria,
                loja,
                comprovante_url: receiptPath || null,
              }).eq("id", inst.id).then(({ error }) => { if (error) throw error; });
            })
          );

          // Also update the date on the current installment
          const datePayload = {
            data: effectiveDataEdit,
            data_compra: data,
          };
          const { error: dateErr } = await supabase.from("lancamentos").update(datePayload).eq("id", editItem.id);
          if (isDataCompraSchemaError(dateErr)) {
            const { error: e2 } = await supabase.from("lancamentos").update({ data: effectiveDataEdit }).eq("id", editItem.id);
            if (e2) throw e2;
          } else if (dateErr) {
            throw dateErr;
          }
        } else {
          const updatePayload = {
            tipo, descricao, valor: valorNum,
            data: effectiveDataEdit,
            data_compra: data,
            categoria, fixo,
            metodo, cartao_id: metodo === "cartao" ? cartaoId || null : null,
            total_parcelas: metodo === "cartao" ? parseInt(totalParcelas) : null,
            loja, comprovante_url: receiptPath || null,
          };
          const { error } = await supabase.from("lancamentos").update(updatePayload).eq("id", editItem.id);
          if (isDataCompraSchemaError(error)) {
            const { error: e2 } = await supabase
              .from("lancamentos")
              .update(omitDataCompra(updatePayload))
              .eq("id", editItem.id);
            if (e2) throw e2;
          } else if (error) {
            throw error;
          }
        }
      } else if (fixo && metodo !== "cartao") {
        // Fixed expense: repeat for every remaining month of the year.
        const grupoId = crypto.randomUUID();
        const baseDate = new Date(data + "T00:00:00");
        const endMonth = 11; // December
        const inserts: TablesInsert<"lancamentos">[] = [];
        for (let m = baseDate.getMonth(); m <= endMonth; m++) {
          const d = new Date(baseDate.getFullYear(), m, baseDate.getDate());
          inserts.push({
            user_id: user.id, tipo, descricao, valor: valorNum,
            data: d.toISOString().split("T")[0],
            data_compra: d.toISOString().split("T")[0],
            categoria, fixo: true,
            metodo, cartao_id: null,
            parcela_grupo_id: grupoId, loja,
            comprovante_url: receiptPath || null,
          });
        }
        await insertLancamentos(inserts);
      } else if (metodo === "cartao" && parseInt(totalParcelas) > 1) {
        const grupoId = crypto.randomUUID();
        const parcelas = parseInt(totalParcelas);
        const valorParcela = +(valorNum / parcelas).toFixed(2);

        // Determine the correct invoice month for the first installment.
        // If the purchase day is past the card's closing day, the purchase
        // falls into the next month's invoice.
        // Fallback to 31 intentionally: if card not found, no date shift occurs.
        const selectedCartao = cartoes.find((c) => c.id === cartaoId);
        const diaFechamento = selectedCartao?.dia_fechamento ?? 31;
        const startDateStr = getEffectiveInvoiceDate(data, diaFechamento);
        const startDate = new Date(startDateStr + "T00:00:00");

        const inserts = Array.from({ length: parcelas }, (_, i) => {
          const d = new Date(startDate);
          d.setMonth(d.getMonth() + i);
          return {
            user_id: user.id, tipo, descricao: `${descricao} (${i + 1}/${parcelas})`,
            valor: valorParcela, data: d.toISOString().split("T")[0],
            // Original purchase date is the same for all installments
            data_compra: data,
            categoria, fixo: false,
            metodo: "cartao", cartao_id: cartaoId || null,
            parcela_atual: i + 1, total_parcelas: parcelas,
            parcela_grupo_id: grupoId, loja,
            comprovante_url: receiptPath || null,
          };
        });

        await insertLancamentos(inserts);
      } else {
        // For single-installment card purchases, also apply the closing-date rule.
        let effectiveData = data;
        if (metodo === "cartao" && cartaoId) {
          const selectedCartao = cartoes.find((c) => c.id === cartaoId);
          const diaFechamento = selectedCartao?.dia_fechamento ?? 31;
          effectiveData = getEffectiveInvoiceDate(data, diaFechamento);
        }
        await insertLancamentos({
          user_id: user.id, tipo, descricao, valor: valorNum, data: effectiveData,
          // Preserve the user-chosen purchase date for display
          data_compra: data,
          categoria, fixo, metodo, cartao_id: metodo === "cartao" ? cartaoId || null : null, loja,
          comprovante_url: receiptPath || null,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      toast({ title: editItem ? "Lançamento atualizado!" : "Lançamento adicionado!" });
      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!editItem) return;
    setLoading(true);
    let error: any;
    if (editItem.parcela_grupo_id) {
      // Delete this record and all future records in the same group
      ({ error } = await supabase
        .from("lancamentos")
        .delete()
        .eq("parcela_grupo_id", editItem.parcela_grupo_id)
        .gte("data", editItem.data));
    } else {
      ({ error } = await supabase.from("lancamentos").delete().eq("id", editItem.id));
    }
    if (error) {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    } else {
      queryClient.invalidateQueries({ queryKey: ["lancamentos"] });
      toast({
        title: editItem.parcela_grupo_id ? "Parcelas excluídas!" : "Excluído!",
        description: editItem.parcela_grupo_id ? "Esta e todas as parcelas futuras foram removidas." : undefined,
      });
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" min="0.01" value={valor}
                onChange={(e) => setValor(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} required />
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
                          {c.instituicao} •••• {c.final_cartao}
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
            <Input value={loja} onChange={(e) => setLoja(e.target.value)} />
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
