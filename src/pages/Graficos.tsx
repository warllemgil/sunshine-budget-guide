import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import MonthSelector from "@/components/MonthSelector";
import { formatCurrency } from "@/lib/formatters";
import { getCategoriaInfo, CATEGORIAS } from "@/lib/categories";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const Graficos = () => {
  const { user } = useAuth();
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth());
  const [ano, setAno] = useState(now.getFullYear());

  const startDate = `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
  const endDate = mes === 11 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 2).padStart(2, "0")}-01`;

  const { data: lancamentos = [] } = useQuery({
    queryKey: ["lancamentos", user?.id, mes, ano],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lancamentos").select("*").eq("usuario_id", user!.id)
        .gte("data", startDate).lt("data", endDate);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const chartData = useMemo(() => {
    const groups = new Map<string, number>();
    lancamentos.forEach((l) => {
      groups.set(l.categoria, (groups.get(l.categoria) || 0) + l.valor);
    });
    return Array.from(groups.entries())
      .map(([id, value]) => ({
        name: getCategoriaInfo(id).label,
        value,
        color: getCategoriaInfo(id).color,
      }))
      .sort((a, b) => b.value - a.value);
  }, [lancamentos]);

  const total = chartData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="mx-auto max-w-lg space-y-5 p-4">
      <h1 className="text-xl font-bold">Gráficos</h1>
      <MonthSelector mes={mes} ano={ano} onChange={(m, a) => { setMes(m); setAno(a); }} />

      {chartData.length > 0 ? (
        <>
          <Card>
            <CardContent className="pt-6">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%" cy="50%"
                    innerRadius={60} outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
              <p className="text-center text-lg font-semibold mt-2">Total: {formatCurrency(total)}</p>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {chartData.map((d) => {
              const pct = Math.round((d.value / total) * 100);
              return (
                <div key={d.name} className="flex items-center gap-3 rounded-lg bg-card p-3 border border-border">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="flex-1 text-sm">{d.name}</span>
                  <span className="text-sm font-medium">{formatCurrency(d.value)}</span>
                  <span className="text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="py-12 text-center text-muted-foreground">
          <p>Sem despesas neste mês para exibir.</p>
        </div>
      )}
    </div>
  );
};

export default Graficos;
