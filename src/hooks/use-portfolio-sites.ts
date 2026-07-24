import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export interface PortfolioSite {
  id: string;
  user_id: string | null;
  title: string;
  url: string;
  description: string | null;
  category: string | null;
  tags: string[];
  send_count: number;
  is_active: boolean;
  is_template: boolean;
  display_order: number;
}

export function usePortfolioSites() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: sites = [], isLoading } = useQuery({
    queryKey: ["portfolio-sites", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portfolio_sites")
        .select("*")
        .or(`user_id.eq.${user!.id},is_template.eq.true`)
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data || []) as PortfolioSite[];
    },
    enabled: !!user?.id,
  });

  const create = useMutation({
    mutationFn: async (payload: Partial<PortfolioSite>) => {
      const { error } = await supabase.from("portfolio_sites").insert({
        user_id: user!.id,
        title: payload.title!,
        url: payload.url!,
        description: payload.description,
        category: payload.category,
        tags: payload.tags || [],
        is_template: false,
        is_active: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolio-sites"] });
      toast.success("Site adicionado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("portfolio_sites").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["portfolio-sites"] });
      toast.success("Removido");
    },
  });

  const trackSend = async (id: string) => {
    const target = sites.find((s) => s.id === id);
    if (!target) return;
    await supabase
      .from("portfolio_sites")
      .update({ send_count: (target.send_count || 0) + 1 })
      .eq("id", id);
    qc.invalidateQueries({ queryKey: ["portfolio-sites"] });
  };

  return { sites, isLoading, create, remove, trackSend };
}
