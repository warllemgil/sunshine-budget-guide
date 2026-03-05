import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, Shield, Hammer, Palmtree, Plus, Trash2, Edit2, Check, X } from "lucide-react";

const Objetivos = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: globais = [] } = useQuery({
    queryKey: ["objetivos_globais", user?.id],
    queryFn: async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).from("objetivos_globais").select("*").eq("user_id", user!.id);
        if (error) return [];
        return data ?? [];
      } catch {
        return [];
      }
    },
    enabled: !!user,
  });

  const { data: lista = [] } = useQuery({
    queryKey: ["objetivos_lista", user?.id],
    queryFn: async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).from("objetivos_lista").select("*").eq("user_id", user!.id).order("created_at");
        if (error) return [];
        return data ?? [];
      } catch {
        return [];
      }
    },
    enabled: !!user,
  });

  const investimento = globais.find((g) => g.tipo === "investimento");
  const reserva = globais.find((g) => g.tipo === "reserva");
  const obras = lista.filter((l) => l.tipo === "obra");
  const lazer = lista.filter((l) => l.tipo === "lazer");

  const upsertGlobal = useMutation({
    mutationFn: async (params: { tipo: string; valor_atual: number; valor_meta: number; data_limite?: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = globais.find((g: any) => g.tipo === params.tipo);
      if (existing) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from("objetivos_globais").update(params).eq("id", existing.id);
        if (error) throw error;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from("objetivos_globais").insert({ ...params, user_id: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["objetivos_globais"] });
      toast({ title: "Salvo!" });
    },
  });

  const addListItem = useMutation({
    mutationFn: async (params: { tipo: string; nome: string; data_prevista?: string; valor_previsto: number }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("objetivos_lista").insert({ ...params, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["objetivos_lista"] });
    },
  });

  const deleteListItem = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("objetivos_lista").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["objetivos_lista"] }),
  });

  return (
    <div className="mx-auto max-w-lg space-y-5 p-4">
      <h1 className="text-xl font-bold">Objetivos</h1>

      {/* Investimento */}
      <GoalCard
        title="Investimentos"
        icon={<TrendingUp className="h-5 w-5 text-success" />}
        data={investimento}
        onSave={(v) => upsertGlobal.mutate({ tipo: "investimento", ...v })}
      />

      {/* Reserva */}
      <GoalCard
        title="Reserva Financeira"
        icon={<Shield className="h-5 w-5 text-primary" />}
        data={reserva}
        onSave={(v) => upsertGlobal.mutate({ tipo: "reserva", ...v })}
        hideMeta
      />

      {/* Obras */}
      <ListSection
        title="Obras da Casa"
        icon={<Hammer className="h-5 w-5 text-warning" />}
        items={obras}
        tipo="obra"
        onAdd={(item) => addListItem.mutate({ tipo: "obra", ...item })}
        onDelete={(id) => deleteListItem.mutate(id)}
      />

      {/* Lazer */}
      <ListSection
        title="Lazer"
        icon={<Palmtree className="h-5 w-5 text-accent" />}
        items={lazer}
        tipo="lazer"
        onAdd={(item) => addListItem.mutate({ tipo: "lazer", ...item })}
        onDelete={(id) => deleteListItem.mutate(id)}
      />
    </div>
  );
};

interface GoalCardProps {
  title: string;
  icon: React.ReactNode;
  data?: { valor_atual: number; valor_meta: number; data_limite: string | null } | null;
  onSave: (v: { valor_atual: number; valor_meta: number; data_limite?: string }) => void;
  hideMeta?: boolean;
}

