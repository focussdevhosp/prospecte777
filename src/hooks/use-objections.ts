import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export interface ObjectionResponse {
  id: string;
  user_id: string | null;
  category: string;
  objection_keywords: string[];
  objection_example: string;
  response_template: string;
  angle: string | null;
  usage_count: number;
  success_count: number;
  is_active: boolean;
  is_template: boolean;
  created_at: string;
}

export function useObjections() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: objections = [], isLoading } = useQuery({
    queryKey: ["objections", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("objection_responses")
        .select("*")
        .or(`user_id.eq.${user!.id},is_template.eq.true`)
        .order("category");
      if (error) throw error;
      return (data || []) as ObjectionResponse[];
    },
    enabled: !!user?.id,
  });

  const create = useMutation({
    mutationFn: async (payload: Partial<ObjectionResponse>) => {
      const { error } = await supabase.from("objection_responses").insert({
        user_id: user!.id,
        category: payload.category!,
        objection_example: payload.objection_example!,
        response_template: payload.response_template!,
        objection_keywords: payload.objection_keywords || [],
        angle: payload.angle,
        is_active: true,
        is_template: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["objections"] });
      toast.success("Objeção salva");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<ObjectionResponse> & { id: string }) => {
      const { error } = await supabase.from("objection_responses").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["objections"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("objection_responses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["objections"] });
      toast.success("Excluída");
    },
  });

  const detect = async (message: string, lead_id?: string) => {
    const { data, error } = await supabase.functions.invoke("detect-objection", {
      body: { message, lead_id },
    });
    if (error) throw error;
    return (data?.matches || []) as ObjectionResponse[];
  };

  const trackUsage = async (id: string) => {
    const target = objections.find((o) => o.id === id);
    if (!target) return;
    await supabase
      .from("objection_responses")
      .update({ usage_count: (target.usage_count || 0) + 1 })
      .eq("id", id);
  };

  return { objections, isLoading, create, update, remove, detect, trackUsage };
}
