-- ============================================================
-- SCHEMA COMPLETO — PROJETO NOVO E VAZIO
-- ============================================================
-- Contém as 70 migrações do projeto, na ordem cronológica em que foram
-- criadas. É o schema inteiro: nenhum dado de nenhum projeto anterior.
--
-- Gerado por `node scripts/build-schema.mjs`. Não edite à mão: edite a
-- migração e gere de novo.
--
-- COMO USAR
--   Supabase -> SQL Editor -> cole tudo -> Run.
--   Leva alguns segundos. Se parar com erro, me mande a mensagem: ela diz
--   exatamente em qual bloco parou.
--
-- ANTES DE RODAR, confirme que estas extensões estão ligadas em
-- Database -> Extensions:
--   pgcrypto   (gen_random_uuid, gen_random_bytes)
--   pg_cron    (agendamentos)
--   pg_net     (net.http_post, usado pelo cron)
--
-- Sem pg_cron e pg_net os blocos de agendamento falham — o resto do schema
-- sobe normalmente, mas as automações não rodam sozinhas.
--
-- OBSERVAÇÃO SOBRE O HISTÓRICO
--   Cinco migrações antigas gravaram o endereço do projeto anterior direto
--   no comando do cron. Elas continuam aqui para o histórico ficar íntegro,
--   e a migração 63 desfaz e recria todos os agendamentos apontando para o
--   projeto correto — e falha de propósito se sobrar algum apontando para
--   outro lugar.
-- ============================================================


-- ############################################################
-- [01/70] 20260205182010_95dad26d-4d67-46dc-85fc-fa36d32d2c98.sql
-- ############################################################

-- ===========================================
-- PROSPECTE - Multi-tenant Sales Prospecting Platform
-- ===========================================

-- 1. PROFILES TABLE (linked to auth.users)
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 2. USER SETTINGS TABLE
CREATE TABLE public.user_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Agent Persona
  agent_name TEXT DEFAULT 'Gustavo',
  agent_persona TEXT DEFAULT 'Você é um consultor de negócios profissional e amigável que ajuda empresas a crescer com soluções digitais.',
  -- Knowledge Base
  knowledge_base TEXT DEFAULT '',
  services_offered TEXT[] DEFAULT ARRAY['Criação de Sites', 'Chatbots', 'Design', 'Sistemas de Gestão', 'Aplicativos', 'Posicionamento Google'],
  -- A/B Test Variations
  message_variations JSONB DEFAULT '[]'::jsonb,
  -- Prospecting Settings
  target_niches TEXT[] DEFAULT ARRAY[]::text[],
  target_locations TEXT[] DEFAULT ARRAY[]::text[],
  -- WhatsApp Connection (sensitive - handle via edge functions)
  whatsapp_instance_id TEXT,
  whatsapp_connected BOOLEAN DEFAULT false,
  -- Webhook for external integrations
  webhook_url TEXT,
  webhook_events TEXT[] DEFAULT ARRAY['lead_contacted', 'meeting_scheduled'],
  -- Notifications
  email_notifications BOOLEAN DEFAULT true,
  daily_report_enabled BOOLEAN DEFAULT true,
  -- Cron security
  hunter_api_token TEXT DEFAULT encode(gen_random_bytes(32), 'hex'),
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own settings"
  ON public.user_settings FOR ALL
  USING (auth.uid() = user_id);

-- 3. LEADS TABLE
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Business Info
  business_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  website TEXT,
  address TEXT,
  -- Categorization
  niche TEXT,
  location TEXT,
  -- AI Analysis
  pain_points TEXT[],
  analyzed_needs JSONB DEFAULT '{}'::jsonb,
  -- Funnel Stage
  stage TEXT NOT NULL DEFAULT 'Contato' CHECK (stage IN ('Contato', 'Qualificado', 'Proposta', 'Negociação', 'Ganho', 'Perdido')),
  -- Temperature (Sentiment)
  temperature TEXT DEFAULT 'morno' CHECK (temperature IN ('quente', 'morno', 'frio')),
  conversation_summary TEXT,
  -- Source
  source TEXT DEFAULT 'google_maps',
  google_maps_url TEXT,
  -- Follow-up
  last_contact_at TIMESTAMP WITH TIME ZONE,
  last_response_at TIMESTAMP WITH TIME ZONE,
  follow_up_count INTEGER DEFAULT 0,
  next_follow_up_at TIMESTAMP WITH TIME ZONE,
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own leads"
  ON public.leads FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_leads_user_id ON public.leads(user_id);
CREATE INDEX idx_leads_stage ON public.leads(stage);
CREATE INDEX idx_leads_temperature ON public.leads(temperature);
CREATE INDEX idx_leads_phone ON public.leads(phone);

-- 4. CHAT MESSAGES TABLE
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  -- Message
  sender_type TEXT NOT NULL CHECK (sender_type IN ('agent', 'lead', 'user')),
  content TEXT NOT NULL,
  -- WhatsApp metadata
  whatsapp_message_id TEXT,
  status TEXT DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
  -- Timestamps
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Helper function to check lead ownership
CREATE OR REPLACE FUNCTION public.is_lead_owner(p_lead_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.leads 
    WHERE id = p_lead_id AND user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE POLICY "Users can manage chat messages of their leads"
  ON public.chat_messages FOR ALL
  USING (public.is_lead_owner(lead_id));

CREATE INDEX idx_chat_messages_lead_id ON public.chat_messages(lead_id);
CREATE INDEX idx_chat_messages_sent_at ON public.chat_messages(sent_at);

-- 5. MEETINGS TABLE
CREATE TABLE public.meetings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  -- Meeting Details
  title TEXT NOT NULL,
  description TEXT,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  -- Status
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  -- Meeting Link
  meeting_link TEXT,
  -- Notes
  notes TEXT,
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own meetings"
  ON public.meetings FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_meetings_user_id ON public.meetings(user_id);
CREATE INDEX idx_meetings_scheduled_at ON public.meetings(scheduled_at);

-- 6. ACTIVITY LOG TABLE
CREATE TABLE public.activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  -- Activity
  activity_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own activity"
  ON public.activity_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own activity"
  ON public.activity_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_activity_log_user_id ON public.activity_log(user_id);
CREATE INDEX idx_activity_log_created_at ON public.activity_log(created_at DESC);

-- 7. UPDATE TIMESTAMP FUNCTION
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_meetings_updated_at
  BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. AUTO-CREATE PROFILE AND SETTINGS ON USER SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ############################################################
-- [02/70] 20260205183050_1edecf76-2e28-4262-bb1d-96cee3c59fe6.sql
-- ############################################################

-- Add advanced agent configuration columns to user_settings
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS agent_type TEXT DEFAULT 'consultivo' 
  CHECK (agent_type IN ('consultivo', 'agressivo', 'amigavel', 'tecnico', 'empatico')),
ADD COLUMN IF NOT EXISTS personality_traits JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS communication_style TEXT DEFAULT 'formal'
  CHECK (communication_style IN ('formal', 'casual', 'profissional', 'descontraido')),
ADD COLUMN IF NOT EXISTS response_length TEXT DEFAULT 'medio'
  CHECK (response_length IN ('curto', 'medio', 'longo')),
ADD COLUMN IF NOT EXISTS emoji_usage TEXT DEFAULT 'moderado'
  CHECK (emoji_usage IN ('nenhum', 'minimo', 'moderado', 'frequente')),
ADD COLUMN IF NOT EXISTS objection_handling TEXT DEFAULT 'suave'
  CHECK (objection_handling IN ('suave', 'assertivo', 'persistente')),
ADD COLUMN IF NOT EXISTS closing_style TEXT DEFAULT 'consultivo'
  CHECK (closing_style IN ('consultivo', 'direto', 'urgencia', 'beneficio')),
ADD COLUMN IF NOT EXISTS follow_up_tone TEXT DEFAULT 'amigavel'
  CHECK (follow_up_tone IN ('amigavel', 'profissional', 'curioso', 'preocupado')),
ADD COLUMN IF NOT EXISTS greeting_style TEXT DEFAULT 'padrao'
  CHECK (greeting_style IN ('padrao', 'personalizado', 'criativo', 'minimalista')),
ADD COLUMN IF NOT EXISTS value_proposition_focus TEXT DEFAULT 'beneficios'
  CHECK (value_proposition_focus IN ('beneficios', 'resultados', 'economia', 'exclusividade'));


-- ############################################################
-- [03/70] 20260205232207_11dbefe6-cb8b-4d08-8877-d7e15ec72b81.sql
-- ############################################################

-- Create campaigns table for scheduled prospecting
CREATE TABLE public.campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  campaign_type TEXT NOT NULL DEFAULT 'automatic',
  niches TEXT[] DEFAULT '{}',
  locations TEXT[] DEFAULT '{}',
  message_template TEXT,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  leads_found INTEGER DEFAULT 0,
  leads_contacted INTEGER DEFAULT 0,
  leads_responded INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own campaigns"
ON public.campaigns FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own campaigns"
ON public.campaigns FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own campaigns"
ON public.campaigns FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own campaigns"
ON public.campaigns FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_campaigns_updated_at
BEFORE UPDATE ON public.campaigns
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for performance
CREATE INDEX idx_campaigns_user_id ON public.campaigns(user_id);
CREATE INDEX idx_campaigns_status ON public.campaigns(status);


-- ############################################################
-- [04/70] 20260205233003_d7e90fd5-d57d-43a2-b6c2-75a59cad978e.sql
-- ############################################################

-- Add new columns to leads table for advanced management
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS quality_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS rating DECIMAL(2,1),
ADD COLUMN IF NOT EXISTS reviews_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS best_contact_hour INTEGER;

-- Add new columns to user_settings for security and automation
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS daily_message_limit INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS message_interval_seconds INTEGER DEFAULT 60,
ADD COLUMN IF NOT EXISTS auto_start_hour INTEGER DEFAULT 9,
ADD COLUMN IF NOT EXISTS auto_end_hour INTEGER DEFAULT 18,
ADD COLUMN IF NOT EXISTS auto_prospecting_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS blacklist TEXT[] DEFAULT '{}';

-- Create message_templates table
CREATE TABLE IF NOT EXISTS public.message_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  niche TEXT NOT NULL,
  content TEXT NOT NULL,
  variables TEXT[] DEFAULT '{}',
  usage_count INTEGER DEFAULT 0,
  response_rate DECIMAL(5,2) DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for message_templates
CREATE POLICY "Users can view their own templates"
ON public.message_templates FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own templates"
ON public.message_templates FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own templates"
ON public.message_templates FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own templates"
ON public.message_templates FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_templates_updated_at
BEFORE UPDATE ON public.message_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create prospecting_stats table for AI analytics
CREATE TABLE IF NOT EXISTS public.prospecting_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  niche TEXT NOT NULL,
  location TEXT,
  hour_of_day INTEGER,
  day_of_week INTEGER,
  messages_sent INTEGER DEFAULT 0,
  responses_received INTEGER DEFAULT 0,
  positive_responses INTEGER DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.prospecting_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies for prospecting_stats
CREATE POLICY "Users can view their own stats"
ON public.prospecting_stats FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own stats"
ON public.prospecting_stats FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own stats"
ON public.prospecting_stats FOR UPDATE
USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_templates_user_niche ON public.message_templates(user_id, niche);
CREATE INDEX IF NOT EXISTS idx_stats_user_niche ON public.prospecting_stats(user_id, niche, date);
CREATE INDEX IF NOT EXISTS idx_leads_tags ON public.leads USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_leads_quality ON public.leads(user_id, quality_score DESC);


-- ############################################################
-- [05/70] 20260206013150_326004c7-83f9-4d47-baf3-b254a1eabaf8.sql
-- ############################################################

-- Add columns for user's own API keys
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS gemini_api_key TEXT,
ADD COLUMN IF NOT EXISTS serpapi_api_key TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.user_settings.gemini_api_key IS 'User personal Gemini API key for AI features';
COMMENT ON COLUMN public.user_settings.serpapi_api_key IS 'User personal SerpAPI key for lead prospecting';


-- ############################################################
-- [06/70] 20260206025213_b7aba049-3f33-48cb-a5ad-2b78bce18a79.sql
-- ############################################################

-- Create follow_up_sequences table for automated follow-up flows
CREATE TABLE public.follow_up_sequences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  trigger_type TEXT NOT NULL DEFAULT 'no_response', -- 'no_response', 'new_lead', 'stage_change'
  trigger_after_days INTEGER[] DEFAULT ARRAY[1, 3, 5, 7, 14],
  message_templates JSONB DEFAULT '[]'::jsonb, -- Array of {day: number, template_id: uuid, message: text}
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create scheduled_prospecting table for scheduled captures
CREATE TABLE public.scheduled_prospecting (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  niches TEXT[] NOT NULL DEFAULT '{}',
  locations TEXT[] NOT NULL DEFAULT '{}',
  prospecting_type TEXT DEFAULT 'consultivo',
  schedule_days INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5], -- 0=Sunday, 1=Monday, etc.
  schedule_hour INTEGER DEFAULT 9,
  max_leads_per_run INTEGER DEFAULT 20,
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,
  total_leads_captured INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add enrichment columns to leads table
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS linkedin_url TEXT,
ADD COLUMN IF NOT EXISTS facebook_url TEXT,
ADD COLUMN IF NOT EXISTS instagram_url TEXT,
ADD COLUMN IF NOT EXISTS twitter_url TEXT,
ADD COLUMN IF NOT EXISTS employee_count TEXT,
ADD COLUMN IF NOT EXISTS founded_year INTEGER,
ADD COLUMN IF NOT EXISTS industry TEXT,
ADD COLUMN IF NOT EXISTS company_description TEXT,
ADD COLUMN IF NOT EXISTS hunter_email TEXT,
ADD COLUMN IF NOT EXISTS hunter_email_confidence INTEGER;

-- Enable RLS for follow_up_sequences
ALTER TABLE public.follow_up_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own sequences"
ON public.follow_up_sequences
FOR ALL
USING (auth.uid() = user_id);

-- Enable RLS for scheduled_prospecting
ALTER TABLE public.scheduled_prospecting ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own scheduled prospecting"
ON public.scheduled_prospecting
FOR ALL
USING (auth.uid() = user_id);

-- Add updated_at triggers
CREATE TRIGGER update_follow_up_sequences_updated_at
BEFORE UPDATE ON public.follow_up_sequences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_scheduled_prospecting_updated_at
BEFORE UPDATE ON public.scheduled_prospecting
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


-- ############################################################
-- [07/70] 20260206030514_4679ed9c-38e4-4a7f-9fea-911d4e73a679.sql
-- ############################################################

-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant usage on cron schema to postgres
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;


-- ############################################################
-- [08/70] 20260206030544_aace4901-3975-4864-b0fa-2fd040667be5.sql
-- ############################################################

-- Schedule prospecting check every hour at minute 0
SELECT cron.schedule(
  'scheduled-prospecting-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oeztpxyprifabkvysroh.supabase.co/functions/v1/scheduled-prospecting',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lenRweHlwcmlmYWJrdnlzcm9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTIyODAsImV4cCI6MjA4NTg4ODI4MH0.rGGWHPQTpMsyFPnSBw9XkaDEdmHlcaJJo8tJtfg3IaA"}'::jsonb,
    body := '{"action": "check_and_run"}'::jsonb
  ) AS request_id;
  $$
);

-- Schedule follow-up check every 30 minutes
SELECT cron.schedule(
  'follow-up-check',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oeztpxyprifabkvysroh.supabase.co/functions/v1/follow-up',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lenRweHlwcmlmYWJrdnlzcm9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTIyODAsImV4cCI6MjA4NTg4ODI4MH0.rGGWHPQTpMsyFPnSBw9XkaDEdmHlcaJJo8tJtfg3IaA"}'::jsonb,
    body := '{"action": "process_follow_ups"}'::jsonb
  ) AS request_id;
  $$
);


-- ############################################################
-- [09/70] 20260206032342_54e9428d-72ee-4ad7-8067-a161bd42881c.sql
-- ############################################################

-- Create teams table
CREATE TABLE public.teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create team members table
CREATE TABLE public.team_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  invited_by UUID,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- Create team invites table
CREATE TABLE public.team_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  invited_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add team_id to leads for team-based lead management
ALTER TABLE public.leads ADD COLUMN team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN assigned_to UUID;

-- Enable RLS on new tables
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

