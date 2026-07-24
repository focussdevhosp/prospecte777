
CREATE TABLE public.portfolio_sites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  category TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  send_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_template BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_sites TO authenticated;
GRANT ALL ON public.portfolio_sites TO service_role;

ALTER TABLE public.portfolio_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view own or templates" ON public.portfolio_sites
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_template = true);
CREATE POLICY "insert own" ON public.portfolio_sites
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "update own" ON public.portfolio_sites
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "delete own" ON public.portfolio_sites
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER update_portfolio_sites_updated_at BEFORE UPDATE ON public.portfolio_sites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.portfolio_sites (user_id, is_template, title, url, category, display_order, description) VALUES
(NULL, true, 'Landing Premium 33', 'https://pagina-33-eagle.vercel.app/', 'landing', 1, 'Landing page moderna com hero em destaque'),
(NULL, true, 'Landing Premium 31', 'https://pagina-31-eagle.vercel.app/', 'landing', 2, 'Layout clean com foco em conversão'),
(NULL, true, 'Landing Premium 30', 'https://p-gina-30-eagle.vercel.app/', 'landing', 3, 'Design minimalista de alto impacto'),
(NULL, true, 'MeadLight Pink Drink', 'https://mahdighorbani98.github.io/MeadLIght_PinkDrink_Clone/', 'ecommerce', 4, 'E-commerce vibrante estilo produto'),
(NULL, true, 'Landing Premium 22', 'https://pagina-22-eagle.vercel.app/', 'landing', 5, 'Estrutura para captação B2B'),
(NULL, true, 'Landing Premium 19', 'https://p-gina-19-eagle.vercel.app/', 'landing', 6, 'Página de vendas com prova social'),
(NULL, true, 'Void to Content', 'https://void-to-content-tool.lovable.app/', 'saas', 7, 'Ferramenta SaaS com interface premium'),
(NULL, true, 'Blank Canvas Creation', 'https://blank-canvas-creation-3487.lovable.app/', 'saas', 8, 'App web com dashboard moderno'),
(NULL, true, 'Landing Premium 8', 'https://pagina-8-eagle.vercel.app/', 'landing', 9, 'Design elegante para serviços premium');
