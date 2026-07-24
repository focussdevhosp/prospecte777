
-- Push Subscriptions
CREATE TABLE public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_push_subs"
  ON public.push_subscriptions FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER push_subs_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CNPJ Cache (24h)
CREATE TABLE public.cnpj_cache (
  cnpj VARCHAR(14) NOT NULL PRIMARY KEY,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

GRANT SELECT ON public.cnpj_cache TO authenticated;
GRANT ALL ON public.cnpj_cache TO service_role;

ALTER TABLE public.cnpj_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_cnpj_cache"
  ON public.cnpj_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX idx_cnpj_cache_expires ON public.cnpj_cache(expires_at);

-- Meta Ads Tokens
CREATE TABLE public.meta_ads_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  ad_account_id TEXT,
  expires_at TIMESTAMPTZ,
  last_validated_at TIMESTAMPTZ,
  is_valid BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_ads_tokens TO authenticated;
GRANT ALL ON public.meta_ads_tokens TO service_role;

ALTER TABLE public.meta_ads_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_meta_tokens"
  ON public.meta_ads_tokens FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER meta_ads_tokens_updated_at
  BEFORE UPDATE ON public.meta_ads_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