-- Teams policies
CREATE POLICY "Users can view their teams" ON public.teams
  FOR SELECT USING (
    id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Team owners can update their teams" ON public.teams
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Authenticated users can create teams" ON public.teams
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Team owners can delete their teams" ON public.teams
  FOR DELETE USING (owner_id = auth.uid());

-- Team members policies
CREATE POLICY "Team members can view their team members" ON public.team_members
  FOR SELECT USING (
    team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Team admins can add members" ON public.team_members
  FOR INSERT WITH CHECK (
    team_id IN (
      SELECT team_id FROM public.team_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Team admins can update members" ON public.team_members
  FOR UPDATE USING (
    team_id IN (
      SELECT team_id FROM public.team_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Team admins can remove members" ON public.team_members
  FOR DELETE USING (
    team_id IN (
      SELECT team_id FROM public.team_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    ) OR user_id = auth.uid()
  );

-- Team invites policies
CREATE POLICY "Team members can view invites" ON public.team_invites
  FOR SELECT USING (
    team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Team admins can create invites" ON public.team_invites
  FOR INSERT WITH CHECK (
    team_id IN (
      SELECT team_id FROM public.team_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Team admins can update invites" ON public.team_invites
  FOR UPDATE USING (
    team_id IN (
      SELECT team_id FROM public.team_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Team admins can delete invites" ON public.team_invites
  FOR DELETE USING (
    team_id IN (
      SELECT team_id FROM public.team_members 
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Update leads policy to include team access
CREATE POLICY "Team members can view team leads" ON public.leads
  FOR SELECT USING (
    user_id = auth.uid() OR 
    team_id IN (SELECT team_id FROM public.team_members WHERE user_id = auth.uid())
  );

-- Create trigger for updated_at on teams
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


-- ############################################################
-- [10/70] 20260206032756_618904bf-0d9d-4f71-b626-a996d477d968.sql
-- ############################################################

-- Create background jobs table for persistent task processing
CREATE TABLE public.background_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  job_type TEXT NOT NULL CHECK (job_type IN ('mass_send', 'campaign', 'follow_up', 'prospecting', 'import')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  priority INTEGER NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  
  -- Job configuration
  payload JSONB NOT NULL DEFAULT '{}',
  
  -- Progress tracking
  total_items INTEGER DEFAULT 0,
  processed_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,
  current_index INTEGER DEFAULT 0,
  
  -- Results and errors
  result JSONB,
  error_message TEXT,
  last_error_at TIMESTAMP WITH TIME ZONE,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  
  -- Timing
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  last_heartbeat_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own jobs" ON public.background_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own jobs" ON public.background_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own jobs" ON public.background_jobs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own jobs" ON public.background_jobs
  FOR DELETE USING (auth.uid() = user_id);

-- Index for efficient job processing queries
CREATE INDEX idx_background_jobs_status ON public.background_jobs(status, scheduled_at);
CREATE INDEX idx_background_jobs_user_status ON public.background_jobs(user_id, status);
CREATE INDEX idx_background_jobs_heartbeat ON public.background_jobs(status, last_heartbeat_at) 
  WHERE status = 'running';

-- Trigger for updated_at
CREATE TRIGGER update_background_jobs_updated_at
  BEFORE UPDATE ON public.background_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to find stale jobs (no heartbeat for 5 minutes) and mark them for retry
CREATE OR REPLACE FUNCTION public.recover_stale_jobs()
RETURNS INTEGER AS $$
DECLARE
  recovered_count INTEGER;
BEGIN
  UPDATE public.background_jobs
  SET 
    status = CASE 
      WHEN retry_count < max_retries THEN 'pending'
      ELSE 'failed'
    END,
    retry_count = retry_count + 1,
    error_message = CASE 
      WHEN retry_count < max_retries THEN 'Job recovered after timeout - will retry'
      ELSE 'Job failed after maximum retries'
    END,
    last_error_at = now(),
    updated_at = now()
  WHERE status = 'running'
    AND last_heartbeat_at < now() - interval '5 minutes';
  
  GET DIAGNOSTICS recovered_count = ROW_COUNT;
  RETURN recovered_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.recover_stale_jobs() TO authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_jobs() TO service_role;


-- ############################################################
-- [11/70] 20260206032811_dc4a3f58-87ef-4409-85ed-04872494ad39.sql
-- ############################################################

-- Fix search_path for recover_stale_jobs function
CREATE OR REPLACE FUNCTION public.recover_stale_jobs()
RETURNS INTEGER AS $$
DECLARE
  recovered_count INTEGER;
BEGIN
  UPDATE public.background_jobs
  SET 
    status = CASE 
      WHEN retry_count < max_retries THEN 'pending'
      ELSE 'failed'
    END,
    retry_count = retry_count + 1,
    error_message = CASE 
      WHEN retry_count < max_retries THEN 'Job recovered after timeout - will retry'
      ELSE 'Job failed after maximum retries'
    END,
    last_error_at = now(),
    updated_at = now()
  WHERE status = 'running'
    AND last_heartbeat_at < now() - interval '5 minutes';
  
  GET DIAGNOSTICS recovered_count = ROW_COUNT;
  RETURN recovered_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ############################################################
-- [12/70] 20260206033315_a5b3a612-f86f-4b86-a0bc-c85e51f3dc2b.sql
-- ############################################################

-- Add lead_score columns
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS score_factors JSONB DEFAULT '{}';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_scored_at TIMESTAMP WITH TIME ZONE;

-- Create index for lead scoring
CREATE INDEX IF NOT EXISTS idx_leads_lead_score ON public.leads(lead_score DESC);

-- Create function to calculate lead score
CREATE OR REPLACE FUNCTION public.calculate_lead_score(p_lead_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_score INTEGER := 0;
  v_lead RECORD;
  v_message_count INTEGER;
  v_response_count INTEGER;
  v_factors JSONB := '{}';
BEGIN
  -- Get lead data
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Factor 1: Has responded (40 points)
  SELECT COUNT(*) INTO v_response_count
  FROM public.chat_messages
  WHERE lead_id = p_lead_id AND sender_type = 'lead';
  
  IF v_response_count > 0 THEN
    v_score := v_score + 40;
    v_factors := v_factors || jsonb_build_object('responded', 40);
  END IF;

  -- Factor 2: Response ratio (up to 20 points)
  SELECT COUNT(*) INTO v_message_count
  FROM public.chat_messages
  WHERE lead_id = p_lead_id AND sender_type IN ('user', 'agent');
  
  IF v_message_count > 0 THEN
    DECLARE
      v_ratio NUMERIC := v_response_count::NUMERIC / v_message_count;
      v_ratio_score INTEGER := LEAST(20, FLOOR(v_ratio * 40));
    BEGIN
      v_score := v_score + v_ratio_score;
      v_factors := v_factors || jsonb_build_object('response_ratio', v_ratio_score);
    END;
  END IF;

  -- Factor 3: Stage progression (up to 20 points)
  CASE v_lead.stage
    WHEN 'new' THEN v_score := v_score + 0;
    WHEN 'contacted' THEN v_score := v_score + 5;
    WHEN 'qualified' THEN v_score := v_score + 10;
    WHEN 'proposal' THEN v_score := v_score + 15;
    WHEN 'negotiation' THEN v_score := v_score + 18;
    WHEN 'won' THEN v_score := v_score + 20;
    ELSE v_score := v_score + 0;
  END CASE;
  v_factors := v_factors || jsonb_build_object('stage', CASE v_lead.stage
    WHEN 'new' THEN 0
    WHEN 'contacted' THEN 5
    WHEN 'qualified' THEN 10
    WHEN 'proposal' THEN 15
    WHEN 'negotiation' THEN 18
    WHEN 'won' THEN 20
    ELSE 0
  END);

  -- Factor 4: Temperature (10 points)
  CASE v_lead.temperature
    WHEN 'quente' THEN 
      v_score := v_score + 10;
      v_factors := v_factors || jsonb_build_object('temperature', 10);
    WHEN 'morno' THEN 
      v_score := v_score + 5;
      v_factors := v_factors || jsonb_build_object('temperature', 5);
    ELSE 
      v_factors := v_factors || jsonb_build_object('temperature', 0);
  END CASE;

  -- Factor 5: Has email (5 points)
  IF v_lead.email IS NOT NULL THEN
    v_score := v_score + 5;
    v_factors := v_factors || jsonb_build_object('has_email', 5);
  END IF;

  -- Factor 6: Has website (5 points)
  IF v_lead.website IS NOT NULL THEN
    v_score := v_score + 5;
    v_factors := v_factors || jsonb_build_object('has_website', 5);
  END IF;

  -- Update lead with score
  UPDATE public.leads
  SET 
    lead_score = v_score,
    score_factors = v_factors,
    last_scored_at = now()
  WHERE id = p_lead_id;

  RETURN v_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.calculate_lead_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_lead_score(UUID) TO service_role;


-- ############################################################
-- [13/70] 20260206200655_77b5d629-91cf-44ac-bcec-133c992ce14b.sql
-- ############################################################

-- Create prospecting_history table to track all prospecting sessions
CREATE TABLE public.prospecting_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  session_type TEXT NOT NULL DEFAULT 'capture', -- capture, mass_send, campaign, import
  niche TEXT,
  location TEXT,
  total_found INTEGER DEFAULT 0,
  total_saved INTEGER DEFAULT 0,
  total_sent INTEGER DEFAULT 0,
  total_errors INTEGER DEFAULT 0,
  total_duplicates INTEGER DEFAULT 0,
  total_pending INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running', -- running, completed, failed, cancelled
  error_message TEXT,
  leads_data JSONB DEFAULT '[]'::jsonb, -- Store captured leads details
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.prospecting_history ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own prospecting history" 
ON public.prospecting_history 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own prospecting history" 
ON public.prospecting_history 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own prospecting history" 
ON public.prospecting_history 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own prospecting history" 
ON public.prospecting_history 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_prospecting_history_user_id ON public.prospecting_history(user_id);
CREATE INDEX idx_prospecting_history_created_at ON public.prospecting_history(created_at DESC);
CREATE INDEX idx_prospecting_history_status ON public.prospecting_history(status);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_prospecting_history_updated_at
BEFORE UPDATE ON public.prospecting_history
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


-- ############################################################
-- [14/70] 20260207011238_f3316bde-b3fb-4cd8-95ff-96f57096b1e1.sql
-- ############################################################

-- Add anti-block configuration columns to user_settings
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS work_days_only boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS operate_all_day boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS warmup_enabled boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS warmup_day integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS warmup_start_date timestamptz DEFAULT null,
ADD COLUMN IF NOT EXISTS randomize_interval boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS randomize_order boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS typing_simulation boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS pause_on_error boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS cooldown_after_batch boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS batch_size integer DEFAULT 10,
ADD COLUMN IF NOT EXISTS cooldown_minutes integer DEFAULT 15;


-- ############################################################
-- [15/70] 20260207011903_ae6663ad-d073-45e7-905d-c8372aa0dea7.sql
-- ############################################################

-- Add remaining anti-block configuration columns to user_settings
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS hourly_message_limit integer DEFAULT 10,
ADD COLUMN IF NOT EXISTS message_interval_max integer DEFAULT 180,
ADD COLUMN IF NOT EXISTS max_consecutive_errors integer DEFAULT 3,
ADD COLUMN IF NOT EXISTS pause_duration_minutes integer DEFAULT 30,
ADD COLUMN IF NOT EXISTS typing_delay_ms integer DEFAULT 2000,
ADD COLUMN IF NOT EXISTS read_receipt_delay boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_slowdown boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS slowdown_threshold integer DEFAULT 5;


-- ############################################################
-- [16/70] 20260207013757_2a426a67-937e-4efa-8032-b61e1ba388ad.sql
-- ############################################################

-- Create a table to store job logs for persistence
CREATE TABLE public.job_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.background_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  level TEXT NOT NULL DEFAULT 'info', -- 'info', 'error', 'warning', 'success'
  message TEXT NOT NULL,
  metadata JSONB DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.job_logs ENABLE ROW LEVEL SECURITY;

-- Create policy for users to view their own logs
CREATE POLICY "Users can view their own job logs"
  ON public.job_logs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy for inserting (only service role can insert)
CREATE POLICY "Service role can insert job logs"
  ON public.job_logs
  FOR INSERT
  WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_job_logs_user_id ON public.job_logs(user_id);
CREATE INDEX idx_job_logs_job_id ON public.job_logs(job_id);
CREATE INDEX idx_job_logs_created_at ON public.job_logs(created_at DESC);


-- ############################################################
-- [17/70] 20260207013812_6b0dd7ce-fa90-4e59-9576-b6965df18b78.sql
-- ############################################################

-- Drop the permissive INSERT policy
DROP POLICY IF EXISTS "Service role can insert job logs" ON public.job_logs;

-- For job_logs, inserts will only happen from Edge Functions using service role key
-- which bypasses RLS entirely. No INSERT policy needed for authenticated users.


-- ############################################################
-- [18/70] 20260207020000_2e40c0df-7429-4f05-8598-00a037a871d8.sql
-- ############################################################

-- Add message_sent field to track if a lead received a message or not
ALTER TABLE public.leads 
ADD COLUMN message_sent boolean DEFAULT false;

-- Add index for better filtering performance
CREATE INDEX idx_leads_message_sent ON public.leads(user_id, message_sent);

-- Update existing leads that have chat_messages as sent
UPDATE public.leads l
SET message_sent = true
WHERE EXISTS (
  SELECT 1 FROM public.chat_messages cm 
  WHERE cm.lead_id = l.id 
  AND cm.sender_type IN ('agent', 'user')
);


-- ############################################################
-- [19/70] 20260207190348_008f6d76-52cd-4fa7-a2c2-ffe883337c03.sql
-- ############################################################

-- Add Serper.dev API key and preferred search API fields to user_settings
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS serper_api_key text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS preferred_search_api text DEFAULT 'serper';


-- ############################################################
-- [20/70] 20260208181338_9f789e7f-1480-4a0c-8773-34bef8d7a82b.sql
-- ############################################################

-- Tabela de estados brasileiros
CREATE TABLE public.brazil_states (
  id SERIAL PRIMARY KEY,
  code CHAR(2) NOT NULL UNIQUE,
  name TEXT NOT NULL,
  region TEXT NOT NULL
);

-- Tabela de cidades brasileiras
CREATE TABLE public.brazil_cities (
  id SERIAL PRIMARY KEY,
  state_code CHAR(2) NOT NULL REFERENCES public.brazil_states(code),
  name TEXT NOT NULL,
  ibge_code INTEGER,
  UNIQUE(state_code, name)
);

-- Tabela de faixas de CEP por região
CREATE TABLE public.brazil_cep_ranges (
  id SERIAL PRIMARY KEY,
  state_code CHAR(2) NOT NULL REFERENCES public.brazil_states(code),
  city_name TEXT,
  cep_start TEXT NOT NULL,
  cep_end TEXT NOT NULL,
  region_name TEXT
);

-- Tabela de histórico de buscas do usuário
CREATE TABLE public.search_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  search_type TEXT NOT NULL DEFAULT 'niche',
  search_term TEXT NOT NULL,
  location TEXT,
  results_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de leads favoritos
CREATE TABLE public.favorite_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, lead_id)
);

-- Índices para performance
CREATE INDEX idx_brazil_cities_state ON public.brazil_cities(state_code);
CREATE INDEX idx_brazil_cities_name ON public.brazil_cities(name);
CREATE INDEX idx_brazil_cep_ranges_state ON public.brazil_cep_ranges(state_code);
CREATE INDEX idx_search_history_user ON public.search_history(user_id);
CREATE INDEX idx_search_history_created ON public.search_history(created_at DESC);
CREATE INDEX idx_favorite_leads_user ON public.favorite_leads(user_id);

-- RLS para search_history
ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own search history"
ON public.search_history
FOR ALL
USING (auth.uid() = user_id);

-- RLS para favorite_leads
ALTER TABLE public.favorite_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own favorites"
ON public.favorite_leads
FOR ALL
USING (auth.uid() = user_id);

-- Tabelas de referência (estados e CEPs) são públicas para leitura
ALTER TABLE public.brazil_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read states"
ON public.brazil_states FOR SELECT USING (true);

ALTER TABLE public.brazil_cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read cities"
ON public.brazil_cities FOR SELECT USING (true);

ALTER TABLE public.brazil_cep_ranges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read CEP ranges"
ON public.brazil_cep_ranges FOR SELECT USING (true);

-- Inserir todos os estados brasileiros
INSERT INTO public.brazil_states (code, name, region) VALUES
('AC', 'Acre', 'Norte'),
('AL', 'Alagoas', 'Nordeste'),
('AP', 'Amapá', 'Norte'),
('AM', 'Amazonas', 'Norte'),
('BA', 'Bahia', 'Nordeste'),
('CE', 'Ceará', 'Nordeste'),
('DF', 'Distrito Federal', 'Centro-Oeste'),
('ES', 'Espírito Santo', 'Sudeste'),
('GO', 'Goiás', 'Centro-Oeste'),
('MA', 'Maranhão', 'Nordeste'),
('MT', 'Mato Grosso', 'Centro-Oeste'),
('MS', 'Mato Grosso do Sul', 'Centro-Oeste'),
('MG', 'Minas Gerais', 'Sudeste'),
('PA', 'Pará', 'Norte'),
('PB', 'Paraíba', 'Nordeste'),
('PR', 'Paraná', 'Sul'),
('PE', 'Pernambuco', 'Nordeste'),
('PI', 'Piauí', 'Nordeste'),
('RJ', 'Rio de Janeiro', 'Sudeste'),
('RN', 'Rio Grande do Norte', 'Nordeste'),
('RS', 'Rio Grande do Sul', 'Sul'),
('RO', 'Rondônia', 'Norte'),
('RR', 'Roraima', 'Norte'),
('SC', 'Santa Catarina', 'Sul'),
('SP', 'São Paulo', 'Sudeste'),
('SE', 'Sergipe', 'Nordeste'),
('TO', 'Tocantins', 'Norte');

-- Inserir faixas de CEP por estado
INSERT INTO public.brazil_cep_ranges (state_code, cep_start, cep_end, region_name) VALUES
('SP', '01000-000', '19999-999', 'São Paulo'),
('RJ', '20000-000', '28999-999', 'Rio de Janeiro'),
('ES', '29000-000', '29999-999', 'Espírito Santo'),
('MG', '30000-000', '39999-999', 'Minas Gerais'),
('BA', '40000-000', '48999-999', 'Bahia'),
('SE', '49000-000', '49999-999', 'Sergipe'),
('PE', '50000-000', '56999-999', 'Pernambuco'),
('AL', '57000-000', '57999-999', 'Alagoas'),
('PB', '58000-000', '58999-999', 'Paraíba'),
('RN', '59000-000', '59999-999', 'Rio Grande do Norte'),
('CE', '60000-000', '63999-999', 'Ceará'),
('PI', '64000-000', '64999-999', 'Piauí'),
('MA', '65000-000', '65999-999', 'Maranhão'),
('PA', '66000-000', '68899-999', 'Pará'),
('AP', '68900-000', '68999-999', 'Amapá'),
('AM', '69000-000', '69299-999', 'Amazonas'),
('RR', '69300-000', '69399-999', 'Roraima'),
('AM', '69400-000', '69899-999', 'Amazonas Interior'),
('AC', '69900-000', '69999-999', 'Acre'),
('DF', '70000-000', '72799-999', 'Distrito Federal'),
('GO', '72800-000', '76799-999', 'Goiás'),
('TO', '77000-000', '77999-999', 'Tocantins'),
('MT', '78000-000', '78899-999', 'Mato Grosso'),
('RO', '78900-000', '78999-999', 'Rondônia'),
('MS', '79000-000', '79999-999', 'Mato Grosso do Sul'),
('PR', '80000-000', '87999-999', 'Paraná'),
('SC', '88000-000', '89999-999', 'Santa Catarina'),
('RS', '90000-000', '99999-999', 'Rio Grande do Sul');


-- ############################################################
-- [21/70] 20260208181733_3a06c0bd-d400-42e8-8cf6-47de6e9a325a.sql
-- ############################################################

-- Inserir as principais cidades de cada estado brasileiro
INSERT INTO public.brazil_cities (state_code, name) VALUES
-- São Paulo
('SP', 'São Paulo'),
('SP', 'Campinas'),
('SP', 'Guarulhos'),
('SP', 'São Bernardo do Campo'),
('SP', 'Santo André'),
('SP', 'Osasco'),
('SP', 'Sorocaba'),
('SP', 'Ribeirão Preto'),
('SP', 'São José dos Campos'),
('SP', 'Santos'),
('SP', 'Piracicaba'),
('SP', 'Jundiaí'),
('SP', 'Barueri'),
('SP', 'Mauá'),
('SP', 'Diadema'),
('SP', 'Carapicuíba'),
('SP', 'Franca'),
('SP', 'Itaquaquecetuba'),
('SP', 'Mogi das Cruzes'),
('SP', 'Taboão da Serra'),
('SP', 'São José do Rio Preto'),
('SP', 'Bauru'),
('SP', 'Limeira'),
('SP', 'Suzano'),
('SP', 'Americana'),

-- Rio de Janeiro
('RJ', 'Rio de Janeiro'),
('RJ', 'São Gonçalo'),
('RJ', 'Duque de Caxias'),
('RJ', 'Nova Iguaçu'),
('RJ', 'Niterói'),
('RJ', 'Campos dos Goytacazes'),
('RJ', 'Belford Roxo'),
('RJ', 'São João de Meriti'),
('RJ', 'Petrópolis'),
('RJ', 'Volta Redonda'),
('RJ', 'Macaé'),
('RJ', 'Angra dos Reis'),
('RJ', 'Cabo Frio'),
('RJ', 'Nova Friburgo'),
('RJ', 'Teresópolis'),

-- Minas Gerais
('MG', 'Belo Horizonte'),
('MG', 'Uberlândia'),
('MG', 'Contagem'),
('MG', 'Juiz de Fora'),
('MG', 'Betim'),
('MG', 'Montes Claros'),
('MG', 'Ribeirão das Neves'),
('MG', 'Uberaba'),
('MG', 'Governador Valadares'),
('MG', 'Ipatinga'),
('MG', 'Sete Lagoas'),
('MG', 'Divinópolis'),
('MG', 'Poços de Caldas'),
('MG', 'Patos de Minas'),
('MG', 'Barbacena'),

-- Bahia
('BA', 'Salvador'),
('BA', 'Feira de Santana'),
('BA', 'Vitória da Conquista'),
('BA', 'Camaçari'),
('BA', 'Itabuna'),
('BA', 'Juazeiro'),
('BA', 'Lauro de Freitas'),
('BA', 'Ilhéus'),
('BA', 'Jequié'),
('BA', 'Teixeira de Freitas'),
('BA', 'Porto Seguro'),

-- Rio Grande do Sul
('RS', 'Porto Alegre'),
('RS', 'Caxias do Sul'),
('RS', 'Pelotas'),
('RS', 'Canoas'),
('RS', 'Santa Maria'),
('RS', 'Gravataí'),
('RS', 'Viamão'),
('RS', 'Novo Hamburgo'),
('RS', 'São Leopoldo'),
('RS', 'Rio Grande'),
('RS', 'Passo Fundo'),
('RS', 'Sapucaia do Sul'),

-- Paraná
('PR', 'Curitiba'),
('PR', 'Londrina'),
('PR', 'Maringá'),
('PR', 'Ponta Grossa'),
('PR', 'Cascavel'),
('PR', 'São José dos Pinhais'),
('PR', 'Foz do Iguaçu'),
('PR', 'Colombo'),
('PR', 'Guarapuava'),
('PR', 'Paranaguá'),
('PR', 'Toledo'),

-- Pernambuco
('PE', 'Recife'),
('PE', 'Jaboatão dos Guararapes'),
('PE', 'Olinda'),
('PE', 'Caruaru'),
('PE', 'Petrolina'),
('PE', 'Paulista'),
('PE', 'Cabo de Santo Agostinho'),
('PE', 'Camaragibe'),
('PE', 'Vitória de Santo Antão'),
('PE', 'Garanhuns'),

-- Ceará
('CE', 'Fortaleza'),
('CE', 'Caucaia'),
('CE', 'Juazeiro do Norte'),
('CE', 'Maracanaú'),
('CE', 'Sobral'),
('CE', 'Crato'),
('CE', 'Itapipoca'),
('CE', 'Maranguape'),
('CE', 'Iguatu'),
('CE', 'Quixadá'),

-- Pará
('PA', 'Belém'),
('PA', 'Ananindeua'),
('PA', 'Santarém'),
('PA', 'Marabá'),
('PA', 'Parauapebas'),
('PA', 'Castanhal'),
('PA', 'Abaetetuba'),
('PA', 'Altamira'),
('PA', 'Bragança'),
('PA', 'Tucuruí'),

-- Maranhão
('MA', 'São Luís'),
('MA', 'Imperatriz'),
('MA', 'São José de Ribamar'),
('MA', 'Timon'),
('MA', 'Caxias'),
('MA', 'Codó'),
('MA', 'Paço do Lumiar'),
('MA', 'Açailândia'),
('MA', 'Bacabal'),
('MA', 'Balsas'),

-- Goiás
('GO', 'Goiânia'),
('GO', 'Aparecida de Goiânia'),
('GO', 'Anápolis'),
('GO', 'Rio Verde'),
('GO', 'Luziânia'),
('GO', 'Águas Lindas de Goiás'),
('GO', 'Valparaíso de Goiás'),
('GO', 'Trindade'),
('GO', 'Formosa'),
('GO', 'Novo Gama'),

-- Santa Catarina
('SC', 'Joinville'),
('SC', 'Florianópolis'),
('SC', 'Blumenau'),
('SC', 'São José'),
('SC', 'Itajaí'),
('SC', 'Criciúma'),
('SC', 'Chapecó'),
('SC', 'Jaraguá do Sul'),
('SC', 'Lages'),
('SC', 'Palhoça'),

-- Amazonas
('AM', 'Manaus'),
('AM', 'Parintins'),
('AM', 'Itacoatiara'),
('AM', 'Manacapuru'),
('AM', 'Coari'),
('AM', 'Tefé'),
('AM', 'Tabatinga'),

-- Paraíba
('PB', 'João Pessoa'),
('PB', 'Campina Grande'),
('PB', 'Santa Rita'),
('PB', 'Patos'),
('PB', 'Bayeux'),
('PB', 'Cabedelo'),
('PB', 'Cajazeiras'),

-- Rio Grande do Norte
('RN', 'Natal'),
('RN', 'Mossoró'),
('RN', 'Parnamirim'),
('RN', 'São Gonçalo do Amarante'),
('RN', 'Macaíba'),
('RN', 'Ceará-Mirim'),
('RN', 'Caicó'),

-- Espírito Santo
('ES', 'Vitória'),
('ES', 'Serra'),
('ES', 'Vila Velha'),
('ES', 'Cariacica'),
('ES', 'Cachoeiro de Itapemirim'),
('ES', 'Linhares'),
('ES', 'Colatina'),

-- Alagoas
('AL', 'Maceió'),
('AL', 'Arapiraca'),
('AL', 'Rio Largo'),
('AL', 'Palmeira dos Índios'),
('AL', 'União dos Palmares'),
('AL', 'Penedo'),

-- Piauí
('PI', 'Teresina'),
('PI', 'Parnaíba'),
('PI', 'Picos'),
('PI', 'Piripiri'),
('PI', 'Floriano'),
('PI', 'Campo Maior'),

-- Distrito Federal
('DF', 'Brasília'),

-- Mato Grosso
('MT', 'Cuiabá'),
('MT', 'Várzea Grande'),
('MT', 'Rondonópolis'),
('MT', 'Sinop'),
('MT', 'Tangará da Serra'),
('MT', 'Sorriso'),

-- Mato Grosso do Sul
('MS', 'Campo Grande'),
('MS', 'Dourados'),
('MS', 'Três Lagoas'),
('MS', 'Corumbá'),
('MS', 'Ponta Porã'),
('MS', 'Naviraí'),

-- Sergipe
('SE', 'Aracaju'),
('SE', 'Nossa Senhora do Socorro'),
('SE', 'Lagarto'),
('SE', 'Itabaiana'),
('SE', 'São Cristóvão'),
('SE', 'Estância'),

-- Rondônia
('RO', 'Porto Velho'),
('RO', 'Ji-Paraná'),
('RO', 'Ariquemes'),
('RO', 'Vilhena'),
('RO', 'Cacoal'),

-- Tocantins
('TO', 'Palmas'),
('TO', 'Araguaína'),
('TO', 'Gurupi'),
('TO', 'Porto Nacional'),
('TO', 'Paraíso do Tocantins'),

-- Acre
('AC', 'Rio Branco'),
('AC', 'Cruzeiro do Sul'),
('AC', 'Sena Madureira'),
('AC', 'Tarauacá'),

-- Amapá
('AP', 'Macapá'),
('AP', 'Santana'),
('AP', 'Laranjal do Jari'),
('AP', 'Oiapoque'),

-- Roraima
('RR', 'Boa Vista'),
('RR', 'Rorainópolis'),
('RR', 'Caracaraí')

ON CONFLICT (state_code, name) DO NOTHING;


-- ############################################################
-- [22/70] 20260208181913_67e4009f-8e27-4bab-a6ef-e5db40438894.sql
-- ############################################################

-- Add photo_url column to leads for storing Google Maps photos
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS photo_url TEXT DEFAULT NULL;

-- Add lead_group column for AI categorization
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS lead_group TEXT DEFAULT NULL;

-- Add service_opportunities column for storing AI-identified needs
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS service_opportunities TEXT[] DEFAULT '{}';

-- Add comments for documentation
COMMENT ON COLUMN public.leads.photo_url IS 'URL da foto do estabelecimento do Google Maps';
COMMENT ON COLUMN public.leads.lead_group IS 'Grupo do lead identificado pela IA (ex: Sem Site, Avaliação Baixa, etc)';
COMMENT ON COLUMN public.leads.service_opportunities IS 'Oportunidades de serviço identificadas pela IA';


-- ############################################################
-- [23/70] 20260208191417_7ebee322-8a33-43ae-9602-9c38aad61370.sql
-- ############################################################

-- Create service_intelligence table for storing AI knowledge per service
CREATE TABLE public.service_intelligence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  service_name TEXT NOT NULL,
  service_slug TEXT NOT NULL,
  
  -- AI Knowledge
  description TEXT,
  benefits TEXT[],
  pain_points TEXT[],
  objection_responses JSONB DEFAULT '{}',
  pricing_info TEXT,
  case_studies TEXT[],
  faq JSONB DEFAULT '[]',
  
  -- Message Templates
  opening_templates TEXT[],
  follow_up_templates TEXT[],
  closing_templates TEXT[],
  remarketing_templates TEXT[],
  
  -- Target Audience
  target_niches TEXT[],
  ideal_client_profile TEXT,
  
  -- Performance Data
  total_sent INTEGER DEFAULT 0,
  total_responses INTEGER DEFAULT 0,
  total_meetings INTEGER DEFAULT 0,
  conversion_rate NUMERIC(5,2) DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, service_slug)
);

-- Enable RLS
ALTER TABLE public.service_intelligence ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own service intelligence"
  ON public.service_intelligence
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own service intelligence"
  ON public.service_intelligence
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own service intelligence"
  ON public.service_intelligence
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own service intelligence"
  ON public.service_intelligence
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_service_intelligence_updated_at
  BEFORE UPDATE ON public.service_intelligence
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment
COMMENT ON TABLE public.service_intelligence IS 'AI knowledge base per service with templates and objection handling';


-- ############################################################
-- [24/70] 20260208192047_0d894ef8-33c4-4d98-9509-12ce48d017c6.sql
-- ############################################################

-- Tabela para armazenar padrões de aprendizado por nicho
CREATE TABLE public.niche_patterns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  niche TEXT NOT NULL,
  location TEXT,
  
  -- Padrões de horário
  best_contact_hours INTEGER[] DEFAULT '{}',
  response_rate_by_hour JSONB DEFAULT '{}',
  
  -- Padrões de mensagem
  best_opening_style TEXT,
  best_follow_up_interval_days INTEGER DEFAULT 3,
  avg_messages_to_convert INTEGER,
  
  -- Métricas de performance
  total_contacts INTEGER DEFAULT 0,
  total_responses INTEGER DEFAULT 0,
  total_conversions INTEGER DEFAULT 0,
  response_rate DECIMAL(5,2) DEFAULT 0,
  conversion_rate DECIMAL(5,2) DEFAULT 0,
  
  -- Objeções comuns
  common_objections JSONB DEFAULT '[]',
  successful_responses JSONB DEFAULT '[]',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, niche, location)
);

-- Tabela para qualificação BANT automática
CREATE TABLE public.lead_qualification (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  
  -- BANT Fields
  budget_status TEXT CHECK (budget_status IN ('unknown', 'no_budget', 'limited', 'adequate', 'high')),
  budget_details TEXT,
  budget_confidence INTEGER DEFAULT 0,
  
  authority_status TEXT CHECK (authority_status IN ('unknown', 'influencer', 'evaluator', 'decision_maker', 'buyer')),
  authority_details TEXT,
  authority_confidence INTEGER DEFAULT 0,
  
  need_status TEXT CHECK (need_status IN ('unknown', 'no_need', 'latent', 'active', 'urgent')),
  need_details TEXT,
  need_confidence INTEGER DEFAULT 0,
  
  timeline_status TEXT CHECK (timeline_status IN ('unknown', 'no_timeline', 'long_term', 'short_term', 'immediate')),
  timeline_details TEXT,
  timeline_confidence INTEGER DEFAULT 0,
  
  -- Score geral de qualificação (0-100)
  qualification_score INTEGER DEFAULT 0,
  
  -- Predição de fechamento
  close_probability INTEGER DEFAULT 0,
  predicted_close_date DATE,
  deal_value_estimate DECIMAL(12,2),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  UNIQUE(lead_id)
);

-- Tabela para sinais de compra detectados
CREATE TABLE public.buying_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'price_inquiry', 'timeline_mention', 'competitor_comparison',
    'feature_interest', 'urgency_expression', 'decision_maker_mention',
    'budget_disclosure', 'meeting_request', 'proposal_request', 'other'
  )),
  signal_strength INTEGER DEFAULT 50, -- 0-100
  signal_text TEXT, -- Trecho que gerou o sinal
  context TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para escalações para humano
CREATE TABLE public.agent_escalations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  
  escalation_reason TEXT NOT NULL CHECK (escalation_reason IN (
    'complex_objection', 'high_value_opportunity', 'complaint',
    'technical_question', 'urgent_request', 'closing_opportunity',
    'competitor_threat', 'custom_request', 'sentiment_negative'
  )),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  
  context TEXT, -- Resumo da situação
  recommended_action TEXT,
  
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'resolved', 'dismissed')),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para propostas geradas
CREATE TABLE public.generated_proposals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  
  service_id UUID REFERENCES public.service_intelligence(id),
  
  -- Conteúdo da proposta
  proposal_title TEXT NOT NULL,
  executive_summary TEXT,
  identified_needs JSONB DEFAULT '[]',
  proposed_solution TEXT,
  deliverables JSONB DEFAULT '[]',
  pricing_breakdown JSONB DEFAULT '{}',
  timeline TEXT,
  terms_conditions TEXT,
  
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'rejected')),
  sent_at TIMESTAMP WITH TIME ZONE,
  viewed_at TIMESTAMP WITH TIME ZONE,
  response_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para histórico de follow-ups inteligentes
CREATE TABLE public.intelligent_followups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  
  trigger_reason TEXT NOT NULL CHECK (trigger_reason IN (
    'no_response', 'partial_interest', 'price_objection',
    'timing_objection', 'buying_signal', 'engagement_drop',
    'scheduled', 'pattern_based'
  )),
  
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  message_template TEXT,
  message_sent TEXT,
  
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled', 'converted')),
  sent_at TIMESTAMP WITH TIME ZONE,
  result TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.niche_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_qualification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buying_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intelligent_followups ENABLE ROW LEVEL SECURITY;

-- Policies para niche_patterns
CREATE POLICY "Users can view their own niche patterns" ON public.niche_patterns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own niche patterns" ON public.niche_patterns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own niche patterns" ON public.niche_patterns FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own niche patterns" ON public.niche_patterns FOR DELETE USING (auth.uid() = user_id);

-- Policies para lead_qualification
CREATE POLICY "Users can view their own lead qualifications" ON public.lead_qualification FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own lead qualifications" ON public.lead_qualification FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own lead qualifications" ON public.lead_qualification FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own lead qualifications" ON public.lead_qualification FOR DELETE USING (auth.uid() = user_id);

-- Policies para buying_signals
CREATE POLICY "Users can view their own buying signals" ON public.buying_signals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own buying signals" ON public.buying_signals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own buying signals" ON public.buying_signals FOR DELETE USING (auth.uid() = user_id);

-- Policies para agent_escalations
CREATE POLICY "Users can view their own escalations" ON public.agent_escalations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own escalations" ON public.agent_escalations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own escalations" ON public.agent_escalations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own escalations" ON public.agent_escalations FOR DELETE USING (auth.uid() = user_id);

-- Policies para generated_proposals
CREATE POLICY "Users can view their own proposals" ON public.generated_proposals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own proposals" ON public.generated_proposals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own proposals" ON public.generated_proposals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own proposals" ON public.generated_proposals FOR DELETE USING (auth.uid() = user_id);

-- Policies para intelligent_followups
CREATE POLICY "Users can view their own followups" ON public.intelligent_followups FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own followups" ON public.intelligent_followups FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own followups" ON public.intelligent_followups FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own followups" ON public.intelligent_followups FOR DELETE USING (auth.uid() = user_id);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_niche_patterns_updated_at
BEFORE UPDATE ON public.niche_patterns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_lead_qualification_updated_at
BEFORE UPDATE ON public.lead_qualification FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_generated_proposals_updated_at
BEFORE UPDATE ON public.generated_proposals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para performance
CREATE INDEX idx_niche_patterns_user_niche ON public.niche_patterns(user_id, niche);
CREATE INDEX idx_lead_qualification_lead ON public.lead_qualification(lead_id);
CREATE INDEX idx_buying_signals_lead ON public.buying_signals(lead_id);
CREATE INDEX idx_buying_signals_created ON public.buying_signals(created_at DESC);
CREATE INDEX idx_agent_escalations_user_status ON public.agent_escalations(user_id, status);
CREATE INDEX idx_agent_escalations_priority ON public.agent_escalations(priority, created_at DESC);
CREATE INDEX idx_generated_proposals_lead ON public.generated_proposals(lead_id);
CREATE INDEX idx_intelligent_followups_scheduled ON public.intelligent_followups(scheduled_at, status);
CREATE INDEX idx_intelligent_followups_lead ON public.intelligent_followups(lead_id);


-- ############################################################
-- [25/70] 20260208195031_bf2c8644-1704-4ecf-a45a-9ca0a5f8c758.sql
-- ############################################################

-- Enable realtime for meetings table
ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;


-- ############################################################
-- [26/70] 20260208195200_88e7efb1-fb27-4ff8-aa12-9c0fa9f3690f.sql
-- ############################################################

-- Fix infinite recursion in team_members policies
-- The issue is that leads policy references team_members, and team_members references itself

-- First, drop the problematic policies on team_members
DROP POLICY IF EXISTS "Team members can view their team members" ON public.team_members;
DROP POLICY IF EXISTS "Team admins can add members" ON public.team_members;
DROP POLICY IF EXISTS "Team admins can update members" ON public.team_members;
DROP POLICY IF EXISTS "Team admins can remove members" ON public.team_members;

-- Create a security definer function to check team membership without triggering RLS
CREATE OR REPLACE FUNCTION public.get_user_team_ids(p_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT team_id FROM public.team_members WHERE user_id = p_user_id;
$$;

-- Create a function to check if user is team admin
CREATE OR REPLACE FUNCTION public.is_team_admin(p_team_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_id = p_team_id 
    AND user_id = p_user_id 
    AND role IN ('owner', 'admin')
  );
$$;

-- Recreate team_members policies using the security definer function
CREATE POLICY "Team members can view their team members"
ON public.team_members
FOR SELECT
USING (team_id IN (SELECT public.get_user_team_ids(auth.uid())));

CREATE POLICY "Team admins can add members"
ON public.team_members
FOR INSERT
WITH CHECK (public.is_team_admin(team_id, auth.uid()));

CREATE POLICY "Team admins can update members"
ON public.team_members
FOR UPDATE
USING (public.is_team_admin(team_id, auth.uid()));

CREATE POLICY "Team admins can remove members"
ON public.team_members
FOR DELETE
USING (public.is_team_admin(team_id, auth.uid()) OR user_id = auth.uid());

-- Update leads policy to use the function instead of direct subquery
DROP POLICY IF EXISTS "Team members can view team leads" ON public.leads;

CREATE POLICY "Team members can view team leads"
ON public.leads
FOR SELECT
USING (user_id = auth.uid() OR team_id IN (SELECT public.get_user_team_ids(auth.uid())));


-- ############################################################
-- [27/70] 20260208195526_433de59b-e7b9-4d0c-9cf0-58464dd974d8.sql
-- ############################################################

-- Add Google Meet link field to user_settings
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS google_meet_link text;


-- ############################################################
-- [28/70] 20260208202514_2db69d76-7698-4c32-af96-89c766fabc87.sql
-- ############################################################

-- =====================================================
-- SISTEMA ANTI-BAN WHATSAPP - TABELAS E CONFIGURAÇÕES
-- =====================================================

-- Tabela de fila de mensagens com controle anti-ban
CREATE TABLE public.whatsapp_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  phone VARCHAR(20) NOT NULL,
  original_content TEXT NOT NULL,
  processed_content TEXT, -- Conteúdo após Spintax
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'typing', 'sending', 'sent', 'failed', 'cancelled')),
  priority INTEGER DEFAULT 1,
  delay_seconds INTEGER DEFAULT 30,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  typing_started_at TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  simulate_typing BOOLEAN DEFAULT true,
  typing_duration_seconds INTEGER DEFAULT 3,
  batch_id UUID, -- Para agrupar mensagens do mesmo disparo
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de variações de texto (Spintax)
CREATE TABLE public.message_variations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  category VARCHAR(50) NOT NULL, -- Ex: 'greeting', 'closing', 'question'
  variations TEXT[] NOT NULL, -- Ex: ['Olá', 'Oi', 'Bom dia']
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de configurações Anti-Ban por usuário
CREATE TABLE public.antiban_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  -- Delays
  min_delay_seconds INTEGER DEFAULT 30,
  max_delay_seconds INTEGER DEFAULT 90,
  -- Warm-up
  warmup_enabled BOOLEAN DEFAULT true,
  warmup_day INTEGER DEFAULT 1, -- Dia atual do aquecimento
  warmup_start_date DATE,
  warmup_daily_limit INTEGER DEFAULT 10, -- Limite inicial
  warmup_increment_percent INTEGER DEFAULT 20, -- Aumento diário
  -- Simulação de digitação
  typing_enabled BOOLEAN DEFAULT true,
  min_typing_seconds INTEGER DEFAULT 2,
  max_typing_seconds INTEGER DEFAULT 6,
  -- Pausas de descanso
  rest_pause_enabled BOOLEAN DEFAULT true,
  messages_before_rest INTEGER DEFAULT 20,
  rest_duration_minutes INTEGER DEFAULT 15,
  -- Limites gerais
  daily_limit INTEGER DEFAULT 200,
  hourly_limit INTEGER DEFAULT 30,
  -- Blacklist keywords
  blacklist_keywords TEXT[] DEFAULT ARRAY['sair', 'stop', 'pare', 'parar', 'não quero', 'remover'],
  -- Status
  chip_health VARCHAR(20) DEFAULT 'healthy' CHECK (chip_health IN ('healthy', 'warning', 'critical', 'banned')),
  last_health_check_at TIMESTAMP WITH TIME ZONE,
  messages_sent_today INTEGER DEFAULT 0,
  messages_sent_hour INTEGER DEFAULT 0,
  last_message_sent_at TIMESTAMP WITH TIME ZONE,
  last_rest_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de blacklist de números
CREATE TABLE public.whatsapp_blacklist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  phone VARCHAR(20) NOT NULL,
  reason VARCHAR(100), -- 'opt_out', 'invalid', 'reported', 'manual'
  keyword_matched VARCHAR(100),
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de logs de saúde do chip
CREATE TABLE public.chip_health_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  health_status VARCHAR(20) NOT NULL,
  messages_sent_hour INTEGER,
  messages_sent_day INTEGER,
  failed_messages_hour INTEGER,
  connection_status VARCHAR(20),
  risk_factors JSONB,
  recommendations TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_whatsapp_queue_user_status ON public.whatsapp_queue(user_id, status);
CREATE INDEX idx_whatsapp_queue_scheduled ON public.whatsapp_queue(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX idx_whatsapp_queue_batch ON public.whatsapp_queue(batch_id);
CREATE INDEX idx_whatsapp_blacklist_user_phone ON public.whatsapp_blacklist(user_id, phone);
CREATE INDEX idx_chip_health_user ON public.chip_health_logs(user_id, created_at DESC);
CREATE INDEX idx_message_variations_user_cat ON public.message_variations(user_id, category);

-- Enable RLS
ALTER TABLE public.whatsapp_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.antiban_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chip_health_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users manage own queue" ON public.whatsapp_queue FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own variations" ON public.message_variations FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own antiban config" ON public.antiban_config FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own blacklist" ON public.whatsapp_blacklist FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users view own health logs" ON public.chip_health_logs FOR ALL USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_whatsapp_queue_updated_at
  BEFORE UPDATE ON public.whatsapp_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_message_variations_updated_at
  BEFORE UPDATE ON public.message_variations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_antiban_config_updated_at
  BEFORE UPDATE ON public.antiban_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Função para processar Spintax
CREATE OR REPLACE FUNCTION public.process_spintax(p_user_id UUID, p_content TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result TEXT := p_content;
  v_variation RECORD;
  v_random_idx INTEGER;
BEGIN
  -- Para cada categoria de variação do usuário
  FOR v_variation IN 
    SELECT category, variations 
    FROM public.message_variations 
    WHERE user_id = p_user_id AND is_active = true
  LOOP
    -- Seleciona uma variação aleatória
    v_random_idx := floor(random() * array_length(v_variation.variations, 1)) + 1;
    
    -- Substitui o placeholder pela variação
    v_result := regexp_replace(
      v_result, 
      '\{' || v_variation.category || '\}', 
      v_variation.variations[v_random_idx], 
      'gi'
    );
  END LOOP;
  
  RETURN v_result;
END;
$$;

-- Função para calcular delay atual baseado em warm-up
CREATE OR REPLACE FUNCTION public.get_current_daily_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_config RECORD;
  v_days_since_start INTEGER;
  v_calculated_limit INTEGER;
BEGIN
  SELECT * INTO v_config FROM public.antiban_config WHERE user_id = p_user_id;
  
  IF NOT FOUND OR NOT v_config.warmup_enabled THEN
    RETURN COALESCE(v_config.daily_limit, 200);
  END IF;
  
  IF v_config.warmup_start_date IS NULL THEN
    RETURN v_config.warmup_daily_limit;
  END IF;
  
  v_days_since_start := CURRENT_DATE - v_config.warmup_start_date;
  
  -- Calcula limite progressivo: base * (1 + increment%)^dias
  v_calculated_limit := v_config.warmup_daily_limit * 
    power(1 + (v_config.warmup_increment_percent::NUMERIC / 100), v_days_since_start);
  
  -- Não excede o limite máximo
  RETURN LEAST(v_calculated_limit::INTEGER, v_config.daily_limit);
END;
$$;

-- Função para verificar se número está na blacklist
CREATE OR REPLACE FUNCTION public.is_phone_blacklisted(p_user_id UUID, p_phone VARCHAR)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_blacklist 
    WHERE user_id = p_user_id AND phone = p_phone
  );
$$;

-- Função para adicionar à blacklist automaticamente por keyword
CREATE OR REPLACE FUNCTION public.check_and_blacklist_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lead RECORD;
  v_config RECORD;
  v_keyword TEXT;
BEGIN
  -- Só processa mensagens recebidas (do lead)
  IF NEW.sender_type != 'lead' THEN
    RETURN NEW;
  END IF;
  
  -- Busca dados do lead
  SELECT * INTO v_lead FROM public.leads WHERE id = NEW.lead_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  
  -- Busca config anti-ban
  SELECT * INTO v_config FROM public.antiban_config WHERE user_id = v_lead.user_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  
  -- Verifica keywords de opt-out
  FOREACH v_keyword IN ARRAY COALESCE(v_config.blacklist_keywords, ARRAY['sair', 'stop', 'pare'])
  LOOP
    IF lower(NEW.content) LIKE '%' || lower(v_keyword) || '%' THEN
      -- Adiciona à blacklist
      INSERT INTO public.whatsapp_blacklist (user_id, phone, reason, keyword_matched, lead_id)
      VALUES (v_lead.user_id, v_lead.phone, 'opt_out', v_keyword, v_lead.id)
      ON CONFLICT DO NOTHING;
      
      -- Remove mensagens pendentes da fila
      UPDATE public.whatsapp_queue 
      SET status = 'cancelled', error_message = 'Lead optou por sair: ' || v_keyword
      WHERE lead_id = v_lead.id AND status IN ('pending', 'scheduled');
      
      EXIT;
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$$;

-- Trigger para blacklist automática
CREATE TRIGGER auto_blacklist_on_response
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.check_and_blacklist_response();


-- ############################################################
-- [29/70] 20260208203508_962a4715-6ff9-43a3-b3bb-8364db4c3a9d.sql
-- ############################################################

-- Update default values for antiban_config to be more comprehensive
ALTER TABLE public.antiban_config 
ALTER COLUMN min_delay_seconds SET DEFAULT 15,
ALTER COLUMN max_delay_seconds SET DEFAULT 45,
ALTER COLUMN warmup_enabled SET DEFAULT true,
ALTER COLUMN warmup_daily_limit SET DEFAULT 20,
ALTER COLUMN warmup_increment_percent SET DEFAULT 25,
ALTER COLUMN typing_enabled SET DEFAULT true,
ALTER COLUMN min_typing_seconds SET DEFAULT 2,
ALTER COLUMN max_typing_seconds SET DEFAULT 6,
ALTER COLUMN rest_pause_enabled SET DEFAULT true,
ALTER COLUMN messages_before_rest SET DEFAULT 15,
ALTER COLUMN rest_duration_minutes SET DEFAULT 5,
ALTER COLUMN daily_limit SET DEFAULT 200,
ALTER COLUMN hourly_limit SET DEFAULT 30,
ALTER COLUMN blacklist_keywords SET DEFAULT ARRAY['sair', 'stop', 'pare', 'parar', 'não quero', 'nao quero', 'remover', 'cancelar', 'bloquear'];

-- Create function to initialize default message variations for new users
CREATE OR REPLACE FUNCTION public.create_default_message_variations()
RETURNS TRIGGER AS $$
BEGIN
  -- Saudações
  INSERT INTO public.message_variations (user_id, category, variations, is_active)
  VALUES (NEW.user_id, 'saudacao', ARRAY[
    'Olá',
    'Oi',
    'Olá, tudo bem?',
    'Oi, tudo bem?',
    'Bom dia',
    'Boa tarde',
    'E aí'
  ], true);
  
  -- Fechamentos
  INSERT INTO public.message_variations (user_id, category, variations, is_active)
  VALUES (NEW.user_id, 'fechamento', ARRAY[
    'Abraço!',
    'Forte abraço!',
    'Até mais!',
    'Aguardo seu retorno!',
    'Fico no aguardo!',
    'Qualquer coisa, estou à disposição!',
    'Conte comigo!'
  ], true);
  
  -- Interesse
  INSERT INTO public.message_variations (user_id, category, variations, is_active)
  VALUES (NEW.user_id, 'interesse', ARRAY[
    'Vi que você tem um negócio interessante',
    'Conheci seu trabalho e fiquei impressionado',
    'Encontrei sua empresa e achei muito legal',
    'Vi seu perfil e me chamou atenção',
    'Conheci seu trabalho recentemente'
  ], true);
  
  -- Proposta de valor
  INSERT INTO public.message_variations (user_id, category, variations, is_active)
  VALUES (NEW.user_id, 'proposta', ARRAY[
    'podemos ajudar você a atrair mais clientes',
    'temos uma solução que pode aumentar suas vendas',
    'posso mostrar como dobrar seu faturamento',
    'tenho uma proposta que pode te interessar',
    'podemos fazer sua empresa crescer'
  ], true);
  
  -- Call to action
  INSERT INTO public.message_variations (user_id, category, variations, is_active)
  VALUES (NEW.user_id, 'cta', ARRAY[
    'Podemos conversar 5 minutinhos?',
    'Quer que eu te explique melhor?',
    'Posso te mostrar alguns resultados?',
    'Que tal uma conversa rápida?',
    'Tem interesse em saber mais?',
    'Posso te enviar mais detalhes?'
  ], true);
  
  -- Emojis
  INSERT INTO public.message_variations (user_id, category, variations, is_active)
  VALUES (NEW.user_id, 'emoji', ARRAY[
    '😊',
    '👍',
    '🚀',
    '💪',
    '✨',
    '🎯',
    ''
  ], true);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-create variations when antiban_config is created
DROP TRIGGER IF EXISTS create_default_variations_trigger ON public.antiban_config;
CREATE TRIGGER create_default_variations_trigger
AFTER INSERT ON public.antiban_config
FOR EACH ROW
EXECUTE FUNCTION public.create_default_message_variations();

-- Insert default variations for existing users that don't have them
INSERT INTO public.message_variations (user_id, category, variations, is_active)
SELECT ac.user_id, 'saudacao', ARRAY['Olá', 'Oi', 'Olá, tudo bem?', 'Oi, tudo bem?', 'Bom dia', 'Boa tarde', 'E aí'], true
FROM public.antiban_config ac
WHERE NOT EXISTS (SELECT 1 FROM public.message_variations mv WHERE mv.user_id = ac.user_id AND mv.category = 'saudacao');

INSERT INTO public.message_variations (user_id, category, variations, is_active)
SELECT ac.user_id, 'fechamento', ARRAY['Abraço!', 'Forte abraço!', 'Até mais!', 'Aguardo seu retorno!', 'Fico no aguardo!', 'Qualquer coisa, estou à disposição!', 'Conte comigo!'], true
FROM public.antiban_config ac
WHERE NOT EXISTS (SELECT 1 FROM public.message_variations mv WHERE mv.user_id = ac.user_id AND mv.category = 'fechamento');

INSERT INTO public.message_variations (user_id, category, variations, is_active)
SELECT ac.user_id, 'interesse', ARRAY['Vi que você tem um negócio interessante', 'Conheci seu trabalho e fiquei impressionado', 'Encontrei sua empresa e achei muito legal', 'Vi seu perfil e me chamou atenção', 'Conheci seu trabalho recentemente'], true
FROM public.antiban_config ac
WHERE NOT EXISTS (SELECT 1 FROM public.message_variations mv WHERE mv.user_id = ac.user_id AND mv.category = 'interesse');

INSERT INTO public.message_variations (user_id, category, variations, is_active)
SELECT ac.user_id, 'proposta', ARRAY['podemos ajudar você a atrair mais clientes', 'temos uma solução que pode aumentar suas vendas', 'posso mostrar como dobrar seu faturamento', 'tenho uma proposta que pode te interessar', 'podemos fazer sua empresa crescer'], true
FROM public.antiban_config ac
WHERE NOT EXISTS (SELECT 1 FROM public.message_variations mv WHERE mv.user_id = ac.user_id AND mv.category = 'proposta');

INSERT INTO public.message_variations (user_id, category, variations, is_active)
SELECT ac.user_id, 'cta', ARRAY['Podemos conversar 5 minutinhos?', 'Quer que eu te explique melhor?', 'Posso te mostrar alguns resultados?', 'Que tal uma conversa rápida?', 'Tem interesse em saber mais?', 'Posso te enviar mais detalhes?'], true
FROM public.antiban_config ac
WHERE NOT EXISTS (SELECT 1 FROM public.message_variations mv WHERE mv.user_id = ac.user_id AND mv.category = 'cta');

INSERT INTO public.message_variations (user_id, category, variations, is_active)
SELECT ac.user_id, 'emoji', ARRAY['😊', '👍', '🚀', '💪', '✨', '🎯', ''], true
FROM public.antiban_config ac
WHERE NOT EXISTS (SELECT 1 FROM public.message_variations mv WHERE mv.user_id = ac.user_id AND mv.category = 'emoji');


-- ############################################################
-- [30/70] 20260208203846_41eabf8e-be44-4a47-bf48-9dc7477d56ce.sql
-- ############################################################

-- Delete existing variations for the user
DELETE FROM public.message_variations WHERE user_id = 'cf9b7383-d0d2-4617-9604-32d9e273dec8';

-- Insert 10 variations for each category
INSERT INTO public.message_variations (user_id, category, variations, is_active) VALUES
-- Saudações (10 variações)
('cf9b7383-d0d2-4617-9604-32d9e273dec8', 'saudacao', ARRAY[
  'Olá',
  'Oi',
  'Olá, tudo bem?',
  'Oi, tudo bem?',
  'Bom dia',
  'Boa tarde',
  'E aí',
  'Olá, como vai?',
  'Oi, tudo certo?',
  'Olá! Espero que esteja bem'
], true),

-- Fechamentos (10 variações)
('cf9b7383-d0d2-4617-9604-32d9e273dec8', 'fechamento', ARRAY[
  'Abraço!',
  'Forte abraço!',
  'Até mais!',
  'Aguardo seu retorno!',
  'Fico no aguardo!',
  'Qualquer coisa, estou à disposição!',
  'Conte comigo!',
  'Fico à disposição!',
  'Att.',
  'Obrigado pela atenção!'
], true),

-- Interesse (10 variações)
('cf9b7383-d0d2-4617-9604-32d9e273dec8', 'interesse', ARRAY[
  'Vi que você tem um negócio interessante',
  'Conheci seu trabalho e fiquei impressionado',
  'Encontrei sua empresa e achei muito legal',
  'Vi seu perfil e me chamou atenção',
  'Conheci seu trabalho recentemente',
  'Pesquisando na região, encontrei você',
  'Vi que você atua na área e curti muito',
  'Estava procurando profissionais como você',
  'Achei seu trabalho muito profissional',
  'Gostei muito do que vi sobre seu negócio'
], true),

-- Proposta de valor (10 variações)
('cf9b7383-d0d2-4617-9604-32d9e273dec8', 'proposta', ARRAY[
  'podemos ajudar você a atrair mais clientes',
  'temos uma solução que pode aumentar suas vendas',
  'posso mostrar como dobrar seu faturamento',
  'tenho uma proposta que pode te interessar',
  'podemos fazer sua empresa crescer',
  'tenho algo que pode transformar seu negócio',
  'podemos aumentar sua visibilidade online',
  'temos estratégias comprovadas para seu segmento',
  'posso ajudar você a conquistar novos clientes',
  'tenho uma oportunidade especial pra você'
], true),

-- Call to action (10 variações)
('cf9b7383-d0d2-4617-9604-32d9e273dec8', 'cta', ARRAY[
  'Podemos conversar 5 minutinhos?',
  'Quer que eu te explique melhor?',
  'Posso te mostrar alguns resultados?',
  'Que tal uma conversa rápida?',
  'Tem interesse em saber mais?',
  'Posso te enviar mais detalhes?',
  'Quer agendar uma call rápida?',
  'Posso te ligar amanhã?',
  'Quando podemos conversar?',
  'Quer conhecer nosso trabalho?'
], true),

-- Emojis (10 variações)
('cf9b7383-d0d2-4617-9604-32d9e273dec8', 'emoji', ARRAY[
  '😊',
  '👍',
  '🚀',
  '💪',
  '✨',
  '🎯',
  '🔥',
  '💼',
  '⭐',
  ''
], true),

-- Conectores (10 variações) - NOVA CATEGORIA
('cf9b7383-d0d2-4617-9604-32d9e273dec8', 'conector', ARRAY[
  'e pensei em você',
  'e lembrei de você',
  'e achei que poderia te ajudar',
  'e queria te fazer uma proposta',
  'e resolvi entrar em contato',
  'e decidi te mandar uma mensagem',
  'e acredito que posso te ajudar',
  'e tenho uma ideia pra você',
  'e pensei em uma parceria',
  'e gostaria de conversar contigo'
], true),

-- Urgência (10 variações) - NOVA CATEGORIA
('cf9b7383-d0d2-4617-9604-32d9e273dec8', 'urgencia', ARRAY[
  'Essa semana ainda tenho horários',
  'Tenho uma condição especial essa semana',
  'Estou com vagas limitadas',
  'Aproveita que estou com disponibilidade',
  'Só essa semana consigo esse valor',
  'Estou fechando a agenda do mês',
  'Tenho poucos horários ainda',
  'Essa promoção é por tempo limitado',
  'Aproveita enquanto tenho vaga',
  'Minha agenda está quase fechando'
], true),

-- Benefícios (10 variações) - NOVA CATEGORIA
('cf9b7383-d0d2-4617-9604-32d9e273dec8', 'beneficio', ARRAY[
  'você vai atrair mais clientes',
  'suas vendas podem dobrar',
  'você vai economizar tempo',
  'seu negócio vai crescer',
  'você vai ter mais visibilidade',
  'seus resultados vão melhorar',
  'você vai se destacar da concorrência',
  'seu faturamento pode aumentar',
  'você vai ter mais clientes qualificados',
  'sua marca vai ficar mais forte'
], true),

-- Perguntas (10 variações) - NOVA CATEGORIA
('cf9b7383-d0d2-4617-9604-32d9e273dec8', 'pergunta', ARRAY[
  'Como está seu movimento de clientes?',
  'Você está satisfeito com suas vendas?',
  'Está buscando novos clientes?',
  'Como anda a divulgação do seu negócio?',
  'Você já pensou em investir em marketing?',
  'Seu negócio está crescendo como gostaria?',
  'Está conseguindo bater suas metas?',
  'Como está a concorrência na sua região?',
  'Você tem presença nas redes sociais?',
  'Já tentou fazer anúncios online?'
], true);

-- Also update the default trigger function with all 10 categories
CREATE OR REPLACE FUNCTION public.create_default_message_variations()
RETURNS TRIGGER AS $$
BEGIN
  -- Saudações
  INSERT INTO public.message_variations (user_id, category, variations, is_active)
  VALUES (NEW.user_id, 'saudacao', ARRAY[
    'Olá', 'Oi', 'Olá, tudo bem?', 'Oi, tudo bem?', 'Bom dia',
    'Boa tarde', 'E aí', 'Olá, como vai?', 'Oi, tudo certo?', 'Olá! Espero que esteja bem'
  ], true);
  
  -- Fechamentos
  INSERT INTO public.message_variations (user_id, category, variations, is_active)
  VALUES (NEW.user_id, 'fechamento', ARRAY[
    'Abraço!', 'Forte abraço!', 'Até mais!', 'Aguardo seu retorno!', 'Fico no aguardo!',
    'Qualquer coisa, estou à disposição!', 'Conte comigo!', 'Fico à disposição!', 'Att.', 'Obrigado pela atenção!'
  ], true);
  
  -- Interesse
  INSERT INTO public.message_variations (user_id, category, variations, is_active)
  VALUES (NEW.user_id, 'interesse', ARRAY[
    'Vi que você tem um negócio interessante', 'Conheci seu trabalho e fiquei impressionado',
    'Encontrei sua empresa e achei muito legal', 'Vi seu perfil e me chamou atenção',
    'Conheci seu trabalho recentemente', 'Pesquisando na região, encontrei você',
    'Vi que você atua na área e curti muito', 'Estava procurando profissionais como você',
    'Achei seu trabalho muito profissional', 'Gostei muito do que vi sobre seu negócio'
  ], true);
  
  -- Proposta
  INSERT INTO public.message_variations (user_id, category, variations, is_active)
  VALUES (NEW.user_id, 'proposta', ARRAY[
    'podemos ajudar você a atrair mais clientes', 'temos uma solução que pode aumentar suas vendas',
    'posso mostrar como dobrar seu faturamento', 'tenho uma proposta que pode te interessar',
    'podemos fazer sua empresa crescer', 'tenho algo que pode transformar seu negócio',
    'podemos aumentar sua visibilidade online', 'temos estratégias comprovadas para seu segmento',
    'posso ajudar você a conquistar novos clientes', 'tenho uma oportunidade especial pra você'
  ], true);
  
  -- CTA
  INSERT INTO public.message_variations (user_id, category, variations, is_active)
  VALUES (NEW.user_id, 'cta', ARRAY[
    'Podemos conversar 5 minutinhos?', 'Quer que eu te explique melhor?',
    'Posso te mostrar alguns resultados?', 'Que tal uma conversa rápida?',
    'Tem interesse em saber mais?', 'Posso te enviar mais detalhes?',
    'Quer agendar uma call rápida?', 'Posso te ligar amanhã?',
    'Quando podemos conversar?', 'Quer conhecer nosso trabalho?'
  ], true);
  
  -- Emojis
  INSERT INTO public.message_variations (user_id, category, variations, is_active)
  VALUES (NEW.user_id, 'emoji', ARRAY[
    '😊', '👍', '🚀', '💪', '✨', '🎯', '🔥', '💼', '⭐', ''
  ], true);
  
  -- Conectores
  INSERT INTO public.message_variations (user_id, category, variations, is_active)
  VALUES (NEW.user_id, 'conector', ARRAY[
    'e pensei em você', 'e lembrei de você', 'e achei que poderia te ajudar',
    'e queria te fazer uma proposta', 'e resolvi entrar em contato',
    'e decidi te mandar uma mensagem', 'e acredito que posso te ajudar',
    'e tenho uma ideia pra você', 'e pensei em uma parceria', 'e gostaria de conversar contigo'
  ], true);
  
  -- Urgência
  INSERT INTO public.message_variations (user_id, category, variations, is_active)
  VALUES (NEW.user_id, 'urgencia', ARRAY[
    'Essa semana ainda tenho horários', 'Tenho uma condição especial essa semana',
    'Estou com vagas limitadas', 'Aproveita que estou com disponibilidade',
    'Só essa semana consigo esse valor', 'Estou fechando a agenda do mês',
    'Tenho poucos horários ainda', 'Essa promoção é por tempo limitado',
    'Aproveita enquanto tenho vaga', 'Minha agenda está quase fechando'
  ], true);
  
  -- Benefícios
  INSERT INTO public.message_variations (user_id, category, variations, is_active)
  VALUES (NEW.user_id, 'beneficio', ARRAY[
    'você vai atrair mais clientes', 'suas vendas podem dobrar',
    'você vai economizar tempo', 'seu negócio vai crescer',
    'você vai ter mais visibilidade', 'seus resultados vão melhorar',
    'você vai se destacar da concorrência', 'seu faturamento pode aumentar',
    'você vai ter mais clientes qualificados', 'sua marca vai ficar mais forte'
  ], true);
  
  -- Perguntas
  INSERT INTO public.message_variations (user_id, category, variations, is_active)
  VALUES (NEW.user_id, 'pergunta', ARRAY[
    'Como está seu movimento de clientes?', 'Você está satisfeito com suas vendas?',
    'Está buscando novos clientes?', 'Como anda a divulgação do seu negócio?',
    'Você já pensou em investir em marketing?', 'Seu negócio está crescendo como gostaria?',
    'Está conseguindo bater suas metas?', 'Como está a concorrência na sua região?',
    'Você tem presença nas redes sociais?', 'Já tentou fazer anúncios online?'
  ], true);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ############################################################
-- [31/70] 20260208204347_d389c481-8bae-44c0-b691-4330f935bb53.sql
-- ############################################################

-- Add missing UPDATE and DELETE policies for activity_log for security completeness
-- Activity logs should be append-only (immutable), so we deny updates and deletes

-- Drop existing policies if any for these operations
DROP POLICY IF EXISTS "Users cannot update activity logs" ON public.activity_log;
DROP POLICY IF EXISTS "Users cannot delete activity logs" ON public.activity_log;

-- Create restrictive policies - activity logs are immutable
CREATE POLICY "Users cannot update activity logs" 
ON public.activity_log 
FOR UPDATE 
USING (false);

CREATE POLICY "Users cannot delete activity logs" 
ON public.activity_log 
FOR DELETE 
USING (false);

-- Also ensure job_logs are immutable
DROP POLICY IF EXISTS "Users cannot update job logs" ON public.job_logs;
DROP POLICY IF EXISTS "Users cannot delete job logs" ON public.job_logs;

CREATE POLICY "Users cannot update job logs" 
ON public.job_logs 
FOR UPDATE 
USING (false);

CREATE POLICY "Users cannot delete job logs" 
ON public.job_logs 
FOR DELETE 
USING (false);


-- ############################################################
-- [32/70] 20260208204430_450f473b-c41b-4ece-8aba-b9020ff72f5f.sql
-- ############################################################

-- Update handle_new_user to also create antiban_config (which triggers message variations)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  
  -- Create user settings with defaults
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id);
  
  -- Create antiban config with defaults (this triggers message variations creation)
  INSERT INTO public.antiban_config (user_id)
  VALUES (NEW.id);
  
  RETURN NEW;
END;
$function$;


-- ############################################################
-- [33/70] 20260208210947_6e7aa69a-8dd1-4d1b-9ef0-d5918a404679.sql
-- ############################################################

-- Create table for long-term memory of conversations
CREATE TABLE public.lead_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  memory_type TEXT NOT NULL DEFAULT 'context', -- 'context', 'preference', 'objection', 'commitment', 'personal'
  key TEXT NOT NULL, -- e.g., 'preferred_contact_time', 'budget_mentioned', 'competitor_name'
  value TEXT NOT NULL, -- the actual memory content
  confidence NUMERIC(3,2) DEFAULT 1.0, -- 0.0 to 1.0 confidence score
  source TEXT DEFAULT 'conversation', -- 'conversation', 'manual', 'ai_analysis'
  expires_at TIMESTAMP WITH TIME ZONE, -- optional expiry for temporary memories
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(lead_id, memory_type, key)
);

-- Enable RLS
ALTER TABLE public.lead_memory ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own lead memories" 
ON public.lead_memory FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create lead memories" 
ON public.lead_memory FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own lead memories" 
ON public.lead_memory FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own lead memories" 
ON public.lead_memory FOR DELETE 
USING (auth.uid() = user_id);

-- Create index for fast lookups
CREATE INDEX idx_lead_memory_lead_id ON public.lead_memory(lead_id);
CREATE INDEX idx_lead_memory_user_lead ON public.lead_memory(user_id, lead_id);

-- Trigger to update updated_at
CREATE TRIGGER update_lead_memory_updated_at
BEFORE UPDATE ON public.lead_memory
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add conversation context column to leads for quick summary
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS ai_memory_summary TEXT,
ADD COLUMN IF NOT EXISTS first_contact_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS total_messages_exchanged INTEGER DEFAULT 0;

-- Function to upsert memory
CREATE OR REPLACE FUNCTION public.upsert_lead_memory(
  p_user_id UUID,
  p_lead_id UUID,
  p_memory_type TEXT,
  p_key TEXT,
  p_value TEXT,
  p_confidence NUMERIC DEFAULT 1.0,
  p_source TEXT DEFAULT 'conversation'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_memory_id UUID;
BEGIN
  INSERT INTO public.lead_memory (user_id, lead_id, memory_type, key, value, confidence, source)
  VALUES (p_user_id, p_lead_id, p_memory_type, p_key, p_value, p_confidence, p_source)
  ON CONFLICT (lead_id, memory_type, key) 
  DO UPDATE SET 
    value = EXCLUDED.value,
    confidence = EXCLUDED.confidence,
    updated_at = now()
  RETURNING id INTO v_memory_id;
  
  RETURN v_memory_id;
END;
$$;


-- ############################################################
-- [34/70] 20260328202602_78e85876-d6c6-4a03-a3cd-6e4aa2202088.sql
-- ############################################################

ALTER TABLE public.user_settings RENAME COLUMN gemini_api_key TO deepseek_api_key;


-- ############################################################
-- [35/70] 20260328204246_c329713f-3cf9-4d76-9ca6-11e412aeedb3.sql
-- ############################################################

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS deal_value numeric DEFAULT NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS tasks jsonb DEFAULT '[]'::jsonb;


-- ############################################################
-- [36/70] 20260328210134_bf4793c2-e64e-40aa-bc06-f1ef05813138.sql
-- ############################################################

ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS apify_token text DEFAULT NULL;


-- ############################################################
-- [37/70] 20260328231723_d8ed585b-aff0-4bc6-b27c-a67205f70b3b.sql
-- ############################################################


-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS: Admins can view all roles, users can view their own
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Only admins can insert roles
CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));


