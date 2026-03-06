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
import BrandLogo from '@/components/BrandLogo';
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
  const [cartoes, setCartoes] = useState<Tables<"cartoes">[]>([]);
  const [loading, setLoading] = useState(false);
  // Estados para comprovante
  const [receiptPath, setReceiptPath] = useState<string>('');
  const [receiptFileName, setReceiptFileName] = useState<string>('');

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
    setReceiptPath("");
    setReceiptFileName("");
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
          const diaFechamento = selectedCartao?.fechamento ?? 31;
          effectiveDataEdit = getEffectiveInvoiceDate(data, diaFechamento);
        }

        const updatePayload: TablesInsert<"lancamentos"> = {
          descricao, valor: valorNum,
          data: effectiveDataEdit,
          data_compra: data,
          categoria, fixa: fixo,
          cartao_id: metodo === "cartao" ? cartaoId || null : null,
          parcelas: metodo === "cartao" ? parseInt(totalParcelas) : null,
          loja,
          merchant_logo_url: merchantLogoUrl || null,
        };
        const { error } = await supabase.from("lancamentos").update(updatePayload).eq("id", editItem.id);
        if (error) throw error;
      } else if (fixo && metodo !== "cartao") {
        // Fixed expense: repeat for every remaining month of the year.
        const baseDate = new Date(data + "T00:00:00");
        const endMonth = 11; // December
        const inserts: TablesInsert<"lancamentos">[] = [];
        for (let m = baseDate.getMonth(); m <= endMonth; m++) {
          const d = new Date(baseDate.getFullYear(), m, baseDate.getDate());
          inserts.push({
            usuario_id: user.id, descricao, valor: valorNum,
            data: d.toISOString().split("T")[0],
            data_compra: data,
            categoria, fixa: true,
            cartao_id: null, loja,
            merchant_logo_url: merchantLogoUrl || null,
          });
        }
        const { error } = await supabase.from("lancamentos").insert(inserts);
        if (error) throw error;
      } else if (metodo === "cartao" && parseInt(totalParcelas) > 1) {
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
            categoria, fixa: false,
            cartao_id: cartaoId || null,
            parcela_atual: i + 1, parcelas: numParcelas,
            loja,
            merchant_logo_url: merchantLogoUrl || null,
          };
        });

        const { error } = await supabase.from("lancamentos").insert(inserts);
        if (error) throw error;
      } else {
        // For single-installment card purchases, also apply the closing-date rule.
        let effectiveData = data;
        if (metodo === "cartao" && cartaoId) {
          const selectedCartao = cartoes.find((c) => c.id === cartaoId);
          const diaFechamento = selectedCartao?.fechamento ?? 31;
          effectiveData = getEffectiveInvoiceDate(data, diaFechamento);
        }
        const { error } = await supabase.from("lancamentos").insert({
          usuario_id: user.id, descricao, valor: valorNum, data: effectiveData,
          data_compra: data,
          categoria, fixa: fixo, cartao_id: metodo === "cartao" ? cartaoId || null : null, loja,
          merchant_logo_url: merchantLogoUrl || null,
        });
        if (error) throw error;
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
              {debouncedLoja && <BrandLogo store={debouncedLoja} size={32} onLogoResolved={setMerchantLogoUrl} />}
            </div>
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