const GoalCard = ({ title, icon, data, onSave, hideMeta }: GoalCardProps) => {
  const [editing, setEditing] = useState(false);
  const [atual, setAtual] = useState(String(data?.valor_atual ?? 0));
  const [meta, setMeta] = useState(String(data?.valor_meta ?? 0));
  const [dataLimite, setDataLimite] = useState(data?.data_limite ?? "");

  const pct = data && data.valor_meta > 0 ? Math.min(100, Math.round((data.valor_atual / data.valor_meta) * 100)) : 0;

  const mesesRestantes = (() => {
    if (!data?.data_limite || !data.valor_meta) return null;
    const end = new Date(data.data_limite);
    const now = new Date();
    const diff = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth());
    if (diff <= 0) return null;
    const falta = data.valor_meta - data.valor_atual;
    return falta > 0 ? +(falta / diff).toFixed(2) : 0;
  })();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 pb-2">
        {icon}
        <CardTitle className="text-base">{title}</CardTitle>
        <button onClick={() => { setEditing(!editing); setAtual(String(data?.valor_atual ?? 0)); setMeta(String(data?.valor_meta ?? 0)); setDataLimite(data?.data_limite ?? ""); }}
          className="ml-auto p-1 text-muted-foreground hover:text-foreground">
          {editing ? <X className="h-4 w-4" /> : <Edit2 className="h-4 w-4" />}
        </button>
      </CardHeader>
      <CardContent className="space-y-3">
        {editing ? (
          <div className="space-y-2">
            <Input type="number" placeholder="Valor atual" value={atual} onChange={(e) => setAtual(e.target.value)} />
            <Input type="number" placeholder="Meta" value={meta} onChange={(e) => setMeta(e.target.value)} />
            {!hideMeta && <Input type="date" value={dataLimite} onChange={(e) => setDataLimite(e.target.value)} />}
            <Button size="sm" onClick={() => { onSave({ valor_atual: +atual, valor_meta: +meta, data_limite: dataLimite || undefined }); setEditing(false); }}>
              <Check className="h-4 w-4 mr-1" /> Salvar
            </Button>
          </div>
        ) : (
          <>
            <div className="flex justify-between text-sm">
              <span>{formatCurrency(data?.valor_atual ?? 0)}</span>
              <span className="text-muted-foreground">Meta: {formatCurrency(data?.valor_meta ?? 0)}</span>
            </div>
            <Progress value={pct} className="h-2" />
            {mesesRestantes !== null && !hideMeta && (
              <p className="text-xs text-muted-foreground">
                Faltam {formatCurrency(mesesRestantes)}/mês para atingir a meta
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

interface ListSectionProps {
  title: string;
  icon: React.ReactNode;
  items: { id: string; nome: string; data_prevista: string | null; valor_previsto: number }[];
  tipo: string;
  onAdd: (item: { nome: string; data_prevista?: string; valor_previsto: number }) => void;
  onDelete: (id: string) => void;
}

const ListSection = ({ title, icon, items, onAdd, onDelete }: ListSectionProps) => {
  const [adding, setAdding] = useState(false);
  const [nome, setNome] = useState("");
  const [dataPrev, setDataPrev] = useState("");
  const [valorPrev, setValorPrev] = useState("");

  const handleAdd = () => {
    if (!nome) return;
    onAdd({ nome, data_prevista: dataPrev || undefined, valor_previsto: +valorPrev || 0 });
    setNome(""); setDataPrev(""); setValorPrev(""); setAdding(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 pb-2">
        {icon}
        <CardTitle className="text-base">{title}</CardTitle>
        <button onClick={() => setAdding(!adding)} className="ml-auto p-1 text-muted-foreground hover:text-foreground">
          {adding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </button>
      </CardHeader>
      <CardContent className="space-y-2">
        {adding && (
          <div className="space-y-2 rounded-lg bg-secondary p-3">
            <Input placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={dataPrev} onChange={(e) => setDataPrev(e.target.value)} />
              <Input type="number" placeholder="Valor R$" value={valorPrev} onChange={(e) => setValorPrev(e.target.value)} />
            </div>
            <Button size="sm" onClick={handleAdd}><Check className="h-4 w-4 mr-1" /> Adicionar</Button>
          </div>
        )}
        {items.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground">Nenhum item adicionado.</p>
        )}
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-lg bg-secondary p-3">
            <div>
              <p className="text-sm font-medium">{item.nome}</p>
              <p className="text-xs text-muted-foreground">
                {item.data_prevista ? new Date(item.data_prevista + "T00:00:00").toLocaleDateString("pt-BR") : "Sem data"}
                {item.valor_previsto > 0 && ` · ${formatCurrency(item.valor_previsto)}`}
              </p>
            </div>
            <button onClick={() => onDelete(item.id)} className="p-1 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default Objetivos;