-- ############################################################
-- [38/70] 20260328231751_2eec8b54-2651-48bc-9182-20bbb7ae3f2e.sql
-- ############################################################


-- Seed admin role for the owner account
INSERT INTO public.user_roles (user_id, role)
VALUES ('4ab898dc-d738-4e01-ab2d-48e7554af43d', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;


-- ############################################################
-- [39/70] 20260328232818_81bfd73f-bdee-4c64-bcfe-9ba76c491aa6.sql
-- ############################################################


ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS auto_first_message_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_followup_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_pipeline_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_reactivation_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_lead_scoring boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS sdr_agent_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS weekly_report_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_niche text DEFAULT NULL;


-- ############################################################
-- [40/70] 20260329003158_6d4bd183-7fdd-451a-b49f-9c9064bead99.sql
-- ############################################################


-- Subscriptions table to track Cakto payment events
CREATE TABLE public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  cakto_order_id TEXT,
  cakto_customer_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  amount INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'BRL',
  payment_method TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  canceled_at TIMESTAMP WITH TIME ZONE,
  cakto_product_id TEXT,
  cakto_subscription_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_cakto_order_id ON public.subscriptions(cakto_order_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscriptions
CREATE POLICY "Users can read own subscriptions"
ON public.subscriptions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Only service role can insert/update (via webhook)
CREATE POLICY "Service role can manage subscriptions"
ON public.subscriptions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Payment events log
CREATE TABLE public.payment_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  cakto_order_id TEXT,
  cakto_event_id TEXT,
  customer_email TEXT,
  customer_name TEXT,
  amount INTEGER DEFAULT 0,
  product_name TEXT,
  raw_payload JSONB DEFAULT '{}',
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_events_user_id ON public.payment_events(user_id);
CREATE INDEX idx_payment_events_event_type ON public.payment_events(event_type);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own payment events"
ON public.payment_events
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage payment events"
ON public.payment_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Updated_at trigger for subscriptions
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


-- ############################################################
-- [41/70] 20260329021300_505bb8c1-042a-4ef9-9d1d-5812ceb566fe.sql
-- ############################################################

SELECT cron.schedule(
  'check-subscriptions-daily',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://oeztpxyprifabkvysroh.supabase.co/functions/v1/check-subscriptions',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lenRweHlwcmlmYWJrdnlzcm9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTIyODAsImV4cCI6MjA4NTg4ODI4MH0.rGGWHPQTpMsyFPnSBw9XkaDEdmHlcaJJo8tJtfg3IaA"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);


-- ############################################################
-- [42/70] 20260401152401_c80f3733-7b19-479b-8325-1a526c9997fc.sql
-- ############################################################

-- Fix: Add INSERT policy for job_logs
CREATE POLICY "Users can insert their own job logs"
ON public.job_logs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Fix: Add UPDATE policy for buying_signals
CREATE POLICY "Users can update their own buying signals"
ON public.buying_signals
FOR UPDATE
USING (auth.uid() = user_id);

-- Fix: Add Realtime authorization for meetings
ALTER PUBLICATION supabase_realtime DROP TABLE meetings;
ALTER PUBLICATION supabase_realtime ADD TABLE meetings;


-- ############################################################
-- [43/70] 20260402001353_c4b56a47-7609-46d3-bd08-3f6127f6025f.sql
-- ############################################################


-- Add geo columns to leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lng double precision;

-- Add instagram enrichment columns
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS instagram_bio text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS instagram_fetched_at timestamptz;

-- Create lead_notes table
CREATE TABLE IF NOT EXISTS public.lead_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own lead notes"
  ON public.lead_notes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own lead notes"
  ON public.lead_notes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own lead notes"
  ON public.lead_notes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own lead notes"
  ON public.lead_notes FOR DELETE
  USING (auth.uid() = user_id);

-- Index for faster geo queries
CREATE INDEX IF NOT EXISTS idx_leads_lat_lng ON public.leads (lat, lng) WHERE lat IS NOT NULL AND lng IS NOT NULL;


-- ############################################################
-- [44/70] 20260402013057_546d18d8-3a9c-495a-a6a7-7279233ad85b.sql
-- ############################################################

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS chip_rotation_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS chip_rotation_strategy text DEFAULT 'single',
  ADD COLUMN IF NOT EXISTS extra_chip_instances jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS active_chip_ids text[] DEFAULT '{}'::text[];


-- ############################################################
-- [45/70] 20260402013636_fcf655ab-d593-4ee0-b149-d6591196a030.sql
-- ############################################################


CREATE TABLE public.community_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  phone text NOT NULL,
  address text,
  rating numeric,
  reviews_count integer,
  website text,
  email text,
  google_maps_url text,
  niche text NOT NULL,
  location text NOT NULL,
  niche_normalized text NOT NULL,
  location_normalized text NOT NULL,
  source text DEFAULT 'serpapi',
  contributed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(phone, niche_normalized, location_normalized)
);

CREATE INDEX idx_community_leads_niche_location ON public.community_leads(niche_normalized, location_normalized);
CREATE INDEX idx_community_leads_phone ON public.community_leads(phone);

ALTER TABLE public.community_leads ENABLE ROW LEVEL SECURITY;

-- Everyone can read community leads
CREATE POLICY "Anyone authenticated can read community leads"
  ON public.community_leads FOR SELECT TO authenticated
  USING (true);

-- Anyone can insert (contribute)
CREATE POLICY "Anyone authenticated can insert community leads"
  ON public.community_leads FOR INSERT TO authenticated
  WITH CHECK (true);


-- ############################################################
-- [46/70] 20260405054816_83c5706b-d6c1-4d23-951e-c37435792c52.sql
-- ############################################################


-- Fix community_leads: restrict SELECT to own contributions
DROP POLICY IF EXISTS "Anyone authenticated can read community leads" ON public.community_leads;
CREATE POLICY "Users can read their own community leads"
ON public.community_leads
FOR SELECT
TO authenticated
USING (contributed_by = auth.uid());

-- Fix community_leads: restrict INSERT to own user
DROP POLICY IF EXISTS "Anyone authenticated can insert community leads" ON public.community_leads;
CREATE POLICY "Users can insert their own community leads"
ON public.community_leads
FOR INSERT
TO authenticated
WITH CHECK (contributed_by = auth.uid());

-- Fix chat_messages: change from public to authenticated
DROP POLICY IF EXISTS "Users can manage chat messages of their leads" ON public.chat_messages;
CREATE POLICY "Users can manage chat messages of their leads"
ON public.chat_messages
FOR ALL
TO authenticated
USING (is_lead_owner(lead_id));

-- Fix activity_log policies: public -> authenticated
DROP POLICY IF EXISTS "Users can insert their own activity" ON public.activity_log;
CREATE POLICY "Users can insert their own activity"
ON public.activity_log FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own activity" ON public.activity_log;
CREATE POLICY "Users can view their own activity"
ON public.activity_log FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users cannot delete activity logs" ON public.activity_log;
CREATE POLICY "Users cannot delete activity logs"
ON public.activity_log FOR DELETE TO authenticated
USING (false);

DROP POLICY IF EXISTS "Users cannot update activity logs" ON public.activity_log;
CREATE POLICY "Users cannot update activity logs"
ON public.activity_log FOR UPDATE TO authenticated
USING (false);

-- Fix campaigns policies
DROP POLICY IF EXISTS "Users can create their own campaigns" ON public.campaigns;
CREATE POLICY "Users can create their own campaigns"
ON public.campaigns FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own campaigns" ON public.campaigns;
CREATE POLICY "Users can delete their own campaigns"
ON public.campaigns FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own campaigns" ON public.campaigns;
CREATE POLICY "Users can update their own campaigns"
ON public.campaigns FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own campaigns" ON public.campaigns;
CREATE POLICY "Users can view their own campaigns"
ON public.campaigns FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Fix background_jobs policies
DROP POLICY IF EXISTS "Users can create their own jobs" ON public.background_jobs;
CREATE POLICY "Users can create their own jobs"
ON public.background_jobs FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own jobs" ON public.background_jobs;
CREATE POLICY "Users can delete their own jobs"
ON public.background_jobs FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own jobs" ON public.background_jobs;
CREATE POLICY "Users can update their own jobs"
ON public.background_jobs FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own jobs" ON public.background_jobs;
CREATE POLICY "Users can view their own jobs"
ON public.background_jobs FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Fix meetings policies
DROP POLICY IF EXISTS "Users can manage their own meetings" ON public.meetings;
CREATE POLICY "Users can manage their own meetings"
ON public.meetings FOR ALL TO authenticated
USING (auth.uid() = user_id);

-- Fix follow_up_sequences policies
DROP POLICY IF EXISTS "Users can manage their own sequences" ON public.follow_up_sequences;
CREATE POLICY "Users can manage their own sequences"
ON public.follow_up_sequences FOR ALL TO authenticated
USING (auth.uid() = user_id);

-- Fix leads policies
DROP POLICY IF EXISTS "Users can manage their own leads" ON public.leads;
CREATE POLICY "Users can manage their own leads"
ON public.leads FOR ALL TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Team members can view team leads" ON public.leads;
CREATE POLICY "Team members can view team leads"
ON public.leads FOR SELECT TO authenticated
USING ((user_id = auth.uid()) OR (team_id IN (SELECT get_user_team_ids(auth.uid()))));

-- Fix agent_escalations policies
DROP POLICY IF EXISTS "Users can delete their own escalations" ON public.agent_escalations;
CREATE POLICY "Users can delete their own escalations"
ON public.agent_escalations FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own escalations" ON public.agent_escalations;
CREATE POLICY "Users can insert their own escalations"
ON public.agent_escalations FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own escalations" ON public.agent_escalations;
CREATE POLICY "Users can update their own escalations"
ON public.agent_escalations FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own escalations" ON public.agent_escalations;
CREATE POLICY "Users can view their own escalations"
ON public.agent_escalations FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Fix antiban_config
DROP POLICY IF EXISTS "Users manage own antiban config" ON public.antiban_config;
CREATE POLICY "Users manage own antiban config"
ON public.antiban_config FOR ALL TO authenticated
USING (auth.uid() = user_id);

-- Fix buying_signals
DROP POLICY IF EXISTS "Users can delete their own buying signals" ON public.buying_signals;
CREATE POLICY "Users can delete their own buying signals"
ON public.buying_signals FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own buying signals" ON public.buying_signals;
CREATE POLICY "Users can insert their own buying signals"
ON public.buying_signals FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own buying signals" ON public.buying_signals;
CREATE POLICY "Users can update their own buying signals"
ON public.buying_signals FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own buying signals" ON public.buying_signals;
CREATE POLICY "Users can view their own buying signals"
ON public.buying_signals FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Fix chip_health_logs
DROP POLICY IF EXISTS "Users view own health logs" ON public.chip_health_logs;
CREATE POLICY "Users view own health logs"
ON public.chip_health_logs FOR ALL TO authenticated
USING (auth.uid() = user_id);

-- Fix favorite_leads
DROP POLICY IF EXISTS "Users can manage their own favorites" ON public.favorite_leads;
CREATE POLICY "Users can manage their own favorites"
ON public.favorite_leads FOR ALL TO authenticated
USING (auth.uid() = user_id);

-- Fix generated_proposals
DROP POLICY IF EXISTS "Users can delete their own proposals" ON public.generated_proposals;
CREATE POLICY "Users can delete their own proposals"
ON public.generated_proposals FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own proposals" ON public.generated_proposals;
CREATE POLICY "Users can insert their own proposals"
ON public.generated_proposals FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own proposals" ON public.generated_proposals;
CREATE POLICY "Users can update their own proposals"
ON public.generated_proposals FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own proposals" ON public.generated_proposals;
CREATE POLICY "Users can view their own proposals"
ON public.generated_proposals FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Fix intelligent_followups
DROP POLICY IF EXISTS "Users can delete their own followups" ON public.intelligent_followups;
CREATE POLICY "Users can delete their own followups"
ON public.intelligent_followups FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own followups" ON public.intelligent_followups;
CREATE POLICY "Users can insert their own followups"
ON public.intelligent_followups FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own followups" ON public.intelligent_followups;
CREATE POLICY "Users can update their own followups"
ON public.intelligent_followups FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own followups" ON public.intelligent_followups;
CREATE POLICY "Users can view their own followups"
ON public.intelligent_followups FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Fix job_logs
DROP POLICY IF EXISTS "Users can insert their own job logs" ON public.job_logs;
CREATE POLICY "Users can insert their own job logs"
ON public.job_logs FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own job logs" ON public.job_logs;
CREATE POLICY "Users can view their own job logs"
ON public.job_logs FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users cannot delete job logs" ON public.job_logs;
CREATE POLICY "Users cannot delete job logs"
ON public.job_logs FOR DELETE TO authenticated
USING (false);

DROP POLICY IF EXISTS "Users cannot update job logs" ON public.job_logs;
CREATE POLICY "Users cannot update job logs"
ON public.job_logs FOR UPDATE TO authenticated
USING (false);

-- Fix lead_memory
DROP POLICY IF EXISTS "Users can create lead memories" ON public.lead_memory;
CREATE POLICY "Users can create lead memories"
ON public.lead_memory FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own lead memories" ON public.lead_memory;
CREATE POLICY "Users can delete their own lead memories"
ON public.lead_memory FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own lead memories" ON public.lead_memory;
CREATE POLICY "Users can update their own lead memories"
ON public.lead_memory FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own lead memories" ON public.lead_memory;
CREATE POLICY "Users can view their own lead memories"
ON public.lead_memory FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Fix lead_notes
DROP POLICY IF EXISTS "Users can create their own lead notes" ON public.lead_notes;
CREATE POLICY "Users can create their own lead notes"
ON public.lead_notes FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own lead notes" ON public.lead_notes;
CREATE POLICY "Users can delete their own lead notes"
ON public.lead_notes FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own lead notes" ON public.lead_notes;
CREATE POLICY "Users can update their own lead notes"
ON public.lead_notes FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own lead notes" ON public.lead_notes;
CREATE POLICY "Users can view their own lead notes"
ON public.lead_notes FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Fix lead_qualification
DROP POLICY IF EXISTS "Users can delete their own lead qualifications" ON public.lead_qualification;
CREATE POLICY "Users can delete their own lead qualifications"
ON public.lead_qualification FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own lead qualifications" ON public.lead_qualification;
CREATE POLICY "Users can insert their own lead qualifications"
ON public.lead_qualification FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own lead qualifications" ON public.lead_qualification;
CREATE POLICY "Users can update their own lead qualifications"
ON public.lead_qualification FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own lead qualifications" ON public.lead_qualification;
CREATE POLICY "Users can view their own lead qualifications"
ON public.lead_qualification FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Fix message_templates
DROP POLICY IF EXISTS "Users can create their own templates" ON public.message_templates;
CREATE POLICY "Users can create their own templates"
ON public.message_templates FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own templates" ON public.message_templates;
CREATE POLICY "Users can delete their own templates"
ON public.message_templates FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own templates" ON public.message_templates;
CREATE POLICY "Users can update their own templates"
ON public.message_templates FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own templates" ON public.message_templates;
CREATE POLICY "Users can view their own templates"
ON public.message_templates FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Fix message_variations
DROP POLICY IF EXISTS "Users manage own variations" ON public.message_variations;
CREATE POLICY "Users manage own variations"
ON public.message_variations FOR ALL TO authenticated
USING (auth.uid() = user_id);

-- Fix niche_patterns
DROP POLICY IF EXISTS "Users can delete their own niche patterns" ON public.niche_patterns;
CREATE POLICY "Users can delete their own niche patterns"
ON public.niche_patterns FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own niche patterns" ON public.niche_patterns;
CREATE POLICY "Users can insert their own niche patterns"
ON public.niche_patterns FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own niche patterns" ON public.niche_patterns;
CREATE POLICY "Users can update their own niche patterns"
ON public.niche_patterns FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own niche patterns" ON public.niche_patterns;
CREATE POLICY "Users can view their own niche patterns"
ON public.niche_patterns FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Fix profiles
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Fix prospecting_history
DROP POLICY IF EXISTS "Users can create their own prospecting history" ON public.prospecting_history;
CREATE POLICY "Users can create their own prospecting history"
ON public.prospecting_history FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own prospecting history" ON public.prospecting_history;
CREATE POLICY "Users can delete their own prospecting history"
ON public.prospecting_history FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own prospecting history" ON public.prospecting_history;
CREATE POLICY "Users can update their own prospecting history"
ON public.prospecting_history FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own prospecting history" ON public.prospecting_history;
CREATE POLICY "Users can view their own prospecting history"
ON public.prospecting_history FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Fix prospecting_stats
DROP POLICY IF EXISTS "Users can create their own stats" ON public.prospecting_stats;
CREATE POLICY "Users can create their own stats"
ON public.prospecting_stats FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own stats" ON public.prospecting_stats;
CREATE POLICY "Users can update their own stats"
ON public.prospecting_stats FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own stats" ON public.prospecting_stats;
CREATE POLICY "Users can view their own stats"
ON public.prospecting_stats FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Fix scheduled_prospecting
DROP POLICY IF EXISTS "Users can manage their own scheduled prospecting" ON public.scheduled_prospecting;
CREATE POLICY "Users can manage their own scheduled prospecting"
ON public.scheduled_prospecting FOR ALL TO authenticated
USING (auth.uid() = user_id);

-- Fix search_history
DROP POLICY IF EXISTS "Users can manage their own search history" ON public.search_history;
CREATE POLICY "Users can manage their own search history"
ON public.search_history FOR ALL TO authenticated
USING (auth.uid() = user_id);

-- Fix service_intelligence
DROP POLICY IF EXISTS "Users can delete their own service intelligence" ON public.service_intelligence;
CREATE POLICY "Users can delete their own service intelligence"
ON public.service_intelligence FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own service intelligence" ON public.service_intelligence;
CREATE POLICY "Users can insert their own service intelligence"
ON public.service_intelligence FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own service intelligence" ON public.service_intelligence;
CREATE POLICY "Users can update their own service intelligence"
ON public.service_intelligence FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own service intelligence" ON public.service_intelligence;
CREATE POLICY "Users can view their own service intelligence"
ON public.service_intelligence FOR SELECT TO authenticated
USING (auth.uid() = user_id);


-- ############################################################
-- [47/70] 20260405055222_4d29b25e-c8a3-4c70-87a0-a53cff46692f.sql
-- ############################################################

-- Fix user_settings RLS policy to use authenticated role instead of public
DROP POLICY IF EXISTS "Users can manage their own settings" ON public.user_settings;

CREATE POLICY "Users can manage their own settings"
ON public.user_settings
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);


-- ############################################################
-- [48/70] 20260406145742_a790410a-815e-4fd7-aa69-26d07b7618db.sql
-- ############################################################


-- Support tickets table
CREATE TABLE public.support_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Support messages table
CREATE TABLE public.support_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  sender_type TEXT NOT NULL DEFAULT 'user',
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Admin notifications to users
CREATE TABLE public.admin_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  admin_id UUID NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Blocked users table
CREATE TABLE public.blocked_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  blocked_by UUID NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS for support_tickets
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tickets" ON public.support_tickets
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own tickets" ON public.support_tickets
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all tickets" ON public.support_tickets
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update any ticket" ON public.support_tickets
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- RLS for support_messages
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages of their tickets" ON public.support_messages
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.support_tickets WHERE id = ticket_id AND user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users can send messages on their tickets" ON public.support_messages
  FOR INSERT TO authenticated WITH CHECK (
    (sender_type = 'user' AND sender_id = auth.uid() AND EXISTS (SELECT 1 FROM public.support_tickets WHERE id = ticket_id AND user_id = auth.uid()))
    OR (sender_type = 'admin' AND public.has_role(auth.uid(), 'admin'))
  );

-- RLS for admin_notifications
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications" ON public.admin_notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications" ON public.admin_notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admins can create notifications" ON public.admin_notifications
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS for blocked_users
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage blocked users" ON public.blocked_users
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can check if they are blocked" ON public.blocked_users
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Updated_at triggers
CREATE TRIGGER update_support_tickets_updated_at BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ############################################################
-- [49/70] 20260406174649_42c7ffce-cdac-4b27-a99b-1269c4103f0d.sql
-- ############################################################

SELECT cron.schedule(
  'cron-tasks-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oeztpxyprifabkvysroh.supabase.co/functions/v1/cron-tasks',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lenRweHlwcmlmYWJrdnlzcm9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTIyODAsImV4cCI6MjA4NTg4ODI4MH0.rGGWHPQTpMsyFPnSBw9XkaDEdmHlcaJJo8tJtfg3IaA"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);


-- ############################################################
-- [50/70] 20260406174934_0c16818d-cfa6-4d24-aae9-fe2c173260ca.sql
-- ############################################################


CREATE TABLE public.ab_tests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  name TEXT NOT NULL,
  niche TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  variant_a_template_id UUID REFERENCES public.message_templates(id) ON DELETE SET NULL,
  variant_b_template_id UUID REFERENCES public.message_templates(id) ON DELETE SET NULL,
  variant_a_name TEXT NOT NULL,
  variant_b_name TEXT NOT NULL,
  variant_a_content TEXT NOT NULL,
  variant_b_content TEXT NOT NULL,
  variant_a_sent INTEGER NOT NULL DEFAULT 0,
  variant_b_sent INTEGER NOT NULL DEFAULT 0,
  variant_a_responses INTEGER NOT NULL DEFAULT 0,
  variant_b_responses INTEGER NOT NULL DEFAULT 0,
  variant_a_conversions INTEGER NOT NULL DEFAULT 0,
  variant_b_conversions INTEGER NOT NULL DEFAULT 0,
  winner TEXT,
  confidence NUMERIC,
  min_sample_size INTEGER NOT NULL DEFAULT 50,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ab_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own AB tests" ON public.ab_tests
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ############################################################
-- [51/70] 20260406175538_34e59281-80c0-4ccc-a870-876f6d285ee4.sql
-- ############################################################

ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS meta_access_token text;


-- ############################################################
-- [52/70] 20260423021202_b85849e1-27e8-4902-8e36-061b8c04a873.sql
-- ############################################################

DO $$
DECLARE
  v_user_id UUID := gen_random_uuid();
BEGIN
  -- Insert into auth.users (triggers will handle profiles, user_settings, and antiban_config)
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    aud,
    role,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'torloni.rendaextra@gmail.com',
    crypt('@Costagold2026', gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}',
    '{"full_name": "Torloni Renda Extra"}',
    'authenticated',
    'authenticated',
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  -- Insert lifetime subscription for the newly created user
  INSERT INTO public.subscriptions (
    user_id,
    plan,
    status,
    amount,
    started_at,
    expires_at,
    created_at,
    updated_at
  ) VALUES (
    v_user_id,
    'enterprise',
    'active',
    0,
    now(),
    now() + interval '100 years',
    now(),
    now()
  );
END $$;


-- ############################################################
-- [53/70] 20260724192641_cf1ef2c1-ea12-4683-853e-6f88396ac174.sql
-- ############################################################


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


-- ############################################################
-- [54/70] 20260724224950_289cdd27-aabd-45d6-9750-793cc1db5dad.sql
-- ############################################################


CREATE TABLE public.objection_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  objection_keywords TEXT[] NOT NULL DEFAULT '{}',
  objection_example TEXT NOT NULL,
  response_template TEXT NOT NULL,
  angle TEXT,
  usage_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_template BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.objection_responses TO authenticated;
GRANT ALL ON public.objection_responses TO service_role;

ALTER TABLE public.objection_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view own or templates" ON public.objection_responses
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_template = true);
CREATE POLICY "insert own" ON public.objection_responses
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "update own" ON public.objection_responses
  FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "delete own" ON public.objection_responses
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER update_objection_responses_updated_at BEFORE UPDATE ON public.objection_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_objection_responses_user ON public.objection_responses(user_id) WHERE is_active = true;
CREATE INDEX idx_objection_responses_template ON public.objection_responses(is_template) WHERE is_template = true;

-- Seed 15 objeções brasileiras mais comuns
INSERT INTO public.objection_responses (user_id, is_template, category, objection_keywords, objection_example, response_template, angle) VALUES
(NULL, true, 'preco', ARRAY['caro','preço alto','muito dinheiro','não tenho dinheiro','sem orçamento'], 'Tá caro demais pra mim', 'Entendo perfeitamente. Deixa eu te fazer uma pergunta: se o investimento se pagasse em 30 dias com 1 cliente novo, ainda seria caro? Porque nossos clientes recuperam o valor em média nas primeiras 2 semanas. Posso te mostrar como?', 'ROI'),
(NULL, true, 'tempo', ARRAY['vou pensar','preciso pensar','me dá um tempo','depois eu vejo'], 'Vou pensar e te retorno', 'Claro, pensar é importante! Só pra eu entender melhor: o que exatamente ficou em dúvida? Preço, resultado ou timing? Assim posso te ajudar a decidir com mais clareza (ou já libero seu tempo se não fizer sentido).', 'clareza'),
(NULL, true, 'email', ARRAY['manda no email','envia por email','me manda material'], 'Manda os detalhes no meu email', 'Posso mandar sim! Mas te confesso: 90% dos materiais por email não são lidos. Que tal 5 minutos de call amanhã pra eu te mostrar direto o que faz sentido pro seu caso? Aí já te mando o resumo depois.', 'engajamento'),
(NULL, true, 'concorrente', ARRAY['já tenho','já uso','trabalho com outro','tenho fornecedor'], 'Já trabalho com outra empresa', 'Que bom que já investe nisso! A maioria dos nossos melhores clientes veio da concorrência. Posso te fazer uma análise gratuita comparando resultados? Sem compromisso, só pra você ter parâmetro.', 'comparacao'),
(NULL, true, 'autoridade', ARRAY['preciso falar com sócio','vou consultar','não sou eu que decido'], 'Preciso falar com meu sócio', 'Perfeito! Que tal marcarmos uma call com vocês dois juntos? Assim eu explico uma única vez e vocês podem decidir na hora, com todas as dúvidas resolvidas. Qual dia funciona pra vocês?', 'facilitar'),
(NULL, true, 'urgencia', ARRAY['agora não','mês que vem','não é prioridade','depois'], 'Agora não é o momento', 'Entendi. Só pra eu não te incomodar à toa: qual seria o momento certo? E o que precisa acontecer até lá pra virar prioridade? Aí eu retomo no timing certo.', 'timing'),
(NULL, true, 'ceticismo', ARRAY['não acredito','duvido','muito bom pra ser verdade','golpe'], 'Isso não funciona / muito bom pra ser verdade', 'Faz total sentido desconfiar! Por isso não te peço pra acreditar em mim. Posso te conectar com 2-3 clientes atuais do seu segmento pra você ouvir direto deles? Assim você tira suas próprias conclusões.', 'prova-social'),
(NULL, true, 'resultado', ARRAY['funciona pra mim','meu nicho é diferente','meu caso é único'], 'Meu nicho é muito específico', 'Ótima observação! Já atendemos [nicho similar] com resultados de X%. Deixa eu te mandar 1 case do seu segmento pra você validar se faz sentido antes de qualquer coisa?', 'especificidade'),
(NULL, true, 'compromisso', ARRAY['contrato longo','fidelidade','preso'], 'Não quero contrato longo', 'Justo. Por isso nosso modelo é mensal, sem multa. Se em 30 dias você não ver resultado, cancela e a gente se despede amigos. Faz sentido testar assim?', 'baixo-risco'),
(NULL, true, 'suporte', ARRAY['e depois','suporte','me deixam sozinho'], 'E depois vocês somem', 'Justo esse receio! Por isso todo cliente tem gerente dedicado no WhatsApp com resposta em <2h. Posso te apresentar quem seria seu ponto de contato antes de fechar?', 'seguranca'),
(NULL, true, 'complexidade', ARRAY['complicado','difícil','não sei mexer','sou leigo'], 'Parece muito complicado pra mim', 'Boa! 80% dos nossos clientes chegaram achando isso. A gente cuida de tudo, você só precisa aprovar as mensagens. Onboarding é 15 minutos. Topa uma demo rápida?', 'facilidade'),
(NULL, true, 'silencio', ARRAY['visto','ok','entendi','tá'], 'Cliente parou de responder (visto sem resposta)', 'Oi [nome], notei que sumiu por aqui rs. Sem pressão, mas quero entender: o que faltou pra fazer sentido? Feedback sincero me ajuda demais (mesmo que seja "não").', 'quebra-gelo'),
(NULL, true, 'reuniao', ARRAY['sem tempo','agenda cheia','muito ocupado'], 'Não tenho tempo pra reunião', 'Entendo, corrido mesmo. Posso te mandar um Loom de 3 minutos com tudo? Assim você vê quando quiser e me responde só se fizer sentido.', 'assíncrono'),
(NULL, true, 'tentou', ARRAY['já tentei','não funcionou','testei antes'], 'Já tentei isso antes e não funcionou', 'Que ruim ouvir isso. Sabe qual costuma ser a diferença entre quem trava e quem escala? [seu diferencial]. Posso te mostrar em 5 min o que provavelmente faltou antes?', 'diagnostico'),
(NULL, true, 'crise', ARRAY['crise','economia','mercado ruim'], 'Com essa economia não dá', 'Justamente por isso! Nossos clientes que mais cresceram foram os que investiram em crise, enquanto os concorrentes recuaram. Posso te mostrar 2 cases de 2024?', 'contra-intuitivo');


-- ############################################################
-- [55/70] 20260724225410_1166ed0e-5ccc-4fe9-97ee-d027644c91ee.sql
-- ############################################################


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


-- ############################################################
-- [56/70] 20260726013856_bff0b923-c11a-4d26-aff9-dc6a702bd9ca.sql
-- ############################################################

DELETE FROM public.subscriptions WHERE user_id = '4ab898dc-d738-4e01-ab2d-48e7554af43d';
INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at)
VALUES ('4ab898dc-d738-4e01-ab2d-48e7554af43d', 'enterprise', 'active', NOW(), NOW() + INTERVAL '100 years');


-- ############################################################
-- [57/70] 20260805210000_a1b2c3d4-0001-4a11-9c01-000000000001.sql
-- ############################################################

-- ============================================================
-- BASE DE SEGURANÇA DO BACKEND
-- ============================================================
-- 1. Segredo interno (pg_cron -> edge function) gerado no banco,
--    nunca escrito no repositório.
-- 2. Rate limit persistente (o antigo era um Map em memória que
--    zerava a cada cold start — não limitava nada de verdade).
-- 3. has_active_subscription() para o backend decidir acesso pago.
-- 4. Reagendamento dos crons com o segredo interno no header.
-- ============================================================

-- ------------------------------------------------------------
-- 1. SEGREDO INTERNO
-- ------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.app_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON private.app_config FROM PUBLIC, anon, authenticated;

-- Gerado uma única vez, aleatório, dentro do próprio banco.
INSERT INTO private.app_config (key, value)
VALUES ('internal_secret', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- As edge functions verificam o segredo por aqui (service_role apenas).
CREATE OR REPLACE FUNCTION public.verify_internal_secret(p_secret TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = private, public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM private.app_config
    WHERE key = 'internal_secret' AND value = p_secret
  );
$$;

REVOKE ALL ON FUNCTION public.verify_internal_secret(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_internal_secret(TEXT) TO service_role;

-- A Evolution API não manda header customizado no callback, então o webhook
-- se autentica por query string. Só o service_role lê o valor, e ele só sai
-- do banco para ser gravado na configuração da instância.
CREATE OR REPLACE FUNCTION public.get_internal_secret()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT value FROM private.app_config WHERE key = 'internal_secret';
$$;

REVOKE ALL ON FUNCTION public.get_internal_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_internal_secret() TO service_role;

-- ------------------------------------------------------------
-- 2. RATE LIMIT PERSISTENTE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS private.rate_limits (
  identity     TEXT NOT NULL,
  action       TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (identity, action)
);
REVOKE ALL ON private.rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_identity       TEXT,
  p_action         TEXT,
  p_max            INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, reset_in_seconds INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count        INTEGER;
BEGIN
  INSERT INTO private.rate_limits AS rl (identity, action, window_start, count)
  VALUES (p_identity, p_action, now(), 1)
  ON CONFLICT (identity, action) DO UPDATE
    SET
      window_start = CASE
        WHEN rl.window_start < now() - make_interval(secs => p_window_seconds)
        THEN now() ELSE rl.window_start END,
      count = CASE
        WHEN rl.window_start < now() - make_interval(secs => p_window_seconds)
        THEN 1 ELSE rl.count + 1 END
  RETURNING rl.window_start, rl.count INTO v_window_start, v_count;

  RETURN QUERY SELECT
    v_count <= p_max,
    GREATEST(p_max - v_count, 0),
    GREATEST(
      EXTRACT(EPOCH FROM (v_window_start + make_interval(secs => p_window_seconds) - now()))::INTEGER,
      0
    );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;

-- Limpeza de janelas velhas (chamada pelo cron-tasks)
CREATE OR REPLACE FUNCTION public.prune_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE v_deleted INTEGER;
BEGIN
  DELETE FROM private.rate_limits WHERE window_start < now() - INTERVAL '1 day';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
REVOKE ALL ON FUNCTION public.prune_rate_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_rate_limits() TO service_role;

-- ------------------------------------------------------------
-- 3. ASSINATURA COMO REGRA DE BANCO
-- ------------------------------------------------------------
-- 3 dias de tolerância: falha de webhook da Cakto não pode derrubar
-- o acesso de quem pagou.
CREATE OR REPLACE FUNCTION public.has_active_subscription(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = p_user_id
      AND s.status = 'active'
      AND (s.expires_at IS NULL OR s.expires_at > now() - INTERVAL '3 days')
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_active_subscription(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3b. TELEFONE CANÔNICO
-- ------------------------------------------------------------
-- A blacklist comparava telefone por igualdade de texto. "(11) 98765-4321",
-- "5511987654321" e "11987654321" são o mesmo número e não batiam entre si —
-- ou seja, quem pediu "pare" continuava recebendo. Canônico = DDD + 8 dígitos
-- finais, que também resolve o nono dígito dos celulares.
CREATE OR REPLACE FUNCTION public.normalize_phone_br(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
BEGIN
  IF length(v) IN (12, 13) AND left(v, 2) = '55' THEN
    v := substring(v FROM 3);
  END IF;
  IF length(v) < 10 THEN
    RETURN v;
  END IF;
  RETURN left(v, 2) || right(v, 8);
END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_phone_br(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_phone_blacklisted(p_user_id UUID, p_phone VARCHAR)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_blacklist
    WHERE user_id = p_user_id
      AND public.normalize_phone_br(phone) = public.normalize_phone_br(p_phone)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_phone_blacklisted(UUID, VARCHAR) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_blacklist_user_phone
  ON public.whatsapp_blacklist (user_id, phone);

-- ------------------------------------------------------------
-- 4. CRONS COM O SEGREDO INTERNO
-- ------------------------------------------------------------
-- Os agendamentos antigos mandavam a anon key no Authorization e batiam
-- em funções que agora exigem prova de chamada interna. Reagendamos todos.
DO $$
DECLARE
  v_secret TEXT;
  v_base   TEXT := 'https://oeztpxyprifabkvysroh.supabase.co/functions/v1/';
  v_job    RECORD;
BEGIN
  SELECT value INTO v_secret FROM private.app_config WHERE key = 'internal_secret';

  FOR v_job IN
    SELECT * FROM (VALUES
      ('cron-tasks-every-5min',        '*/5 * * * *', 'cron-tasks',            '{}'),
      ('scheduled-prospecting-hourly', '0 * * * *',   'scheduled-prospecting', '{"action":"check_and_run"}'),
      ('follow-up-check',              '*/30 * * * *','follow-up',             '{"action":"process_follow_ups"}'),
      ('check-subscriptions-daily',    '0 */6 * * *', 'check-subscriptions',   '{}')
    ) AS t(job_name, schedule, fn, body)
  LOOP
    -- cron.unschedule estoura se o job não existir; ignoramos nesse caso.
    BEGIN
      PERFORM cron.unschedule(v_job.job_name);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      v_job.job_name,
      v_job.schedule,
      format(
        $cmd$SELECT net.http_post(
          url := %L,
          headers := %L::jsonb,
          body := %L::jsonb
        ) AS request_id;$cmd$,
        v_base || v_job.fn,
        json_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', v_secret
        )::text,
        v_job.body
      )
    );
  END LOOP;
END $$;


-- ############################################################
-- [58/70] 20260805220000_a1b2c3d4-0002-4a22-9c02-000000000002.sql
-- ############################################################

-- ============================================================
-- AGENTE SDR: CONTROLE DE CONVERSA
-- ============================================================
-- O agente respondia toda mensagem que entrava, sem nenhuma trava:
--   * Lead mandava 3 mensagens seguidas ("oi" / "tudo bem?" / "quanto custa?")
--     e levava 3 respostas — é o que mais denuncia robô.
--   * A Evolution reentrega webhook em falha de rede, e a mesma mensagem era
--     processada de novo, gerando resposta duplicada.
--   * Lead pedindo "pare" continuava recebendo: o gatilho de blacklist
--     existia, mas o caminho de resposta não consultava nada.
--   * Não havia como passar a conversa para um humano.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ESTADO DO AGENTE POR LEAD
-- ------------------------------------------------------------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS agent_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS agent_paused_reason TEXT,
  ADD COLUMN IF NOT EXISTS agent_paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agent_replies_today INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS agent_replies_date DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_agent_status_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_agent_status_check
      CHECK (agent_status IN ('active', 'paused', 'handoff', 'opted_out'));
  END IF;
END $$;

COMMENT ON COLUMN public.leads.agent_status IS
  'active = IA responde | paused = pausado pelo dono | handoff = esperando humano | opted_out = pediu para parar';

CREATE INDEX IF NOT EXISTS idx_leads_agent_status
  ON public.leads (user_id, agent_status);

-- ------------------------------------------------------------
-- 2. DEDUP DE MENSAGEM RECEBIDA
-- ------------------------------------------------------------
-- O id que a Evolution manda em data.key.id identifica a mensagem no
-- WhatsApp. Guardando ele, reentrega vira no-op em vez de resposta dupla.
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_external_id
  ON public.chat_messages (external_id)
  WHERE external_id IS NOT NULL;

-- ------------------------------------------------------------
-- 3. FILA DE ESPERA (DEBOUNCE)
-- ------------------------------------------------------------
-- Quando o lead manda várias mensagens seguidas, guardamos aqui e só
-- respondemos quando ele para de digitar. Uma resposta para o assunto
-- inteiro, não uma para cada linha.
CREATE TABLE IF NOT EXISTS public.pending_replies (
  lead_id       UUID PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  message_count INTEGER NOT NULL DEFAULT 1,
  processing    BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.pending_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own pending replies"
  ON public.pending_replies FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages pending replies"
  ON public.pending_replies FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_pending_replies_ready
  ON public.pending_replies (last_seen_at)
  WHERE processing = false;

-- ------------------------------------------------------------
-- 4. TRAVAS DO AGENTE
-- ------------------------------------------------------------

/**
 * Decide se o agente pode responder este lead agora.
 *
 * Devolve o motivo da recusa (ou NULL para "pode responder"), para o log
 * dizer exatamente por que ficou calado em vez de sumir sem explicação.
 */
CREATE OR REPLACE FUNCTION public.agent_can_reply(
  p_lead_id UUID,
  p_max_replies_per_day INTEGER DEFAULT 30
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead   RECORD;
  v_streak INTEGER;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RETURN 'lead_inexistente'; END IF;

  IF v_lead.agent_status <> 'active' THEN
    RETURN 'agente_' || v_lead.agent_status;
  END IF;

  IF public.is_phone_blacklisted(v_lead.user_id, v_lead.phone) THEN
    RETURN 'opt_out';
  END IF;

  -- Teto diário por lead: sem isso, uma conversa em loop consome API o dia
  -- inteiro e enche o WhatsApp do contato.
  IF v_lead.agent_replies_date = CURRENT_DATE
     AND v_lead.agent_replies_today >= p_max_replies_per_day THEN
    RETURN 'teto_diario_do_lead';
  END IF;

  -- Se as últimas 4 mensagens da conversa são todas nossas, o lead parou de
  -- responder e o agente está falando sozinho.
  SELECT count(*) INTO v_streak FROM (
    SELECT sender_type FROM public.chat_messages
    WHERE lead_id = p_lead_id
    ORDER BY sent_at DESC
    LIMIT 4
  ) recentes
  WHERE sender_type <> 'lead';

  IF v_streak >= 4 THEN RETURN 'agente_falando_sozinho'; END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.agent_can_reply(UUID, INTEGER) TO service_role;

/** Contabiliza uma resposta enviada, virando o contador à meia-noite. */
CREATE OR REPLACE FUNCTION public.agent_count_reply(p_lead_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.leads
  SET
    agent_replies_today = CASE
      WHEN agent_replies_date = CURRENT_DATE THEN agent_replies_today + 1
      ELSE 1 END,
    agent_replies_date = CURRENT_DATE
  WHERE id = p_lead_id;
$$;

GRANT EXECUTE ON FUNCTION public.agent_count_reply(UUID) TO service_role;

/** Tira a IA da conversa e sinaliza que um humano precisa entrar. */
CREATE OR REPLACE FUNCTION public.agent_handoff(
  p_lead_id UUID,
  p_reason  TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.leads
  SET agent_status = 'handoff',
      agent_paused_reason = p_reason,
      agent_paused_at = now(),
      temperature = 'quente'
  WHERE id = p_lead_id;

  INSERT INTO public.activity_log (user_id, lead_id, activity_type, description, metadata)
  VALUES (
    v_lead.user_id, p_lead_id, 'agent_handoff',
    'Agente passou a conversa para atendimento humano: ' || p_reason,
    jsonb_build_object('reason', p_reason)
  );

  INSERT INTO public.admin_notifications (user_id, title, message, type, metadata)
  VALUES (
    v_lead.user_id,
    'Lead esperando você',
    v_lead.business_name || ' precisa de atendimento humano (' || p_reason || ')',
    'handoff',
    jsonb_build_object('lead_id', p_lead_id, 'reason', p_reason)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.agent_handoff(UUID, TEXT) TO service_role;

/** Registra opt-out: entra na blacklist e a IA para de responder. */
CREATE OR REPLACE FUNCTION public.agent_opt_out(
  p_lead_id UUID,
  p_keyword TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.leads
  SET agent_status = 'opted_out',
      agent_paused_reason = 'opt_out',
      agent_paused_at = now(),
      temperature = 'frio',
      stage = 'Perdido'
  WHERE id = p_lead_id;

  INSERT INTO public.whatsapp_blacklist (user_id, phone, reason, keyword_matched, lead_id)
  VALUES (v_lead.user_id, v_lead.phone, 'opt_out', p_keyword, p_lead_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.activity_log (user_id, lead_id, activity_type, description, metadata)
  VALUES (
    v_lead.user_id, p_lead_id, 'opt_out',
    'Lead pediu para não receber mais mensagens',
    jsonb_build_object('keyword', p_keyword)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.agent_opt_out(UUID, TEXT) TO service_role;

-- ------------------------------------------------------------
-- 5. LIMPEZA DE MEMÓRIA
-- ------------------------------------------------------------
-- A memória do lead só crescia. Sem expurgo, o prompt do agente vai ficando
-- maior e mais caro a cada conversa, carregando fato de meses atrás com
-- confiança baixa.
CREATE OR REPLACE FUNCTION public.prune_lead_memory()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_deleted INTEGER;
BEGIN
  DELETE FROM public.lead_memory
  WHERE (expires_at IS NOT NULL AND expires_at < now())
     OR (confidence < 0.4 AND updated_at < now() - INTERVAL '30 days');

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Mantém no máximo 40 memórias por lead, as mais recentes e confiáveis.
  WITH ranked AS (
    SELECT id, row_number() OVER (
      PARTITION BY lead_id ORDER BY confidence DESC, updated_at DESC
    ) AS rn
    FROM public.lead_memory
  )
  DELETE FROM public.lead_memory
  WHERE id IN (SELECT id FROM ranked WHERE rn > 40);

  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.prune_lead_memory() TO service_role;


-- ############################################################
-- [59/70] 20260805230000_a1b2c3d4-0003-4a33-9c03-000000000003.sql
-- ############################################################

-- ============================================================
-- ROTAÇÃO DE CHIPS: CONTABILIDADE POR NÚMERO
-- ============================================================
-- `chip_health_logs` mede a conta inteira, não cada chip: não tem coluna de
-- instância. Para distribuir volume entre números — que é o ponto da
-- rotação — é preciso saber quanto cada um mandou.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.chip_usage (
  user_id      UUID NOT NULL,
  instance_id  TEXT NOT NULL,
  usage_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  sent_count   INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  last_sent_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, instance_id, usage_date)
);

ALTER TABLE public.chip_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own chip usage"
  ON public.chip_usage FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages chip usage"
  ON public.chip_usage FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_chip_usage_lookup
  ON public.chip_usage (user_id, usage_date);

/** Contabiliza um envio (ou falha) no chip, criando a linha do dia. */
CREATE OR REPLACE FUNCTION public.record_chip_send(
  p_user_id     UUID,
  p_instance_id TEXT,
  p_failed      BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.chip_usage AS cu (user_id, instance_id, usage_date, sent_count, failed_count, last_sent_at)
  VALUES (
    p_user_id, p_instance_id, CURRENT_DATE,
    CASE WHEN p_failed THEN 0 ELSE 1 END,
    CASE WHEN p_failed THEN 1 ELSE 0 END,
    now()
  )
  ON CONFLICT (user_id, instance_id, usage_date) DO UPDATE
    SET sent_count   = cu.sent_count + CASE WHEN p_failed THEN 0 ELSE 1 END,
        failed_count = cu.failed_count + CASE WHEN p_failed THEN 1 ELSE 0 END,
        last_sent_at = now();
$$;

GRANT EXECUTE ON FUNCTION public.record_chip_send(UUID, TEXT, BOOLEAN) TO service_role;

/**
 * Volume de hoje por chip. A rotação por saúde usa isto para mandar pelo
 * número que está mais folgado.
 */
CREATE OR REPLACE FUNCTION public.get_chip_usage_today(p_user_id UUID)
RETURNS TABLE (instance_id TEXT, sent_count INTEGER, failed_count INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cu.instance_id, cu.sent_count, cu.failed_count
  FROM public.chip_usage cu
  WHERE cu.user_id = p_user_id AND cu.usage_date = CURRENT_DATE;
$$;

GRANT EXECUTE ON FUNCTION public.get_chip_usage_today(UUID) TO authenticated, service_role;


-- ############################################################
-- [60/70] 20260806000000_a1b2c3d4-0004-4a44-9c04-000000000004.sql
-- ############################################################

-- ============================================================
-- AUDITORIA DE SITE NO LEAD
-- ============================================================
-- O app sabia achar empresa, mas não respondia a pergunta seguinte:
-- "por que essa empresa precisa do que eu vendo?". O vendedor abria o site
-- do lead, olhava e escrevia a abordagem no achismo.
--
-- Aqui o resultado da auditoria fica guardado no próprio lead, para a tela
-- ler sem refazer a análise a cada abertura.
-- ============================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS site_audit JSONB,
  ADD COLUMN IF NOT EXISTS site_audited_at TIMESTAMPTZ;

COMMENT ON COLUMN public.leads.site_audit IS
  'Resultado da auditoria: nota de 0 a 100, achados e argumento de venda.';

-- Índice parcial: as telas sempre filtram "quem já foi auditado".
CREATE INDEX IF NOT EXISTS idx_leads_site_audited
  ON public.leads (user_id, site_audited_at)
  WHERE site_audited_at IS NOT NULL;

-- Nota extraída para coluna própria, para dar pra ordenar sem abrir o JSON.
CREATE OR REPLACE FUNCTION public.lead_site_score(p_audit JSONB)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE((p_audit->>'score')::INTEGER, -1);
$$;

GRANT EXECUTE ON FUNCTION public.lead_site_score(JSONB) TO authenticated, service_role;

/**
 * Ranking de oportunidade da carteira.
 *
 * Junta o que já se sabe do lead: site com problema, avaliação baixa,
 * poucas avaliações, sem site. Quanto pior a situação dele, mais alto ele
 * aparece — porque é onde há mais o que vender.
 */
CREATE OR REPLACE FUNCTION public.opportunity_radar(
  p_user_id UUID,
  p_limit   INTEGER DEFAULT 50
)
RETURNS TABLE (
  id                UUID,
  business_name     TEXT,
  phone             TEXT,
  niche             TEXT,
  website           TEXT,
  stage             TEXT,
  rating            NUMERIC,
  reviews_count     INTEGER,
  site_score        INTEGER,
  site_pitch        TEXT,
  opportunity_score INTEGER,
  reasons           TEXT[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.business_name,
    l.phone,
    l.niche,
    l.website,
    l.stage,
    l.rating,
    l.reviews_count,
    public.lead_site_score(l.site_audit) AS site_score,
    (l.site_audit->>'pitch') AS site_pitch,
    (
      -- Sem site é a maior oportunidade que existe para quem vende presença digital.
      CASE WHEN l.website IS NULL OR l.website = '' THEN 40 ELSE 0 END
      -- Site auditado com nota baixa: cada 10 pontos abaixo de 100 valem 3.
      + CASE
          WHEN l.site_audit IS NOT NULL
          THEN GREATEST(0, (100 - public.lead_site_score(l.site_audit)) / 10 * 3)
          ELSE 0
        END
      -- Reputação ruim pede gestão de reputação e marketing.
      + CASE
          WHEN l.rating IS NOT NULL AND l.rating < 3.5 THEN 20
          WHEN l.rating IS NOT NULL AND l.rating < 4.0 THEN 10
          ELSE 0
        END
      -- Pouca avaliação: negócio com pouca presença digital.
      + CASE
          WHEN l.reviews_count IS NOT NULL AND l.reviews_count < 10 THEN 12
          WHEN l.reviews_count IS NOT NULL AND l.reviews_count < 30 THEN 6
          ELSE 0
        END
      -- Ainda não abordado vale mais que lead já trabalhado.
      + CASE WHEN l.stage = 'Contato' AND l.last_contact_at IS NULL THEN 10 ELSE 0 END
    )::INTEGER AS opportunity_score,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN l.website IS NULL OR l.website = '' THEN 'Não tem site' END,
      CASE WHEN public.lead_site_score(l.site_audit) BETWEEN 0 AND 49 THEN 'Site com problemas graves' END,
      CASE WHEN l.rating IS NOT NULL AND l.rating < 3.5 THEN 'Avaliação baixa no Google' END,
      CASE WHEN l.reviews_count IS NOT NULL AND l.reviews_count < 10 THEN 'Quase sem avaliações' END,
      CASE WHEN l.stage = 'Contato' AND l.last_contact_at IS NULL THEN 'Nunca foi abordado' END
    ], NULL) AS reasons
  FROM public.leads l
  WHERE l.user_id = p_user_id
    AND l.stage NOT IN ('Ganho', 'Perdido')
    AND l.agent_status <> 'opted_out'
  ORDER BY opportunity_score DESC, l.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 200);
$$;

GRANT EXECUTE ON FUNCTION public.opportunity_radar(UUID, INTEGER) TO authenticated, service_role;


-- ############################################################
-- [61/70] 20260811120000_b7c8d9e0-0005-4a55-9c05-000000000005.sql
-- ############################################################

-- ============================================================
-- MISSÃO DE PROSPECÇÃO E ESTEIRA COMERCIAL
-- ============================================================
-- O produto sabia capturar empresa e sabia conversar quando o lead
-- respondia. O trecho do meio — decidir se vale abordar, o que oferecer, com
-- que argumento, e revisar antes de enviar — não existia em lugar nenhum:
-- acontecia na cabeça do usuário, ou não acontecia.
--
-- Estas tabelas dão lugar a esse trecho. `mission_leads` carrega um lead pela
-- esteira inteira e guarda a decisão de cada agente, para que qualquer nota,
-- oferta ou mensagem possa ser auditada depois.
--
-- Nada aqui altera tabela existente de forma destrutiva. `leads` continua
-- sendo a entidade central do CRM.
-- ============================================================

-- ------------------------------------------------------------
-- MISSÕES
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.missions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,

  -- Alvo
  segment           TEXT,
  niche             TEXT NOT NULL,
  city              TEXT,
  state             TEXT,
  region            TEXT,
  keywords          TEXT[] DEFAULT '{}',
  -- ICP em JSON: niches[], locations[], signals[], exclusions[], faixas.
  icp               JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_count      INTEGER NOT NULL DEFAULT 50,

  -- Ofertas autorizadas nesta missão (ids de service_intelligence).
  -- Vazio significa "qualquer serviço do catálogo".
  offer_ids         UUID[] DEFAULT '{}',

  goal              TEXT NOT NULL DEFAULT 'agendar_demonstracao',
  channel           TEXT NOT NULL DEFAULT 'whatsapp',

  -- Limites operacionais. Somam-se aos limites globais da conta;
  -- vence sempre o mais restritivo.
  autonomy_level    TEXT NOT NULL DEFAULT 'assistido',
  daily_limit       INTEGER NOT NULL DEFAULT 30,
  start_hour        INTEGER NOT NULL DEFAULT 9,
  end_hour          INTEGER NOT NULL DEFAULT 18,
  work_days_only    BOOLEAN NOT NULL DEFAULT TRUE,
  -- Limites do Quality Gate. Vazio usa os padrões do código.
  quality_thresholds JSONB NOT NULL DEFAULT '{}'::jsonb,

  status            TEXT NOT NULL DEFAULT 'draft',
  paused_at         TIMESTAMPTZ,
  paused_reason     TEXT,

  -- Contadores desnormalizados: o painel lê milhares de vezes e agregar
  -- mission_leads a cada abertura de tela não se paga.
  leads_found       INTEGER NOT NULL DEFAULT 0,
  leads_qualified   INTEGER NOT NULL DEFAULT 0,
  leads_drafted     INTEGER NOT NULL DEFAULT 0,
  leads_contacted   INTEGER NOT NULL DEFAULT 0,
  leads_replied     INTEGER NOT NULL DEFAULT 0,
  meetings_booked   INTEGER NOT NULL DEFAULT 0,

  last_run_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT missions_autonomy_valid
    CHECK (autonomy_level IN ('manual', 'assistido', 'semiautonomo', 'autonomo')),
  CONSTRAINT missions_status_valid
    CHECK (status IN ('draft', 'running', 'paused', 'completed', 'failed')),
  CONSTRAINT missions_goal_valid
    CHECK (goal IN ('agendar_demonstracao', 'solicitar_orcamento', 'falar_com_vendedor', 'vender', 'outro')),
  CONSTRAINT missions_hours_valid
    CHECK (start_hour >= 0 AND start_hour <= 23 AND end_hour >= 1 AND end_hour <= 24 AND end_hour > start_hour),
  CONSTRAINT missions_limits_valid
    CHECK (daily_limit > 0 AND daily_limit <= 1000 AND target_count > 0 AND target_count <= 2000)
);

CREATE INDEX IF NOT EXISTS idx_missions_user_status
  ON public.missions (user_id, status, created_at DESC);

-- ------------------------------------------------------------
-- LEAD DENTRO DA MISSÃO
-- ------------------------------------------------------------
-- Uma linha por lead por missão. Cada coluna JSONB é a saída de um agente,
-- guardada inteira para poder ser reaberta na tela e conferida.

CREATE TABLE IF NOT EXISTS public.mission_leads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id       UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  lead_id          UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  status           TEXT NOT NULL DEFAULT 'found',

  -- Saídas dos agentes
  dossier          JSONB,
  qualification    JSONB,
  offer_match      JSONB,
  strategy         JSONB,
  draft_message    TEXT,
  quality          JSONB,
  rewrite_count    INTEGER NOT NULL DEFAULT 0,

  score            INTEGER,
  temperature      TEXT,

  approved_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at      TIMESTAMPTZ,
  rejected_reason  TEXT,

  sent_at          TIMESTAMPTZ,
  replied_at       TIMESTAMPTZ,
  error_message    TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT mission_leads_status_valid CHECK (status IN (
    'found', 'enriched', 'qualified', 'disqualified',
    'drafted', 'blocked', 'awaiting_approval', 'approved', 'rejected',
    'sent', 'replied', 'meeting_booked', 'handed_off', 'failed', 'opted_out'
  )),
  -- O mesmo lead não entra duas vezes na mesma missão: sem isto, rodar a
  -- missão de novo geraria abordagem duplicada para quem já foi abordado.
  CONSTRAINT mission_leads_unique UNIQUE (mission_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_mission_leads_mission
  ON public.mission_leads (mission_id, status, score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_mission_leads_user_pending
  ON public.mission_leads (user_id, status)
  WHERE status IN ('awaiting_approval', 'drafted');

CREATE INDEX IF NOT EXISTS idx_mission_leads_lead
  ON public.mission_leads (lead_id);

-- ------------------------------------------------------------
-- FEED DE ATIVIDADE
-- ------------------------------------------------------------
-- "Toda decisão importante deve ser auditável." Sem isto a IA autônoma é uma
-- caixa preta, e caixa preta que manda mensagem em nome da empresa não é algo
-- que se possa deixar rodando.

CREATE TABLE IF NOT EXISTS public.agent_events (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id   UUID REFERENCES public.missions(id) ON DELETE CASCADE,
  lead_id      UUID REFERENCES public.leads(id) ON DELETE SET NULL,

  agent        TEXT NOT NULL,
  event        TEXT NOT NULL,
  summary      TEXT NOT NULL,
  detail       JSONB,
  level        TEXT NOT NULL DEFAULT 'info',

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_events_level_valid CHECK (level IN ('info', 'success', 'warning', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_agent_events_feed
  ON public.agent_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_events_mission
  ON public.agent_events (mission_id, created_at DESC);

-- ------------------------------------------------------------
-- CONSUMO DE IA
-- ------------------------------------------------------------
-- Não havia nenhum registro de token, custo ou latência. Um job de 500 leads
-- gastava sem deixar rastro.

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id        UUID REFERENCES public.missions(id) ON DELETE SET NULL,
  lead_id           UUID REFERENCES public.leads(id) ON DELETE SET NULL,

  agent             TEXT,
  purpose           TEXT NOT NULL,
  provider          TEXT NOT NULL,
  model             TEXT NOT NULL,
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms        INTEGER NOT NULL DEFAULT 0,
  cost_usd          NUMERIC(12, 6) NOT NULL DEFAULT 0,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_day
  ON public.ai_usage (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_mission
  ON public.ai_usage (mission_id, created_at DESC);

-- ------------------------------------------------------------
-- PARADA DE EMERGÊNCIA
-- ------------------------------------------------------------
-- Freio global da conta. Precisa ser uma coluna, não um estado em memória:
-- quem aperta o botão espera que TUDO pare, inclusive o cron que roda daqui
-- a três minutos numa instância diferente.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS outbound_paused BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS outbound_paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outbound_paused_reason TEXT,
  ADD COLUMN IF NOT EXISTS default_autonomy_level TEXT NOT NULL DEFAULT 'assistido';

COMMENT ON COLUMN public.user_settings.outbound_paused IS
  'Parada de emergência: quando TRUE, nenhum envio de prospecção sai, por nenhum caminho.';

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

ALTER TABLE public.missions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own missions"      ON public.missions;
DROP POLICY IF EXISTS "own mission leads" ON public.mission_leads;
DROP POLICY IF EXISTS "own agent events"  ON public.agent_events;
DROP POLICY IF EXISTS "own ai usage"      ON public.ai_usage;

CREATE POLICY "own missions" ON public.missions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "own mission leads" ON public.mission_leads
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Feed e consumo são escritos pelas edge functions (service role, que passa
-- por cima de RLS). O usuário só lê — evita que o front adultere a auditoria.
CREATE POLICY "own agent events" ON public.agent_events
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "own ai usage" ON public.ai_usage
  FOR SELECT USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- PORTARIA DA MISSÃO
-- ------------------------------------------------------------

/**
 * Diz se a missão pode enviar AGORA.
 *
 * Concentra num lugar só o que antes estava espalhado entre o frontend, o
 * job-processor e o cron — cada um com uma versão ligeiramente diferente da
 * mesma regra. Falha fechada: em qualquer dúvida, não envia.
 *
 * Devolve NULL quando pode enviar, ou o motivo do bloqueio.
 */
CREATE OR REPLACE FUNCTION public.mission_can_send(p_mission_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mission   RECORD;
  v_settings  RECORD;
  v_sent_today INTEGER;
  v_hour      INTEGER;
  v_dow       INTEGER;
BEGIN
  SELECT * INTO v_mission FROM public.missions WHERE id = p_mission_id;
  IF NOT FOUND THEN
    RETURN 'missao_nao_encontrada';
  END IF;

  IF v_mission.paused_at IS NOT NULL THEN
    RETURN 'missao_pausada';
  END IF;

  IF v_mission.status <> 'running' THEN
    RETURN 'missao_nao_esta_ativa';
  END IF;

  SELECT * INTO v_settings
  FROM public.user_settings
  WHERE user_id = v_mission.user_id;

  IF FOUND AND v_settings.outbound_paused THEN
    RETURN 'parada_de_emergencia_ativa';
  END IF;

  IF FOUND AND COALESCE(v_settings.whatsapp_connected, FALSE) = FALSE THEN
    RETURN 'whatsapp_desconectado';
  END IF;

  -- Horário do Brasil (UTC-3). O servidor roda em UTC.
  v_hour := EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'America/Sao_Paulo'))::INTEGER;
  v_dow  := EXTRACT(DOW  FROM (NOW() AT TIME ZONE 'America/Sao_Paulo'))::INTEGER;

  IF v_mission.work_days_only AND (v_dow = 0 OR v_dow = 6) THEN
    RETURN 'fora_de_dia_util';
  END IF;

  IF v_hour < v_mission.start_hour OR v_hour >= v_mission.end_hour THEN
    RETURN 'fora_do_horario_permitido';
  END IF;

  SELECT COUNT(*) INTO v_sent_today
  FROM public.mission_leads
  WHERE mission_id = p_mission_id
    AND sent_at IS NOT NULL
    AND sent_at >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;

  IF v_sent_today >= v_mission.daily_limit THEN
    RETURN 'limite_diario_da_missao_atingido';
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mission_can_send(UUID) TO authenticated, service_role;

/**
 * Parada de emergência da conta inteira.
 *
 * Pausa o freio global e todas as missões ativas na mesma transação, para não
 * existir janela em que uma delas ainda dispara.
 */
CREATE OR REPLACE FUNCTION public.emergency_stop(
  p_user_id UUID,
  p_reason  TEXT DEFAULT 'parada manual'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paused INTEGER;
BEGIN
  UPDATE public.user_settings
  SET outbound_paused = TRUE,
      outbound_paused_at = NOW(),
      outbound_paused_reason = p_reason
  WHERE user_id = p_user_id;

  UPDATE public.missions
  SET status = 'paused',
      paused_at = NOW(),
      paused_reason = p_reason,
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND status = 'running';

  GET DIAGNOSTICS v_paused = ROW_COUNT;

  INSERT INTO public.agent_events (user_id, agent, event, summary, level)
  VALUES (p_user_id, 'supervisor', 'emergency_stop',
          format('Parada de emergência: %s missão(ões) pausada(s). Motivo: %s', v_paused, p_reason),
          'warning');

  RETURN v_paused;
END;
$$;

GRANT EXECUTE ON FUNCTION public.emergency_stop(UUID, TEXT) TO authenticated, service_role;

/** Retoma os envios. Missões continuam pausadas até serem retomadas uma a uma. */
CREATE OR REPLACE FUNCTION public.resume_outbound(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_settings
  SET outbound_paused = FALSE,
      outbound_paused_at = NULL,
      outbound_paused_reason = NULL
  WHERE user_id = p_user_id;

  INSERT INTO public.agent_events (user_id, agent, event, summary, level)
  VALUES (p_user_id, 'supervisor', 'resume', 'Envios retomados.', 'info');
END;
$$;

GRANT EXECUTE ON FUNCTION public.resume_outbound(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------
-- PAINEL OPERACIONAL
-- ------------------------------------------------------------

/**
 * Números do dia + o que precisa de atenção humana.
 *
 * Uma chamada só: o painel antigo fazia seis consultas para montar a tela.
 */
CREATE OR REPLACE FUNCTION public.command_center(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH today AS (
    SELECT (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE AS d
  )
  SELECT jsonb_build_object(
    'found_today', (
      SELECT COUNT(*) FROM public.mission_leads, today
      WHERE user_id = p_user_id AND created_at >= today.d
    ),
    'qualified_today', (
      SELECT COUNT(*) FROM public.mission_leads, today
      WHERE user_id = p_user_id AND created_at >= today.d
        AND status NOT IN ('found', 'disqualified', 'failed')
    ),
    'contacted_today', (
      SELECT COUNT(*) FROM public.mission_leads, today
      WHERE user_id = p_user_id AND sent_at >= today.d
    ),
    'replied_today', (
      SELECT COUNT(*) FROM public.mission_leads, today
      WHERE user_id = p_user_id AND replied_at >= today.d
    ),
    'meetings_today', (
      SELECT COUNT(*) FROM public.meetings, today
      WHERE user_id = p_user_id AND scheduled_at >= today.d
        AND scheduled_at < today.d + 1
    ),
    -- O que exige ação humana agora
    'awaiting_approval', (
      SELECT COUNT(*) FROM public.mission_leads
      WHERE user_id = p_user_id AND status = 'awaiting_approval'
    ),
    'awaiting_reply', (
      SELECT COUNT(*) FROM public.leads
      WHERE user_id = p_user_id
        AND last_response_at IS NOT NULL
        AND (last_contact_at IS NULL OR last_response_at > last_contact_at)
    ),
    'overdue_followups', (
      SELECT COUNT(*) FROM public.leads
      WHERE user_id = p_user_id
        AND next_follow_up_at IS NOT NULL
        AND next_follow_up_at < NOW()
        AND stage NOT IN ('Ganho', 'Perdido')
    ),
    'hot_leads', (
      SELECT COUNT(*) FROM public.leads
      WHERE user_id = p_user_id AND temperature IN ('quente', 'muito_quente')
    ),
    'handoffs_pending', (
      SELECT COUNT(*) FROM public.agent_escalations
      WHERE user_id = p_user_id AND resolved_at IS NULL
    ),
    'paused_missions', (
      SELECT COUNT(*) FROM public.missions
      WHERE user_id = p_user_id AND status = 'paused'
    ),
    'automation_errors', (
      SELECT COUNT(*) FROM public.agent_events, today
      WHERE user_id = p_user_id AND level = 'error' AND created_at >= today.d
    ),
    'outbound_paused', (
      SELECT COALESCE(outbound_paused, FALSE) FROM public.user_settings
      WHERE user_id = p_user_id
    ),
    'ai_cost_today', (
      SELECT COALESCE(ROUND(SUM(cost_usd), 4), 0) FROM public.ai_usage, today
      WHERE user_id = p_user_id AND created_at >= today.d
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.command_center(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------
-- MEMÓRIA COMERCIAL
-- ------------------------------------------------------------
-- `lead_memory` já existia com tipos livres. Estes tipos passam a ser os
-- reconhecidos pela esteira; a coluna continua TEXT para não quebrar o que
-- o agente conversacional já grava hoje.

COMMENT ON TABLE public.lead_memory IS
  'Memória comercial estruturada. Tipos usados pela esteira: need, interest, '
  'objection, commitment, preference, context, next_action.';

-- ------------------------------------------------------------
-- GATILHOS DE updated_at
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_missions_touch ON public.missions;
CREATE TRIGGER trg_missions_touch
  BEFORE UPDATE ON public.missions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_mission_leads_touch ON public.mission_leads;
CREATE TRIGGER trg_mission_leads_touch
  BEFORE UPDATE ON public.mission_leads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ############################################################
-- [62/70] 20260811140000_c8d9e0f1-0006-4a66-9c06-000000000006.sql
-- ############################################################

-- ============================================================
-- AGREGADOR DE FONTES, CACHE E TETO DE GASTO DE IA
-- ============================================================
-- Três lacunas que a esteira deixou abertas:
--
--   1. As fontes de captura não tinham memória. Uma que estava fora do ar
--      continuava sendo chamada a cada busca, gastando os 20s de timeout de
--      todo mundo, porque nada lembrava que ela já falhara três vezes.
--
--   2. Buscar "clínicas de estética em Itu" duas vezes no mesmo dia refazia
--      o trabalho inteiro: mesmo custo, mesmo tempo, mesmo risco de bloqueio,
--      para chegar ao mesmo resultado.
--
--   3. `ai_usage` registrava o custo mas nada o interrompia. Uma missão de
--      500 leads disparava 500+ chamadas sem teto configurável.
-- ============================================================

-- ------------------------------------------------------------
-- ESTADO DOS PROVIDERS
-- ------------------------------------------------------------
-- Global, não por usuário: se o Overpass está fora do ar, está fora para
-- todo mundo, e cada conta descobrir isso sozinha custaria 3 falhas por
-- conta antes de qualquer uma parar de tentar.

CREATE TABLE IF NOT EXISTS public.provider_states (
  provider_id          TEXT PRIMARY KEY,
  enabled              BOOLEAN NOT NULL DEFAULT TRUE,
  health               TEXT NOT NULL DEFAULT 'healthy',
  priority             INTEGER NOT NULL DEFAULT 100,

  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  -- Enquanto isto estiver no futuro, a fonte é pulada.
  circuit_open_until   TIMESTAMPTZ,

  last_run_at          TIMESTAMPTZ,
  last_error           TEXT,

  total_runs           INTEGER NOT NULL DEFAULT 0,
  total_found          INTEGER NOT NULL DEFAULT 0,
  -- O número que importa: quantas empresas ÚNICAS a fonte agregou. Uma
  -- fonte que acha 300 empresas que as outras já tinham não vale nada.
  total_unique         INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms       INTEGER NOT NULL DEFAULT 0,

  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT provider_health_valid
    CHECK (health IN ('healthy', 'degraded', 'offline', 'not_configured'))
);

COMMENT ON TABLE public.provider_states IS
  'Saúde e desempenho das fontes de empresas. Infraestrutura interna: o '
  'cliente final não vê quais fontes existem.';

-- Só service role e admin da plataforma enxergam. Para o cliente existe
-- apenas "a busca" — expor a lista de fontes seria expor a engenharia.
ALTER TABLE public.provider_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin reads provider states" ON public.provider_states;
CREATE POLICY "admin reads provider states" ON public.provider_states
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- CACHE DE BUSCA
-- ------------------------------------------------------------
-- Comunitário de propósito, como o `community_leads` que já existe: se
-- alguém buscou "clínicas de estética em Itu" há duas horas, refazer a
-- consulta não traz empresa nova — traz custo e risco de bloqueio.

CREATE TABLE IF NOT EXISTS public.search_cache (
  cache_key    TEXT PRIMARY KEY,
  term         TEXT NOT NULL,
  location     TEXT NOT NULL,
  businesses   JSONB NOT NULL DEFAULT '[]'::jsonb,
  result_count INTEGER NOT NULL DEFAULT 0,
  hits         INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_cache_fresh
  ON public.search_cache (created_at DESC);

ALTER TABLE public.search_cache ENABLE ROW LEVEL SECURITY;

-- Escrita só por service role (edge function). Leitura acontece do lado do
-- servidor, então não há policy de SELECT para o cliente.
DROP POLICY IF EXISTS "no direct client access" ON public.search_cache;

/** Limpa cache vencido. Chamado pelo cron. */
CREATE OR REPLACE FUNCTION public.purge_search_cache(p_hours INTEGER DEFAULT 72)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.search_cache
  WHERE created_at < NOW() - (p_hours || ' hours')::INTERVAL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_search_cache(INTEGER) TO service_role;

-- ------------------------------------------------------------
-- TETO DE GASTO DE IA
-- ------------------------------------------------------------

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS ai_daily_budget_usd   NUMERIC(10, 2) NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS ai_monthly_budget_usd NUMERIC(10, 2) NOT NULL DEFAULT 100.00;

COMMENT ON COLUMN public.user_settings.ai_daily_budget_usd IS
  'Teto diário de gasto com IA. Ao atingir, a esteira para de gerar mensagem '
  '— responder conversa em andamento continua permitido.';

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS ai_budget_usd NUMERIC(10, 2);

COMMENT ON COLUMN public.missions.ai_budget_usd IS
  'Teto de gasto desta missão. NULL usa apenas os limites da conta.';

/**
 * Diz se ainda há orçamento de IA. Devolve NULL quando pode gastar, ou o
 * motivo do bloqueio.
 *
 * Falha ABERTA de propósito: se o cálculo do orçamento quebrar, a operação
 * comercial não pode parar por causa da contabilidade. O contrário — parar
 * de vender porque a telemetria falhou — custa mais que o estouro.
 */
CREATE OR REPLACE FUNCTION public.ai_budget_check(
  p_user_id    UUID,
  p_mission_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_daily_cap   NUMERIC;
  v_monthly_cap NUMERIC;
  v_mission_cap NUMERIC;
  v_today       NUMERIC;
  v_month       NUMERIC;
  v_mission     NUMERIC;
BEGIN
  SELECT ai_daily_budget_usd, ai_monthly_budget_usd
    INTO v_daily_cap, v_monthly_cap
  FROM public.user_settings
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(cost_usd), 0) INTO v_today
  FROM public.ai_usage
  WHERE user_id = p_user_id
    AND created_at >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;

  IF v_daily_cap > 0 AND v_today >= v_daily_cap THEN
    RETURN format('limite diário de IA atingido (US$ %s de %s)',
                  ROUND(v_today, 2), ROUND(v_daily_cap, 2));
  END IF;

  SELECT COALESCE(SUM(cost_usd), 0) INTO v_month
  FROM public.ai_usage
  WHERE user_id = p_user_id
    AND created_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo');

  IF v_monthly_cap > 0 AND v_month >= v_monthly_cap THEN
    RETURN format('limite mensal de IA atingido (US$ %s de %s)',
                  ROUND(v_month, 2), ROUND(v_monthly_cap, 2));
  END IF;

  IF p_mission_id IS NOT NULL THEN
    SELECT ai_budget_usd INTO v_mission_cap
    FROM public.missions WHERE id = p_mission_id;

    IF v_mission_cap IS NOT NULL AND v_mission_cap > 0 THEN
      SELECT COALESCE(SUM(cost_usd), 0) INTO v_mission
      FROM public.ai_usage WHERE mission_id = p_mission_id;

      IF v_mission >= v_mission_cap THEN
        RETURN format('orçamento da missão esgotado (US$ %s de %s)',
                      ROUND(v_mission, 2), ROUND(v_mission_cap, 2));
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ai_budget_check(UUID, UUID) TO authenticated, service_role;

/** Consumo de IA por período, para o painel de custos. */
CREATE OR REPLACE FUNCTION public.ai_cost_summary(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'today', (
      SELECT COALESCE(ROUND(SUM(cost_usd), 4), 0) FROM public.ai_usage
      WHERE user_id = p_user_id
        AND created_at >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE
    ),
    'month', (
      SELECT COALESCE(ROUND(SUM(cost_usd), 4), 0) FROM public.ai_usage
      WHERE user_id = p_user_id
        AND created_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo')
    ),
    'daily_cap',   (SELECT ai_daily_budget_usd   FROM public.user_settings WHERE user_id = p_user_id),
    'monthly_cap', (SELECT ai_monthly_budget_usd FROM public.user_settings WHERE user_id = p_user_id),
    'by_agent', (
      SELECT COALESCE(jsonb_object_agg(agent, total), '{}'::jsonb)
      FROM (
        SELECT COALESCE(agent, 'outros') AS agent, ROUND(SUM(cost_usd), 4) AS total
        FROM public.ai_usage
        WHERE user_id = p_user_id
          AND created_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo')
        GROUP BY 1
      ) t
    ),
    'avg_latency_ms', (
      SELECT COALESCE(ROUND(AVG(latency_ms)), 0) FROM public.ai_usage
      WHERE user_id = p_user_id
        AND created_at >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.ai_cost_summary(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------
-- MISSÕES PENDENTES PARA O CRON
-- ------------------------------------------------------------

/**
 * Missões ativas com lead esperando na esteira.
 *
 * Hoje o lote só anda quando alguém abre a tela e clica. Com isto o cron
 * consegue tocar a fila sozinho — que é o que "autônomo" significa.
 */
CREATE OR REPLACE FUNCTION public.missions_pending_batch(p_limit INTEGER DEFAULT 20)
RETURNS TABLE (mission_id UUID, user_id UUID, pending INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.user_id, COUNT(ml.id)::INTEGER AS pending
  FROM public.missions m
  JOIN public.mission_leads ml
    ON ml.mission_id = m.id AND ml.status = 'found'
  LEFT JOIN public.user_settings us ON us.user_id = m.user_id
  WHERE m.status = 'running'
    AND m.paused_at IS NULL
    AND COALESCE(us.outbound_paused, FALSE) = FALSE
  GROUP BY m.id, m.user_id
  ORDER BY pending DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.missions_pending_batch(INTEGER) TO service_role;

-- ------------------------------------------------------------
-- PAINEL DE FONTES (SUPER ADMIN)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.data_sources_overview()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Infraestrutura interna: só admin da plataforma.
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'acesso restrito';
  END IF;

  SELECT jsonb_build_object(
    'providers', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', provider_id,
        'enabled', enabled,
        'health', health,
        'priority', priority,
        'total_runs', total_runs,
        'total_found', total_found,
        'total_unique', total_unique,
        'unique_rate', CASE WHEN total_found > 0
          THEN ROUND(total_unique::NUMERIC / total_found, 3) ELSE 0 END,
        'avg_latency_ms', avg_latency_ms,
        'consecutive_failures', consecutive_failures,
        'circuit_open_until', circuit_open_until,
        'last_run_at', last_run_at,
        'last_error', last_error
      ) ORDER BY priority
    ), '[]'::jsonb),
    'cache_entries', (SELECT COUNT(*) FROM public.search_cache),
    'cache_hits',    (SELECT COALESCE(SUM(hits), 0) FROM public.search_cache)
  ) INTO v_result
  FROM public.provider_states;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.data_sources_overview() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_provider_states_touch ON public.provider_states;
CREATE TRIGGER trg_provider_states_touch
  BEFORE UPDATE ON public.provider_states
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ############################################################
-- [63/70] 20260811160000_d9e0f1a2-0007-4a77-9c07-000000000007.sql
-- ############################################################

-- ============================================================
-- O CRON PRECISA PROVAR QUE É O CRON
-- ============================================================
-- Duas coisas erradas nos agendamentos antigos, e a segunda é a que
-- realmente quebrava:
--
-- 1. O endereço do projeto estava fixo dentro do comando do cron, em cinco
--    migrações diferentes:
--
--      url := 'https://<ref>.supabase.co/functions/v1/cron-tasks'
--
--    Enquanto existe um projeto só, isso passa despercebido. No dia em que
--    alguém restaurar um backup em outro projeto, o cron de lá continua
--    chamando as funções daqui — e não falha, funciona, operando o banco
--    errado. Passa a morar em `private.app_config`: trocar vira um UPDATE
--    numa linha, não uma caçada por string em migração antiga.
--
-- 2. Os agendamentos mandavam a ANON KEY no Authorization. As functions
--    internas passaram a exigir prova de chamada interna, e a anon key não é
--    uma — então TODA execução automática morria em 401. Nenhum follow-up,
--    nenhuma manutenção e nenhum lote de missão jamais rodou pelo cron.
--
-- Esta migração é a última da fila de propósito: reagenda por cima do que as
-- anteriores deixaram, então o histórico continua íntegro e o resultado
-- final está correto em qualquer projeto onde ela rodar.
--
-- SE UM DIA VOCÊ TROCAR DE PROJETO: altere o valor abaixo antes de rodar. A
-- conferência do fim FALHA de propósito se sobrar cron apontando para outro
-- lugar — é melhor a migração parar do que o agendamento operar o banco
-- errado em silêncio.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ENDEREÇO DAS FUNÇÕES
-- ------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.app_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON private.app_config FROM PUBLIC, anon, authenticated;

/**
 * Descobre o endereço das edge functions deste projeto.
 *
 * Ordem: valor configurado > referência do próprio banco > nada.
 *
 * O nome do banco no Supabase não carrega o project ref, então não dá para
 * deduzir com segurança — por isso o valor configurado é a fonte da verdade,
 * e a função devolve NULL em vez de chutar. Chutar aqui significaria
 * disparar cron contra um endereço inexistente e ninguém entender por quê.
 */
CREATE OR REPLACE FUNCTION private.functions_base_url()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT value FROM private.app_config WHERE key = 'functions_base_url';
$$;

-- Endereço deste projeto. Se um dia mudar, basta:
--   UPDATE private.app_config
--      SET value = 'https://<outro-ref>.supabase.co/functions/v1/'
--    WHERE key = 'functions_base_url';
-- e rodar o bloco de reagendamento abaixo.
INSERT INTO private.app_config (key, value)
VALUES ('functions_base_url', 'https://oeztpxyprifabkvysroh.supabase.co/functions/v1/')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Garante o segredo interno mesmo que esta migração rode isolada.
INSERT INTO private.app_config (key, value)
VALUES ('internal_secret', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- 2. REAGENDAMENTO
-- ------------------------------------------------------------
-- Recria todos os jobs apontando para o endereço configurado e
-- autenticando pelo segredo interno.
--
-- Os agendamentos originais mandavam a ANON KEY no Authorization. Além de
-- ser o projeto errado, era autenticação errada: as functions internas
-- passaram a exigir prova de chamada interna, e a anon key não é uma.

DO $$
DECLARE
  v_secret TEXT;
  v_base   TEXT;
  v_job    RECORD;
BEGIN
  SELECT value INTO v_base   FROM private.app_config WHERE key = 'functions_base_url';
  SELECT value INTO v_secret FROM private.app_config WHERE key = 'internal_secret';

  IF v_base IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'functions_base_url ou internal_secret ausente — crons não reagendados.';
    RETURN;
  END IF;

  FOR v_job IN
    SELECT * FROM (VALUES
      -- cron-tasks é o motor de manutenção: dentro dele roda também o
      -- avanço dos lotes das missões (tarefa `run_missions`).
      ('cron-tasks-every-5min',        '*/5 * * * *',  'cron-tasks',            '{}'),
      ('scheduled-prospecting-hourly', '0 * * * *',    'scheduled-prospecting', '{"action":"check_and_run"}'),
      ('follow-up-check',              '*/30 * * * *', 'follow-up',             '{"action":"process_follow_ups"}'),
      ('check-subscriptions-daily',    '0 */6 * * *',  'check-subscriptions',   '{}')
    ) AS t(job_name, schedule, fn, body)
  LOOP
    -- cron.unschedule estoura se o job não existir; num projeto novo é o
    -- caso normal, então o erro é ignorado de propósito.
    BEGIN
      PERFORM cron.unschedule(v_job.job_name);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      v_job.job_name,
      v_job.schedule,
      format(
        $cmd$SELECT net.http_post(
          url := %L,
          headers := %L::jsonb,
          body := %L::jsonb
        ) AS request_id;$cmd$,
        v_base || v_job.fn,
        json_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', v_secret
        )::text,
        v_job.body
      )
    );
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- 3. CONFERÊNCIA
-- ------------------------------------------------------------
-- Nenhum job pode ter sobrado apontando para outro projeto. Se sobrar, a
-- migração falha aqui em vez de deixar o problema silencioso em produção —
-- que é exatamente como ele passou despercebido da primeira vez.

DO $$
DECLARE
  v_base    TEXT;
  v_estranhos INTEGER;
BEGIN
  SELECT value INTO v_base FROM private.app_config WHERE key = 'functions_base_url';

  SELECT COUNT(*) INTO v_estranhos
  FROM cron.job
  WHERE command LIKE '%supabase.co/functions/v1/%'
    AND command NOT LIKE '%' || v_base || '%';

  IF v_estranhos > 0 THEN
    RAISE EXCEPTION
      'Há % job(s) de cron apontando para outro projeto Supabase. '
      'Rode: SELECT jobname, command FROM cron.job; e reagende manualmente.',
      v_estranhos;
  END IF;
END;
$$;


-- ############################################################
-- [64/70] 20260811180000_e0f1a2b3-0008-4a88-9c08-000000000008.sql
-- ############################################################

-- ============================================================
-- O FUNIL DA MISSÃO PRECISA CHEGAR ATÉ O FIM
-- ============================================================
-- `mission_leads` tem os estados 'replied' e 'meeting_booked', a tela desenha
-- as cinco etapas do funil, e `command_center()` devolve `replied_today` e
-- `meetings_today`. Só que nenhum código fora do orquestrador jamais escreveu
-- nessa tabela:
--
--   $ grep -rn "mission_leads" supabase/functions/ | grep -v sales-orchestrator
--   (vazio)
--
-- Quer dizer: a esteira levava o lead até 'sent' e parava ali. Quando o lead
-- respondia, quem sabia disso era `leads.last_response_at`; quando a reunião
-- era marcada, quem sabia era `meetings`. A missão nunca ficava sabendo.
-- As duas últimas etapas do funil mostravam zero para sempre — não porque a
-- operação ia mal, mas porque ninguém contava.
--
-- Uma tela que exibe zero permanente é pior que uma tela ausente: a ausente
-- avisa que falta algo, a zerada afirma um fato falso. E o número que estava
-- faltando é justamente o que decide se a abordagem funciona.
--
-- POR QUE GATILHO NO BANCO, E NÃO CHAMADA NO CÓDIGO
-- Já existem DOIS caminhos que inserem reunião (`webhook` e
-- `whatsapp-ai-reply`) e a resposta do lead entra por mais de um lugar.
-- Espalhar `update mission_leads` por esses pontos significa que o próximo
-- caminho de resposta — que vai existir — nasce esquecendo de avançar o
-- funil, e o defeito volta calado. No gatilho, avançar deixa de ser algo que
-- alguém precisa lembrar de fazer.
-- ============================================================

-- ------------------------------------------------------------
-- 1. CONTADORES EM UM LUGAR SÓ
-- ------------------------------------------------------------
-- A regra de "o que conta como abordado/respondido" estava escrita em
-- TypeScript dentro do orquestrador. Com o gatilho, ela passaria a existir em
-- dois lugares — e duas cópias de uma regra sempre acabam discordando.
-- Passa a morar aqui; o orquestrador chama esta função.
--
-- Recalcula em vez de incrementar de propósito. Incremento depende de saber
-- o estado anterior de cada linha e erra para sempre quando erra uma vez;
-- recontar é exato, e o custo é uma varredura por índice sobre no máximo
-- 2000 linhas (`target_count` tem teto).

CREATE OR REPLACE FUNCTION public.mission_refresh_counters(p_mission_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.missions m
  SET leads_found     = c.found,
      leads_qualified = c.qualified,
      leads_drafted   = c.drafted,
      leads_contacted = c.contacted,
      leads_replied   = c.replied,
      meetings_booked = c.meetings,
      updated_at      = NOW()
  FROM (
    SELECT
      COUNT(*)                                                            AS found,
      COUNT(*) FILTER (WHERE status NOT IN ('found', 'disqualified', 'failed')) AS qualified,
      COUNT(*) FILTER (WHERE status IN ('drafted', 'awaiting_approval', 'approved',
                                        'sent', 'replied', 'meeting_booked', 'handed_off')) AS drafted,
      COUNT(*) FILTER (WHERE status IN ('sent', 'replied', 'meeting_booked', 'handed_off')) AS contacted,
      -- Quem marcou reunião obviamente respondeu; quem foi passado para
      -- humano só chega lá depois de responder. Contar só o status literal
      -- 'replied' faria o número CAIR quando o lead avança — o oposto do que
      -- um funil deve mostrar.
      COUNT(*) FILTER (WHERE status IN ('replied', 'meeting_booked', 'handed_off'))         AS replied,
      COUNT(*) FILTER (WHERE status = 'meeting_booked')                                    AS meetings
    FROM public.mission_leads
    WHERE mission_id = p_mission_id
  ) c
  WHERE m.id = p_mission_id;
$$;

GRANT EXECUTE ON FUNCTION public.mission_refresh_counters(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 2. O LEAD RESPONDEU
-- ------------------------------------------------------------

/**
 * Avança para 'replied' a linha de missão que de fato abordou este lead.
 *
 * Duas decisões que valem explicação:
 *
 * 1. Só concorre missão com `sent_at` preenchido. O mesmo lead pode estar em
 *    várias missões; a resposta pertence a quem escreveu. Missão que ainda
 *    não enviou nada não pode reivindicar uma resposta que não provocou —
 *    seria inflar a conversão dela com o trabalho de outra.
 *
 * 2. Entre as que enviaram, ganha a de envio mais recente: é a mensagem que
 *    o lead tinha na frente quando respondeu.
 *
 * `replied_at` só é gravado na primeira resposta. A métrica que interessa é
 * o tempo até o lead reagir; sobrescrever a cada mensagem transformaria isso
 * em "quando ele falou pela última vez", que já existe em `leads`.
 */
CREATE OR REPLACE FUNCTION public.mission_lead_on_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT id, mission_id, user_id, status
    INTO v_row
  FROM public.mission_leads
  WHERE lead_id = NEW.lead_id
    AND sent_at IS NOT NULL
    -- Não regride quem já está adiante no funil.
    AND status NOT IN ('replied', 'meeting_booked', 'handed_off', 'opted_out')
  ORDER BY sent_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  UPDATE public.mission_leads
  SET status     = 'replied',
      replied_at = COALESCE(replied_at, NEW.created_at)
  WHERE id = v_row.id;

  PERFORM public.mission_refresh_counters(v_row.mission_id);

  INSERT INTO public.agent_events (user_id, mission_id, lead_id, agent, event, summary, detail, level)
  VALUES (
    v_row.user_id, v_row.mission_id, NEW.lead_id,
    'orchestrator', 'lead_replied',
    'Lead respondeu à abordagem.',
    jsonb_build_object(
      'status_anterior', v_row.status,
      'trecho', left(NEW.content, 180)
    ),
    'success'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mission_lead_on_reply ON public.chat_messages;
CREATE TRIGGER trg_mission_lead_on_reply
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  -- O filtro fica no WHEN, não dentro da função: assim mensagem nossa
  -- (99% do volume) nem chega a abrir o bloco plpgsql.
  WHEN (NEW.sender_type = 'lead')
  EXECUTE FUNCTION public.mission_lead_on_reply();

-- ------------------------------------------------------------
-- 3. A REUNIÃO FOI MARCADA
-- ------------------------------------------------------------

/**
 * Avança para 'meeting_booked' — o desfecho que a missão persegue.
 *
 * Aceita também linha ainda em 'replied' ou anterior: acontece de o lead
 * fechar a agenda na mesma mensagem em que responde, e nesse caso os dois
 * gatilhos disparam na mesma transação. `replied_at` é preenchido aqui
 * quando ainda estiver vazio, porque marcar reunião sem ter respondido é
 * impossível — se o campo ficasse nulo, o funil mostraria mais reuniões que
 * respostas.
 */
CREATE OR REPLACE FUNCTION public.mission_lead_on_meeting()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT id, mission_id, user_id, status
    INTO v_row
  FROM public.mission_leads
  WHERE lead_id = NEW.lead_id
    -- A reunião só move a missão de quem é dono do lead. Ver a política de
    -- `meetings` reforçada no bloco 5: `lead_id` não era conferido contra o
    -- dono, então dava para inserir reunião apontando para o lead de outra
    -- conta. Com o gatilho, isso deixaria de ser um registro solto e passaria
    -- a mexer no funil alheio.
    AND user_id = NEW.user_id
    AND sent_at IS NOT NULL
    AND status NOT IN ('meeting_booked', 'opted_out')
  ORDER BY sent_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  UPDATE public.mission_leads
  SET status     = 'meeting_booked',
      replied_at = COALESCE(replied_at, NEW.created_at)
  WHERE id = v_row.id;

  PERFORM public.mission_refresh_counters(v_row.mission_id);

  INSERT INTO public.agent_events (user_id, mission_id, lead_id, agent, event, summary, detail, level)
  VALUES (
    v_row.user_id, v_row.mission_id, NEW.lead_id,
    'scheduler', 'meeting_booked',
    format('Reunião marcada para %s.',
           to_char(NEW.scheduled_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')),
    jsonb_build_object(
      'meeting_id', NEW.id,
      'scheduled_at', NEW.scheduled_at,
      'status_anterior', v_row.status
    ),
    'success'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mission_lead_on_meeting ON public.meetings;
CREATE TRIGGER trg_mission_lead_on_meeting
  AFTER INSERT ON public.meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.mission_lead_on_meeting();

-- ------------------------------------------------------------
-- 4. O QUE JÁ ACONTECEU ANTES DO GATILHO EXISTIR
-- ------------------------------------------------------------
-- Respostas e reuniões que ocorreram enquanto o funil estava aberto ficaram
-- registradas em `chat_messages` e `meetings`, mas não em `mission_leads`.
-- Sem esta recuperação, o histórico continuaria dizendo que ninguém nunca
-- respondeu — e a primeira medição de conversão nasceria errada.
--
-- Só faz UPDATE, e só para frente. Em projeto novo não encontra nada.

WITH primeira_resposta AS (
  SELECT ml.id,
         MIN(cm.created_at) AS respondeu_em
  FROM public.mission_leads ml
  JOIN public.chat_messages cm
    ON cm.lead_id = ml.lead_id
   AND cm.sender_type = 'lead'
   AND cm.created_at >= ml.sent_at
  WHERE ml.sent_at IS NOT NULL
    AND ml.status = 'sent'
  GROUP BY ml.id
)
UPDATE public.mission_leads ml
SET status = 'replied',
    replied_at = COALESCE(ml.replied_at, p.respondeu_em)
FROM primeira_resposta p
WHERE ml.id = p.id;

WITH reuniao AS (
  SELECT ml.id,
         MIN(mt.created_at) AS marcou_em
  FROM public.mission_leads ml
  JOIN public.meetings mt
    ON mt.lead_id = ml.lead_id
   AND mt.created_at >= ml.sent_at
  WHERE ml.sent_at IS NOT NULL
    AND ml.status IN ('sent', 'replied')
  GROUP BY ml.id
)
UPDATE public.mission_leads ml
SET status = 'meeting_booked',
    replied_at = COALESCE(ml.replied_at, r.marcou_em)
FROM reuniao r
WHERE ml.id = r.id;

-- Contadores de todas as missões tocadas pela recuperação.
DO $$
DECLARE
  v_id UUID;
BEGIN
  FOR v_id IN SELECT id FROM public.missions LOOP
    PERFORM public.mission_refresh_counters(v_id);
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- 5. REUNIÃO PRECISA SER DE UM LEAD SEU
-- ------------------------------------------------------------
-- A política original de `meetings` conferia só o `user_id`:
--
--   FOR ALL USING (auth.uid() = user_id)
--
-- O `lead_id` passava sem conferência. Dava para inserir uma reunião com o
-- próprio user_id apontando para o lead de OUTRA conta. Enquanto a tabela
-- era só um calendário, o estrago era um registro estranho na agenda de
-- ninguém. Agora que a reunião avança o funil, viraria escrita na missão de
-- outra empresa.
--
-- `chat_messages` já conferia isso desde o começo (`is_lead_owner`); a
-- assimetria entre as duas tabelas era o defeito.

DROP POLICY IF EXISTS "Users can manage their own meetings" ON public.meetings;

CREATE POLICY "Users can manage their own meetings"
  ON public.meetings FOR ALL
  USING (auth.uid() = user_id AND public.is_lead_owner(lead_id))
  WITH CHECK (auth.uid() = user_id AND public.is_lead_owner(lead_id));

-- ------------------------------------------------------------
-- 6. CONFERÊNCIA
-- ------------------------------------------------------------
-- Gatilho que não foi criado não dá erro: ele simplesmente não roda, e o
-- sintoma é exatamente o mesmo defeito que esta migração veio corrigir —
-- números zerados sem explicação. Melhor a migração falhar aqui.

DO $$
DECLARE
  v_faltando TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_mission_lead_on_reply' AND NOT tgisinternal
  ) THEN
    v_faltando := v_faltando || 'trg_mission_lead_on_reply';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_mission_lead_on_meeting' AND NOT tgisinternal
  ) THEN
    v_faltando := v_faltando || 'trg_mission_lead_on_meeting';
  END IF;

  IF array_length(v_faltando, 1) > 0 THEN
    RAISE EXCEPTION 'Gatilhos do funil não foram criados: %', array_to_string(v_faltando, ', ');
  END IF;
END;
$$;

COMMENT ON FUNCTION public.mission_refresh_counters(UUID) IS
  'Recalcula os contadores desnormalizados de uma missão a partir de mission_leads. '
  'Fonte única da regra — o orquestrador chama esta função em vez de repeti-la.';


-- ############################################################
-- [65/70] 20260811200000_f1a2b3c4-0009-4a99-9c09-000000000009.sql
-- ############################################################

-- ============================================================
-- MISSÃO NÃO PODE SE DAR POR CONCLUÍDA COM TRABALHO PENDENTE
-- ============================================================
-- O orquestrador encerrava a missão assim que não sobrava lead em 'found':
--
--   if ((remaining ?? 0) === 0)
--     update missions set status = 'completed'
--
-- No nível de autonomia 'assistido' — que é o PADRÃO — nenhum lead envia
-- sozinho: todos param em 'awaiting_approval' esperando o dono aprovar. Quer
-- dizer que 'found' zera exatamente quando a fila de aprovação está cheia.
--
-- E `mission_can_send()` exige `status = 'running'`. Então, no modo padrão,
-- a sequência era:
--
--   1. a esteira roda e enche a fila de aprovação;
--   2. acaba o 'found' e a missão vira 'completed';
--   3. o dono clica em Aprovar e recebe
--      "Não é possível enviar agora: missao nao esta ativa";
--   4. e não existe botão que traga a missão de volta.
--
-- O caminho mais seguro do produto — com humano conferindo cada mensagem —
-- era o único que não conseguia enviar mensagem nenhuma.
--
-- Some-se a isso o que era retido pelo relógio: fora do horário permitido, o
-- envio automático voltava para 'awaiting_approval' como se a IA tivesse
-- pedido ajuda humana. Não tinha — era só o expediente. Ninguém avisava o
-- dono, e nada tentava de novo quando a janela reabria: a mensagem pronta
-- ficava parada para sempre.
-- ============================================================

-- ------------------------------------------------------------
-- 1. O QUE AINDA FALTA FAZER
-- ------------------------------------------------------------

/**
 * Trabalho pendente de uma missão, separado por quem está segurando a fila.
 *
 *   to_process    — lead capturado que a esteira ainda não analisou
 *   awaiting_human— rascunho pronto esperando decisão de uma pessoa
 *   ready_to_send — aprovado, esperando só a janela de envio abrir
 *
 * A separação existe porque os três esperam coisas diferentes: o primeiro
 * espera processamento, o segundo espera uma pessoa, o terceiro espera o
 * relógio. Tratar os três como "pendente" genérico foi o que fez o cron
 * ignorar justamente o terceiro.
 */
CREATE OR REPLACE FUNCTION public.mission_pending_work(p_mission_id UUID)
RETURNS TABLE (to_process INTEGER, awaiting_human INTEGER, ready_to_send INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*) FILTER (WHERE status IN ('found', 'enriched', 'qualified'))::INTEGER,
    COUNT(*) FILTER (WHERE status IN ('drafted', 'awaiting_approval'))::INTEGER,
    COUNT(*) FILTER (WHERE status = 'approved')::INTEGER
  FROM public.mission_leads
  WHERE mission_id = p_mission_id;
$$;

GRANT EXECUTE ON FUNCTION public.mission_pending_work(UUID) TO authenticated, service_role;

/**
 * Decide e aplica o status da missão. Devolve o que encontrou, para o
 * orquestrador não precisar consultar de novo.
 *
 * Conclui SÓ quando não há mais nada em nenhuma das três filas. Missão com
 * fila de aprovação aberta continua 'running' — porque é verdade: ela tem
 * trabalho pendente, só que o trabalho é de uma pessoa.
 *
 * Não mexe em missão pausada nem em missão que já foi concluída. Pausa é
 * decisão de alguém e não cabe a esta função desfazer.
 */
CREATE OR REPLACE FUNCTION public.mission_settle_status(p_mission_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_work    RECORD;
  v_mission RECORD;
  v_concluiu BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_work FROM public.mission_pending_work(p_mission_id);

  SELECT id, user_id, name, status, paused_at INTO v_mission
  FROM public.missions WHERE id = p_mission_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'missao_nao_encontrada');
  END IF;

  PERFORM public.mission_refresh_counters(p_mission_id);

  IF v_mission.status = 'running'
     AND v_mission.paused_at IS NULL
     AND v_work.to_process = 0
     AND v_work.awaiting_human = 0
     AND v_work.ready_to_send = 0
  THEN
    UPDATE public.missions SET status = 'completed' WHERE id = p_mission_id;
    v_concluiu := TRUE;

    INSERT INTO public.agent_events (user_id, mission_id, agent, event, summary, level)
    VALUES (v_mission.user_id, p_mission_id, 'supervisor', 'mission_completed',
            format('Missão "%s" concluída: não há mais nada na fila.', v_mission.name),
            'success');
  END IF;

  RETURN jsonb_build_object(
    'to_process',     v_work.to_process,
    'awaiting_human', v_work.awaiting_human,
    'ready_to_send',  v_work.ready_to_send,
    'completed',      v_concluiu,
    'status',         CASE WHEN v_concluiu THEN 'completed' ELSE v_mission.status END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mission_settle_status(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 2. O CRON PRECISA VER TAMBÉM O QUE ESTÁ SÓ ESPERANDO A HORA
-- ------------------------------------------------------------
-- A versão anterior fazia JOIN exigindo `ml.status = 'found'`. Missão sem
-- lead novo, mas com mensagens aprovadas retidas pelo horário, simplesmente
-- não aparecia — então nada nunca as soltava. O trabalho pendente era
-- invisível para quem tinha a função de tocá-lo.
--
-- O tipo de retorno muda, então precisa de DROP: CREATE OR REPLACE não
-- altera assinatura de saída.

DROP FUNCTION IF EXISTS public.missions_pending_batch(INTEGER);

CREATE FUNCTION public.missions_pending_batch(p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
  mission_id    UUID,
  user_id       UUID,
  pending       INTEGER,
  ready_to_send INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id,
         m.user_id,
         COUNT(*) FILTER (WHERE ml.status = 'found')::INTEGER    AS pending,
         COUNT(*) FILTER (WHERE ml.status = 'approved')::INTEGER AS ready_to_send
  FROM public.missions m
  JOIN public.mission_leads ml
    ON ml.mission_id = m.id
   AND ml.status IN ('found', 'approved')
  LEFT JOIN public.user_settings us ON us.user_id = m.user_id
  WHERE m.status = 'running'
    AND m.paused_at IS NULL
    AND COALESCE(us.outbound_paused, FALSE) = FALSE
  GROUP BY m.id, m.user_id
  -- Quem já tem mensagem pronta vai primeiro: soltar o que está escrito
  -- custa uma chamada de rede, escrever um lote novo custa IA. E a mensagem
  -- retida é a que está envelhecendo.
  ORDER BY ready_to_send DESC, pending DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.missions_pending_batch(INTEGER) TO service_role;

-- ------------------------------------------------------------
-- 3. MISSÕES QUE JÁ FORAM ENCERRADAS CEDO DEMAIS
-- ------------------------------------------------------------
-- Toda missão marcada 'completed' que ainda tem fila aberta foi encerrada
-- pelo defeito acima. Volta para 'running' — é o estado verdadeiro dela, e
-- sem isso a fila de aprovação continua impossível de aprovar.
--
-- Missão que estava pausada e mesmo assim foi marcada 'completed' pelo
-- defeito volta para 'paused', não para 'running': quem pausou, pausou. O
-- estado dela era mentiroso nos dois sentidos.

UPDATE public.missions m
SET status = CASE WHEN m.paused_at IS NULL THEN 'running' ELSE 'paused' END
WHERE m.status = 'completed'
  AND EXISTS (
    SELECT 1 FROM public.mission_leads ml
    WHERE ml.mission_id = m.id
      AND ml.status IN ('found', 'enriched', 'qualified',
                        'drafted', 'awaiting_approval', 'approved')
  );

-- ------------------------------------------------------------
-- 4. CONFERÊNCIA
-- ------------------------------------------------------------

DO $$
DECLARE
  v_presas INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_presas
  FROM public.missions m
  WHERE m.status = 'completed'
    AND EXISTS (
      SELECT 1 FROM public.mission_leads ml
      WHERE ml.mission_id = m.id
        AND ml.status IN ('found', 'enriched', 'qualified',
                          'drafted', 'awaiting_approval', 'approved')
    );

  IF v_presas > 0 THEN
    RAISE EXCEPTION
      '% missão(ões) continuam concluídas com fila aberta — a fila de aprovação delas ficaria travada.',
      v_presas;
  END IF;
END;
$$;


-- ############################################################
-- [66/70] 20260811220000_a2b3c4d5-0010-4aaa-9c10-000000000010.sql
-- ############################################################

-- ============================================================
-- FALHA DE REDE NÃO PODE CUSTAR UM LEAD
-- ============================================================
-- `sendMessage` tratava qualquer resposta ruim do `whatsapp-send` do mesmo
-- jeito:
--
--   status: optedOut ? 'opted_out' : 'failed'
--
-- 'failed' é estado final. Nada volta a olhar para ele, e não existe botão
-- na tela para tentar de novo. Quer dizer que um 502 momentâneo da Evolution
-- — a coisa mais banal que acontece com API de WhatsApp — apagava para sempre
-- um lead que já tinha sido pesquisado, qualificado, casado com uma oferta,
-- escrito pela IA, aprovado pelo Quality Gate e, no modo assistido, lido e
-- aprovado por uma pessoa. Todo esse custo perdido porque a rede piscou.
--
-- Nem toda falha é igual, e essa é a distinção que faltava:
--
--   DEFINITIVA   número inválido, mensagem fora do formato (HTTP 400)
--                → tentar de novo dá exatamente o mesmo erro
--   OPT-OUT      o número pediu para não receber (409 + blacklisted)
--                → tentar de novo seria desrespeito, não persistência
--   TRANSITÓRIA  chip indisponível, Evolution fora, 5xx, rede caindo
--                → é justamente o caso em que tentar de novo funciona
--
-- Só a primeira e a segunda merecem ser finais.
-- ============================================================

ALTER TABLE public.mission_leads
  ADD COLUMN IF NOT EXISTS send_attempts INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.mission_leads.send_attempts IS
  'Quantas vezes o envio foi tentado. Serve de teto para a retentativa — '
  'sem ele, uma falha permanente disfarçada de transitória tentaria para sempre.';

/**
 * Registra uma tentativa de envio frustrada e decide se ainda vale insistir.
 *
 * Faz o incremento e a decisão na MESMA instrução. A alternativa — ler
 * send_attempts, somar um em TypeScript e gravar — tem janela para duas
 * execuções do cron lerem o mesmo valor e o contador andar menos que as
 * tentativas reais. É um teto de segurança: contador que anda devagar é teto
 * que não segura.
 *
 * Volta para 'approved', não para 'awaiting_approval': ninguém precisa
 * aprovar de novo o que já foi aprovado. O flush do próximo lote pega.
 *
 * Cinco tentativas, e não três, porque as falhas longas (WhatsApp
 * desconectado, parada de emergência, fora do horário) já são barradas antes
 * por `mission_can_send` e nem chegam aqui. O que chega é oscilação curta, e
 * desistir cedo demais custa um lead qualificado — enquanto insistir demais
 * custa uma linha de log.
 */
CREATE OR REPLACE FUNCTION public.mission_lead_send_failed(
  p_mission_lead_id UUID,
  p_error           TEXT,
  p_definitive      BOOLEAN DEFAULT FALSE,
  p_max_attempts    INTEGER DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
BEGIN
  UPDATE public.mission_leads
  SET send_attempts = send_attempts + 1,
      error_message = left(COALESCE(p_error, 'erro desconhecido'), 400),
      status = CASE
                 WHEN p_definitive THEN 'failed'
                 WHEN send_attempts + 1 >= GREATEST(p_max_attempts, 1) THEN 'failed'
                 ELSE 'approved'
               END
  WHERE id = p_mission_lead_id
  RETURNING id, mission_id, status, send_attempts INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'mission_lead_nao_encontrado');
  END IF;

  PERFORM public.mission_refresh_counters(v_row.mission_id);

  RETURN jsonb_build_object(
    'status',       v_row.status,
    'attempts',     v_row.send_attempts,
    'will_retry',   v_row.status = 'approved',
    'max_attempts', GREATEST(p_max_attempts, 1)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mission_lead_send_failed(UUID, TEXT, BOOLEAN, INTEGER)
  TO service_role;

-- ------------------------------------------------------------
-- O QUE JÁ FOI PERDIDO
-- ------------------------------------------------------------
-- Lead marcado 'failed' que ainda tem rascunho aprovado e nenhuma tentativa
-- contabilizada foi vítima do comportamento antigo. Volta para a fila com o
-- contador zerado — o rascunho continua lá, aprovado, íntegro.
--
-- A condição precisa distinguir "falhou no envio" de "falhou no meio da
-- esteira" — reabrir o segundo caso mandaria para a fila mensagem que nunca
-- passou pela revisão.
--
-- `quality IS NOT NULL` é o que separa os dois: só chega a ter avaliação de
-- qualidade quem foi escrito e revisado até o fim. Mensagem barrada pelo
-- Quality Gate não entra aqui porque recebe status 'blocked', não 'failed'.
--
-- Não dá para exigir `approved_at`: nos modos autônomos ninguém aprova à mão,
-- e o campo fica vazio justamente nos casos que este ciclo veio recuperar.

UPDATE public.mission_leads
SET status = 'approved',
    error_message = NULL
WHERE status = 'failed'
  AND send_attempts = 0
  AND draft_message IS NOT NULL
  AND quality IS NOT NULL
  AND sent_at IS NULL;

-- Devolver leads para a fila reabre fila em missão que já estava concluída.
-- Sem isto, o rascunho recuperado ficaria numa missão 'completed' — e
-- `mission_can_send` barra missão que não está 'running'. Seria recuperar o
-- lead e deixá-lo preso do mesmo jeito.

UPDATE public.missions m
SET status = CASE WHEN m.paused_at IS NULL THEN 'running' ELSE 'paused' END
WHERE m.status = 'completed'
  AND EXISTS (
    SELECT 1 FROM public.mission_leads ml
    WHERE ml.mission_id = m.id
      AND ml.status IN ('found', 'enriched', 'qualified',
                        'drafted', 'awaiting_approval', 'approved')
  );

DO $$
DECLARE
  v_id UUID;
BEGIN
  FOR v_id IN SELECT id FROM public.missions LOOP
    PERFORM public.mission_refresh_counters(v_id);
  END LOOP;
END;
$$;


-- ############################################################
-- [67/70] 20260812000000_b3c4d5e6-0011-4abb-9c11-000000000011.sql
-- ############################################################

-- ============================================================
-- "A IA PREFERIU CALAR" PRECISA DE UM NOME PRÓPRIO
-- ============================================================
-- `agent_escalations.escalation_reason` tem lista fechada, e ela cobre só
-- motivos comerciais: objeção complexa, oportunidade grande, reclamação,
-- pergunta técnica. Falta o motivo que passou a existir quando a conversa
-- ganhou conferência de factualidade: a IA gerou uma resposta, a resposta
-- afirmava coisa que ninguém pode sustentar, a reescrita também, e o certo
-- passou a ser não enviar nada e chamar uma pessoa.
--
-- Sem um valor para isso, o INSERT bateria no CHECK e falharia — e o efeito
-- seria o pior possível: a mensagem não sairia (certo) e ninguém ficaria
-- sabendo (errado). Silêncio sem aviso é o modo de falha que faz o cliente
-- achar que foi ignorado.
--
-- Também entra `opt_out_requested`: o lead pedir para parar é motivo de
-- escalação em qualquer operação séria, e não tinha onde ser registrado.
-- ============================================================

ALTER TABLE public.agent_escalations
  DROP CONSTRAINT IF EXISTS agent_escalations_escalation_reason_check;

ALTER TABLE public.agent_escalations
  ADD CONSTRAINT agent_escalations_escalation_reason_check
  CHECK (escalation_reason IN (
    'complex_objection', 'high_value_opportunity', 'complaint',
    'technical_question', 'urgent_request', 'closing_opportunity',
    'competitor_threat', 'custom_request', 'sentiment_negative',
    -- Novos
    'factuality_block',    -- a IA não conseguiu responder sem inventar
    'opt_out_requested'    -- o lead pediu para não receber mais
  ));

COMMENT ON COLUMN public.agent_escalations.escalation_reason IS
  'Por que uma pessoa precisa entrar. `factuality_block` é o único que não '
  'vem do lead: vem da própria IA reconhecendo que não tem como responder '
  'sem afirmar o que não pode sustentar.';

-- ------------------------------------------------------------
-- CONFERÊNCIA
-- ------------------------------------------------------------
-- Se o CHECK não aceitar o valor novo, o escalonamento falha em silêncio na
-- hora errada — em produção, com um lead esperando resposta.

-- Confere a definição do CHECK, e não um INSERT de teste: num projeto novo a
-- tabela `leads` está vazia, o INSERT não inseriria linha nenhuma e o teste
-- passaria sem ter testado nada. Verificação que só funciona com dados é
-- verificação que falha justamente onde mais importa — na primeira subida.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_escalations_escalation_reason_check'
      AND pg_get_constraintdef(oid) LIKE '%factuality_block%'
  ) THEN
    RAISE EXCEPTION
      'O CHECK de escalation_reason não aceita factuality_block — o escalonamento '
      'da conferência de factualidade falharia calado, com um lead esperando resposta.';
  END IF;
END;
$$;


-- ############################################################
-- [68/70] 20260812020000_c4d5e6f7-0012-4acc-9c12-000000000012.sql
-- ############################################################

-- ============================================================
-- O TESTE A/B NUNCA MEDIU NADA
-- ============================================================
-- A tela em /ab-testing tem 463 linhas: criação de teste, teste-z de duas
-- proporções, exibição de vencedor, de confiança e de conversões.
--
-- E nenhuma linha de código do produto jamais passou `ab_test_id` para o
-- envio. Uma busca de dois segundos mostra:
--
--   grep -rn "ab_test_id" src/
--   (vazio)
--
-- Então `variant_a_sent` nunca saiu de zero. E `variant_a_responses` e
-- `variant_a_conversions` não eram escritos por absolutamente nada — só
-- lidos, pela tela e pelo cron. O teste-z do cron dividia por zero, caía no
-- `continue`, e nenhum teste jamais foi concluído.
--
-- É a mesma classe do funil da missão, num tamanho maior: uma funcionalidade
-- inteira que parece pronta e em que TODO número é permanentemente zero.
--
-- O QUE MUDA
-- Os contadores saem das colunas e passam a ser derivados de uma tabela de
-- atribuição — uma linha por lead por teste. Contador desnormalizado que
-- ninguém incrementa vira zero eterno; contador derivado não tem como
-- divergir do que aconteceu.
-- ============================================================

-- ------------------------------------------------------------
-- 1. QUEM RECEBEU O QUÊ
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ab_assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ab_test_id   UUID NOT NULL REFERENCES public.ab_tests(id) ON DELETE CASCADE,
  lead_id      UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  variant      TEXT NOT NULL CHECK (variant IN ('a', 'b')),

  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  replied_at   TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  -- Em centavos: somar dinheiro em ponto flutuante acumula erro, e o número
  -- que vai aparecer na tela como "receita da variante" precisa fechar.
  revenue_cents BIGINT NOT NULL DEFAULT 0,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- O mesmo lead não entra duas vezes no mesmo teste. Sem isto, um
  -- reprocessamento de lote contaria a mesma pessoa como duas amostras e a
  -- significância viraria ficção.
  CONSTRAINT ab_assignments_unique UNIQUE (ab_test_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_ab_assignments_test
  ON public.ab_assignments (ab_test_id, variant);

CREATE INDEX IF NOT EXISTS idx_ab_assignments_lead
  ON public.ab_assignments (lead_id, sent_at DESC);

ALTER TABLE public.ab_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own ab assignments" ON public.ab_assignments;

-- Só leitura pelo cliente: quem escreve é a edge function. O usuário poder
-- editar a própria amostra tira o sentido de medir.
CREATE POLICY "own ab assignments" ON public.ab_assignments
  FOR SELECT USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- 2. O LEAD RESPONDEU
-- ------------------------------------------------------------

/**
 * Marca a resposta na atribuição mais recente deste lead.
 *
 * Mesma escolha do funil da missão: gatilho, não chamada espalhada. A
 * resposta do lead entra por mais de um caminho, e o caminho que for escrito
 * amanhã nasceria esquecendo de contar.
 *
 * `replied_at` só na primeira resposta — a métrica é "respondeu ou não", e
 * sobrescrever a cada mensagem transformaria a amostra em outra coisa.
 */
CREATE OR REPLACE FUNCTION public.ab_on_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ab_assignments
  SET replied_at = NEW.created_at
  WHERE id = (
    SELECT id FROM public.ab_assignments
    WHERE lead_id = NEW.lead_id
      AND replied_at IS NULL
      AND sent_at <= NEW.created_at
    ORDER BY sent_at DESC
    LIMIT 1
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ab_on_reply ON public.chat_messages;
CREATE TRIGGER trg_ab_on_reply
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  WHEN (NEW.sender_type = 'lead')
  EXECUTE FUNCTION public.ab_on_reply();

-- ------------------------------------------------------------
-- 3. O NEGÓCIO FECHOU
-- ------------------------------------------------------------

/**
 * Marca conversão e receita quando o lead entra em "Ganho".
 *
 * `leads.deal_value` é o valor do negócio quando existe. Sem valor, a
 * conversão ainda conta — negócio fechado sem valor preenchido é falha de
 * cadastro, não motivo para ignorar a venda na hora de decidir qual mensagem
 * funciona.
 */
CREATE OR REPLACE FUNCTION public.ab_on_won()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valor BIGINT := 0;
BEGIN
  IF NEW.stage IS NOT DISTINCT FROM OLD.stage THEN
    RETURN NEW;
  END IF;

  IF NEW.stage <> 'Ganho' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_valor := COALESCE(ROUND(NEW.deal_value * 100), 0)::BIGINT;
  EXCEPTION WHEN OTHERS THEN
    v_valor := 0;
  END;

  UPDATE public.ab_assignments
  SET converted_at = NOW(),
      revenue_cents = v_valor
  WHERE id = (
    SELECT id FROM public.ab_assignments
    WHERE lead_id = NEW.id
      AND converted_at IS NULL
    ORDER BY sent_at DESC
    LIMIT 1
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ab_on_won ON public.leads;
CREATE TRIGGER trg_ab_on_won
  AFTER UPDATE OF stage ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.ab_on_won();

-- ------------------------------------------------------------
-- 4. OS NÚMEROS, DERIVADOS
-- ------------------------------------------------------------

/**
 * Estatísticas de um teste, contadas a partir das atribuições.
 *
 * Substitui as seis colunas de contador. A tela e o cron passam a ler daqui,
 * e some a única maneira de esses números estarem errados: ninguém precisa
 * lembrar de incrementá-los.
 */
CREATE OR REPLACE FUNCTION public.ab_test_stats(p_test_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'a', jsonb_build_object(
      'sent',          COUNT(*) FILTER (WHERE variant = 'a'),
      'replied',       COUNT(*) FILTER (WHERE variant = 'a' AND replied_at IS NOT NULL),
      'converted',     COUNT(*) FILTER (WHERE variant = 'a' AND converted_at IS NOT NULL),
      'revenue_cents', COALESCE(SUM(revenue_cents) FILTER (WHERE variant = 'a'), 0)
    ),
    'b', jsonb_build_object(
      'sent',          COUNT(*) FILTER (WHERE variant = 'b'),
      'replied',       COUNT(*) FILTER (WHERE variant = 'b' AND replied_at IS NOT NULL),
      'converted',     COUNT(*) FILTER (WHERE variant = 'b' AND converted_at IS NOT NULL),
      'revenue_cents', COALESCE(SUM(revenue_cents) FILTER (WHERE variant = 'b'), 0)
    )
  )
  FROM public.ab_assignments
  WHERE ab_test_id = p_test_id;
$$;

GRANT EXECUTE ON FUNCTION public.ab_test_stats(UUID) TO authenticated, service_role;

/**
 * Sincroniza as colunas antigas a partir das atribuições.
 *
 * As seis colunas continuam existindo porque a tela antiga lê delas e porque
 * apagar coluna é destrutivo. Deixam de ser a verdade e passam a ser cópia —
 * atualizada por esta função, nunca escrita à mão.
 */
CREATE OR REPLACE FUNCTION public.ab_sync_counters(p_test_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.ab_tests t
  SET variant_a_sent        = c.a_sent,
      variant_b_sent        = c.b_sent,
      variant_a_responses   = c.a_repl,
      variant_b_responses   = c.b_repl,
      variant_a_conversions = c.a_conv,
      variant_b_conversions = c.b_conv,
      updated_at            = NOW()
  FROM (
    SELECT
      COUNT(*) FILTER (WHERE variant = 'a')::INTEGER AS a_sent,
      COUNT(*) FILTER (WHERE variant = 'b')::INTEGER AS b_sent,
      COUNT(*) FILTER (WHERE variant = 'a' AND replied_at IS NOT NULL)::INTEGER AS a_repl,
      COUNT(*) FILTER (WHERE variant = 'b' AND replied_at IS NOT NULL)::INTEGER AS b_repl,
      COUNT(*) FILTER (WHERE variant = 'a' AND converted_at IS NOT NULL)::INTEGER AS a_conv,
      COUNT(*) FILTER (WHERE variant = 'b' AND converted_at IS NOT NULL)::INTEGER AS b_conv
    FROM public.ab_assignments
    WHERE ab_test_id = p_test_id
  ) c
  WHERE t.id = p_test_id;
$$;

GRANT EXECUTE ON FUNCTION public.ab_sync_counters(UUID) TO authenticated, service_role;

/** Testes rodando que têm atribuição — os únicos que vale reavaliar. */
CREATE OR REPLACE FUNCTION public.ab_tests_to_evaluate()
RETURNS TABLE (test_id UUID, user_id UUID, min_sample INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.user_id, t.min_sample_size
  FROM public.ab_tests t
  WHERE t.status = 'running'
    AND EXISTS (SELECT 1 FROM public.ab_assignments a WHERE a.ab_test_id = t.id);
$$;

GRANT EXECUTE ON FUNCTION public.ab_tests_to_evaluate() TO service_role;

-- ------------------------------------------------------------
-- 5. A DECISÃO PRECISA CARREGAR O MOTIVO
-- ------------------------------------------------------------
-- A coluna `winner` guardava "variant_a" e nada mais. Quem abre a tela três
-- semanas depois não tem como saber se aquilo foi decidido por venda ou por
-- curiosidade — e são conclusões muito diferentes.

ALTER TABLE public.ab_tests
  ADD COLUMN IF NOT EXISTS decision_metric TEXT,
  ADD COLUMN IF NOT EXISTS decision_reason TEXT;

COMMENT ON COLUMN public.ab_tests.decision_metric IS
  'Qual métrica decidiu: receita, conversao ou resposta. Resposta é a mais '
  'fraca das três — a mensagem que promete demais ganha ali e perde na venda.';

-- ------------------------------------------------------------
-- 6. CONFERÊNCIA
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ab_on_reply' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_ab_on_reply não foi criado — as respostas do teste A/B continuariam em zero.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ab_on_won' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_ab_on_won não foi criado — as conversões do teste A/B continuariam em zero.';
  END IF;
END;
$$;


-- ############################################################
-- [69/70] 20260812040000_d5e6f7a8-0013-4add-9c13-000000000013.sql
-- ############################################################

-- ============================================================
-- "MELHOR HORÁRIO" ERA CALCULADO EM CIMA DE ZEROS
-- ============================================================
-- `prospecting_stats.responses_received` é escrito por um lugar só — o
-- job-processor — e sempre com o valor 0:
--
--   await supabase.from("prospecting_stats").insert({
--     ...
--     responses_received: 0,
--     positive_responses: 0,
--   });
--
-- Nada nunca incrementou aquelas colunas. E elas alimentavam a recomendação
-- de horário do `ai-prospecting`, que dividia respostas por envios e
-- devolvia, com estas palavras:
--
--   "Baseado nos seus dados: melhor horário às 9h (0.0% de resposta)"
--
-- Toda hora empatada em zero, a ordenação decidida pelo acaso da iteração, e
-- a frase "baseado nos seus dados" fazendo a pessoa confiar o suficiente para
-- reorganizar a operação em cima disso. Recomendação errada custa mais que
-- recomendação ausente, justamente porque alguém age.
--
-- SOLUÇÃO: PARAR DE CONTAR À MÃO
-- A informação sempre existiu em `chat_messages`: quem mandou, quando mandou,
-- e se veio resposta depois. Derivar disso não pode ficar defasado, porque
-- não depende de ninguém lembrar de incrementar.
-- ============================================================

/**
 * Envios e respostas por hora do dia, derivados da conversa real.
 *
 * A resposta é atribuída à hora em que NOSSA mensagem saiu, não à hora em que
 * o lead respondeu. É a pergunta que interessa: "que horas devo mandar?" —
 * não "que horas as pessoas costumam responder", que é outra coisa e não se
 * pode agir sobre ela.
 *
 * Conta uma resposta por mensagem enviada, no máximo: um lead que mandou
 * cinco mensagens seguidas respondeu uma vez, não cinco.
 */
CREATE OR REPLACE FUNCTION public.prospecting_hour_stats(
  p_user_id UUID,
  p_days    INTEGER DEFAULT 90
)
RETURNS TABLE (hour_of_day INTEGER, sent BIGINT, replied BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH nossas AS (
    SELECT
      cm.id,
      cm.lead_id,
      cm.sent_at,
      EXTRACT(HOUR FROM (cm.sent_at AT TIME ZONE 'America/Sao_Paulo'))::INTEGER AS hora
    FROM public.chat_messages cm
    JOIN public.leads l ON l.id = cm.lead_id
    WHERE l.user_id = p_user_id
      AND cm.sender_type IN ('agent', 'user')
      AND cm.status = 'sent'
      AND cm.sent_at >= NOW() - (GREATEST(p_days, 1) || ' days')::INTERVAL
  ),
  com_resposta AS (
    SELECT
      n.hora,
      EXISTS (
        SELECT 1
        FROM public.chat_messages r
        WHERE r.lead_id = n.lead_id
          AND r.sender_type = 'lead'
          AND r.sent_at > n.sent_at
          -- Janela de 72h: resposta que chega uma semana depois não foi
          -- provocada por aquela mensagem, e atribuí-la ao horário dela
          -- inventaria uma relação que não existe.
          AND r.sent_at <= n.sent_at + INTERVAL '72 hours'
      ) AS respondeu
    FROM nossas n
  )
  SELECT hora,
         COUNT(*)::BIGINT,
         COUNT(*) FILTER (WHERE respondeu)::BIGINT
  FROM com_resposta
  GROUP BY hora
  ORDER BY hora;
$$;

GRANT EXECUTE ON FUNCTION public.prospecting_hour_stats(UUID, INTEGER)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.prospecting_hour_stats(UUID, INTEGER) IS
  'Envios e respostas por hora, derivados de chat_messages. Substitui '
  'prospecting_stats.responses_received, que nunca saiu de zero.';

-- ------------------------------------------------------------
-- A COLUNA ANTIGA PRECISA DIZER O QUE É
-- ------------------------------------------------------------
-- Não apago: apagar coluna é destrutivo e há exportação lendo dela. Mas
-- quem abrir o schema precisa saber que aquele zero não é "nenhuma resposta",
-- é "ninguém nunca escreveu aqui".

COMMENT ON COLUMN public.prospecting_stats.responses_received IS
  'OBSOLETA. Nunca foi incrementada por nenhum código — o valor 0 significa '
  '"não medido", não "nenhuma resposta". Use prospecting_hour_stats().';

COMMENT ON COLUMN public.prospecting_stats.positive_responses IS
  'OBSOLETA. Mesma situação de responses_received.';

-- ------------------------------------------------------------
-- CONFERÊNCIA
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'prospecting_hour_stats'
  ) THEN
    RAISE EXCEPTION 'prospecting_hour_stats não foi criada — a recomendação de horário voltaria a sair de zeros.';
  END IF;
END;
$$;


-- ############################################################
-- [70/70] 20260812060000_e6f7a8b9-0014-4aee-9c14-000000000014.sql
-- ############################################################

-- ============================================================
-- O PERFIL IDEAL PRECISA SOBREVIVER À MISSÃO
-- ============================================================
-- Os critérios de ICP moram em `missions.icp`, um JSONB por missão. Funciona
-- para uma missão e falha para uma operação: quem roda cinco campanhas
-- parecidas redigita o mesmo perfil cinco vezes.
--
-- E é assim que as pessoas param de preencher. O campo continua lá, sempre
-- vazio, a qualificação volta a ser quase só "achou sinal de oportunidade ou
-- não", e a nota que ordena a fila perde o que a tornava específica daquele
-- negócio.
--
-- Guardar o perfil separado também dá uma coisa que o JSONB por missão não
-- dava: comparar. Duas missões com o mesmo perfil e resultados diferentes
-- falam sobre a mensagem; com perfis diferentes, falam sobre o público.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.icp_profiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name        TEXT NOT NULL,
  description TEXT,

  -- Mesmos campos que `qualify()` lê. Os nomes batem de propósito: um
  -- apelido diferente aqui viraria tradução em três lugares e divergência no
  -- quarto.
  niches      TEXT[] NOT NULL DEFAULT '{}',
  locations   TEXT[] NOT NULL DEFAULT '{}',
  signals     TEXT[] NOT NULL DEFAULT '{}',
  exclusions  TEXT[] NOT NULL DEFAULT '{}',
  min_rating  NUMERIC(3, 1),
  max_rating  NUMERIC(3, 1),
  min_reviews INTEGER,

  -- Perfil padrão aparece pré-selecionado ao criar missão. Um por conta.
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT icp_profiles_name_len CHECK (char_length(trim(name)) >= 2),
  -- Nome repetido na mesma conta transforma o seletor em adivinhação.
  CONSTRAINT icp_profiles_unique_name UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_icp_profiles_user
  ON public.icp_profiles (user_id, created_at DESC);

ALTER TABLE public.icp_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own icp profiles" ON public.icp_profiles;
CREATE POLICY "own icp profiles" ON public.icp_profiles
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_icp_profiles_touch ON public.icp_profiles;
CREATE TRIGGER trg_icp_profiles_touch
  BEFORE UPDATE ON public.icp_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- UM PADRÃO SÓ
-- ------------------------------------------------------------
-- Sem isto, marcar o segundo perfil como padrão deixaria dois marcados, e a
-- tela escolheria pela ordem da consulta — que muda. O usuário veria um
-- perfil hoje e outro amanhã sem ter mexido em nada.

CREATE OR REPLACE FUNCTION public.icp_single_default()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.icp_profiles
    SET is_default = FALSE
    WHERE user_id = NEW.user_id
      AND id <> NEW.id
      AND is_default;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_icp_single_default ON public.icp_profiles;
CREATE TRIGGER trg_icp_single_default
  AFTER INSERT OR UPDATE OF is_default ON public.icp_profiles
  FOR EACH ROW
  WHEN (NEW.is_default)
  EXECUTE FUNCTION public.icp_single_default();

-- ------------------------------------------------------------
-- A MISSÃO GUARDA DE ONDE VEIO O PERFIL
-- ------------------------------------------------------------
-- `missions.icp` continua sendo a verdade do que foi aplicado: mudar o perfil
-- depois não pode reescrever a régua de uma missão que já rodou — o score dos
-- leads dela foi calculado com a régua antiga, e trocar a régua sem trocar as
-- notas produz um histórico que não fecha.
--
-- Esta coluna serve só para dizer de onde a cópia veio.

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS icp_profile_id UUID REFERENCES public.icp_profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.missions.icp_profile_id IS
  'Perfil que originou o `icp` desta missão. O `icp` é cópia: alterar o '
  'perfil depois NÃO muda missão que já rodou.';

-- ------------------------------------------------------------
-- CONFERÊNCIA
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_icp_single_default' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_icp_single_default não foi criado — dois perfis padrão fariam a tela escolher pela ordem da consulta.';
  END IF;
END;
$$;


-- ============================================================
-- VERIFICAÇÃO FINAL
-- ============================================================

-- 1. Quantas tabelas subiram (esperado: mais de 50).
SELECT COUNT(*) AS tabelas
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- 2. As tabelas da esteira comercial existem?
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('missions','mission_leads','agent_events',
                     'ai_usage','provider_states','search_cache','leads')
ORDER BY table_name;

-- 3. Alguma tabela ficou SEM row level security? Deve vir vazio.
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = FALSE
ORDER BY tablename;

-- 4. Os crons apontam para o projeto certo? Confira a coluna command.
SELECT jobname, schedule,
       substring(command from 'https://[a-z0-9]+\.supabase\.co') AS projeto
FROM cron.job
ORDER BY jobname;

-- 5. Os gatilhos que fecham o funil da missão existem? Devem vir os dois.
SELECT tgname
FROM pg_trigger
WHERE tgname IN ('trg_mission_lead_on_reply', 'trg_mission_lead_on_meeting')
ORDER BY tgname;
