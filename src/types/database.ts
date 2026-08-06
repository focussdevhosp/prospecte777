// Database types for Prospecte

export type LeadStage = 'Contato' | 'Qualificado' | 'Proposta' | 'Negociação' | 'Ganho' | 'Perdido';
export type LeadTemperature = 'quente' | 'morno' | 'frio';
export type MessageSenderType = 'agent' | 'lead' | 'user';
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
export type MeetingStatus = 'scheduled' | 'completed' | 'cancelled' | 'no_show';

// Agent configuration types
export type AgentType = 'consultivo' | 'agressivo' | 'amigavel' | 'tecnico' | 'empatico';
export type CommunicationStyle = 'formal' | 'casual' | 'profissional' | 'descontraido';
export type ResponseLength = 'curto' | 'medio' | 'longo';
export type EmojiUsage = 'nenhum' | 'minimo' | 'moderado' | 'frequente';
export type ObjectionHandling = 'suave' | 'assertivo' | 'persistente';
export type ClosingStyle = 'consultivo' | 'direto' | 'urgencia' | 'beneficio';
export type FollowUpTone = 'amigavel' | 'profissional' | 'curioso' | 'preocupado';
export type GreetingStyle = 'padrao' | 'personalizado' | 'criativo' | 'minimalista';
export type ValuePropositionFocus = 'beneficios' | 'resultados' | 'economia' | 'exclusividade';

export interface PersonalityTrait {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

export interface Profile {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

// Search API preference type
export type PreferredSearchApi = 'serper' | 'serpapi';

export interface UserSettings {
  id: string;
  user_id: string;
  // Basic Agent Settings
  agent_name: string;
  agent_persona: string;
  knowledge_base: string;
  onboarding_completed?: boolean;
  onboarding_niche?: string | null;
  services_offered: string[];
  message_variations: MessageVariation[];
  // Advanced Agent Configuration
  agent_type: AgentType;
  personality_traits: PersonalityTrait[];
  communication_style: CommunicationStyle;
  response_length: ResponseLength;
  emoji_usage: EmojiUsage;
  objection_handling: ObjectionHandling;
  closing_style: ClosingStyle;
  follow_up_tone: FollowUpTone;
  greeting_style: GreetingStyle;
  value_proposition_focus: ValuePropositionFocus;
  // Prospecting Settings
  target_niches: string[];
  target_locations: string[];
  // WhatsApp Connection
  whatsapp_instance_id: string | null;
  whatsapp_connected: boolean;
  // Webhook
  webhook_url: string | null;
  webhook_events: string[];
  // Notifications
  email_notifications: boolean;
  daily_report_enabled: boolean;
  // Security
  hunter_api_token: string;
  // User's own API keys
  deepseek_api_key: string | null;
  serpapi_api_key: string | null;
  serper_api_key: string | null;
  preferred_search_api: PreferredSearchApi;
  // Automation & Security Settings
  daily_message_limit: number;
  message_interval_seconds: number;
  auto_start_hour: number;
  auto_end_hour: number;
  auto_prospecting_enabled: boolean;
  blacklist: string[];
  // Anti-Block Settings
  work_days_only: boolean;
  operate_all_day: boolean;
  warmup_enabled: boolean;
  warmup_day: number;
  warmup_start_date: string | null;
  randomize_interval: boolean;
  randomize_order: boolean;
  typing_simulation: boolean;
  pause_on_error: boolean;
  cooldown_after_batch: boolean;
  batch_size: number;
  cooldown_minutes: number;
  // Additional Anti-Block Settings
  hourly_message_limit: number;
  message_interval_max: number;
  max_consecutive_errors: number;
  pause_duration_minutes: number;
  typing_delay_ms: number;
  read_receipt_delay: boolean;
  auto_slowdown: boolean;
  slowdown_threshold: number;
  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface MessageVariation {
  id: string;
  name: string;
  template: string;
  active: boolean;
}

/**
 * Resultado da auditoria do site do lead. Cada achado é uma verificação
 * objetiva no HTML e vira um argumento de venda concreto.
 */
export interface LeadSiteFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  impact: string;
  opportunity: string;
}

export interface LeadSiteAudit {
  url: string | null;
  reachable: boolean;
  status?: number;
  score: number;
  findings: LeadSiteFinding[];
  pitch: string;
  checked_at: string;
}

export interface Lead {
  id: string;
  user_id: string;
  business_name: string;
  phone: string;
  email: string | null;
  website: string | null;
  address: string | null;
  niche: string | null;
  location: string | null;
  pain_points: string[] | null;
  analyzed_needs: Record<string, any>;
  stage: LeadStage;
  temperature: LeadTemperature;
  conversation_summary: string | null;
  source: string;
  google_maps_url: string | null;
  last_contact_at: string | null;
  last_response_at: string | null;
  follow_up_count: number;
  next_follow_up_at: string | null;
  quality_score: number | null;
  rating: number | null;
  reviews_count: number | null;
  best_contact_hour: number | null;
  tags: string[] | null;
  // Lead Scoring
  lead_score: number;
  score_factors: Record<string, number>;
  last_scored_at: string | null;
  // Team
  team_id: string | null;
  assigned_to: string | null;
  // Message Status
  message_sent: boolean;
  // Deal & Tasks
  deal_value: number | null;
  tasks: any[] | null;
  notes: string | null;
  // Estado do agente SDR nesta conversa
  agent_status: 'active' | 'paused' | 'handoff' | 'opted_out';
  agent_paused_reason: string | null;
  agent_paused_at: string | null;
  agent_replies_today: number;
  agent_replies_date: string | null;
  // Auditoria do site do lead
  site_audit: LeadSiteAudit | null;
  site_audited_at: string | null;
  // Social URLs
  instagram_url: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  // Company info
  employee_count: string | null;
  founded_year: number | null;
  company_description: string | null;
  service_opportunities: string[] | null;
  total_messages_exchanged: number | null;
  photo_url: string | null;
  industry: string | null;
  hunter_email: string | null;
  hunter_email_confidence: number | null;
  enriched_at: string | null;
  ai_memory_summary: string | null;
  lead_group: string | null;
  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface LeadTask {
  id: string;
  text: string;
  priority: 'alta' | 'media' | 'baixa';
  due_date: string | null;
  done: boolean;
  created_at: string;
}

export interface LeadNote {
  text: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  lead_id: string;
  sender_type: MessageSenderType;
  content: string;
  whatsapp_message_id: string | null;
  status: MessageStatus;
  sent_at: string;
  created_at: string;
}

export interface Meeting {
  id: string;
  user_id: string;
  lead_id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: MeetingStatus;
  meeting_link: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  lead?: Lead;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  lead_id: string | null;
  activity_type: string;
  description: string;
  metadata: Record<string, any>;
  created_at: string;
  lead?: Lead;
}

export interface DashboardMetrics {
  totalLeads: number;
  leadsThisMonth: number;
  meetingsScheduled: number;
  meetingsThisWeek: number;
  conversionRate: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  leadsByStage: Record<LeadStage, number>;
}

// Predefined personality traits
export const PERSONALITY_TRAITS: Omit<PersonalityTrait, 'enabled'>[] = [
  { id: 'empático', name: 'Empático', description: 'Demonstra compreensão e se coloca no lugar do cliente' },
  { id: 'persuasivo', name: 'Persuasivo', description: 'Usa argumentos convincentes para guiar decisões' },
  { id: 'paciente', name: 'Paciente', description: 'Não pressiona e dá tempo para o cliente pensar' },
  { id: 'entusiasmado', name: 'Entusiasmado', description: 'Transmite energia e paixão pelo produto' },
  { id: 'analitico', name: 'Analítico', description: 'Foca em dados e resultados concretos' },
  { id: 'criativo', name: 'Criativo', description: 'Usa abordagens inovadoras e diferentes' },
  { id: 'confiante', name: 'Confiante', description: 'Demonstra segurança e autoridade no assunto' },
  { id: 'humilde', name: 'Humilde', description: 'Não é arrogante, admite limitações' },
  { id: 'direto', name: 'Direto', description: 'Vai ao ponto sem rodeios' },
  { id: 'detalhista', name: 'Detalhista', description: 'Explica tudo minuciosamente' },
  { id: 'humorado', name: 'Bem-humorado', description: 'Usa humor leve para quebrar o gelo' },
  { id: 'serio', name: 'Sério', description: 'Mantém tom profissional e formal' },
  { id: 'curioso', name: 'Curioso', description: 'Faz muitas perguntas para entender o cliente' },
  { id: 'proativo', name: 'Proativo', description: 'Antecipa necessidades e oferece soluções' },
  { id: 'resiliente', name: 'Resiliente', description: 'Não desiste facilmente de objeções' },
  { id: 'transparente', name: 'Transparente', description: 'É honesto sobre limitações e custos' },
  { id: 'educador', name: 'Educador', description: 'Ensina o cliente sobre o mercado e soluções' },
  { id: 'urgente', name: 'Senso de Urgência', description: 'Cria necessidade de ação rápida' },
  { id: 'colaborativo', name: 'Colaborativo', description: 'Trabalha junto com o cliente para encontrar soluções' },
  { id: 'exclusivo', name: 'Exclusivo', description: 'Faz o cliente se sentir especial e único' },
];

export const AGENT_TYPE_OPTIONS = [
  { value: 'consultivo', label: 'Consultivo', description: 'Foca em entender necessidades e aconselhar' },
  { value: 'agressivo', label: 'Agressivo', description: 'Pressiona para fechar negócios rapidamente' },
  { value: 'amigavel', label: 'Amigável', description: 'Constrói relacionamento antes de vender' },
  { value: 'tecnico', label: 'Técnico', description: 'Foca em especificações e detalhes técnicos' },
  { value: 'empatico', label: 'Empático', description: 'Prioriza entender as dores do cliente' },
];

export const COMMUNICATION_STYLE_OPTIONS = [
  { value: 'formal', label: 'Formal', description: 'Linguagem profissional e respeitosa' },
  { value: 'casual', label: 'Casual', description: 'Tom descontraído e informal' },
  { value: 'profissional', label: 'Profissional', description: 'Equilibrado entre formal e casual' },
  { value: 'descontraido', label: 'Descontraído', description: 'Muito informal, como amigo' },
];

export const RESPONSE_LENGTH_OPTIONS = [
  { value: 'curto', label: 'Curto', description: '1-2 frases objetivas' },
  { value: 'medio', label: 'Médio', description: '2-3 parágrafos balanceados' },
  { value: 'longo', label: 'Longo', description: 'Explicações detalhadas' },
];

export const EMOJI_USAGE_OPTIONS = [
  { value: 'nenhum', label: 'Nenhum', description: 'Sem emojis' },
  { value: 'minimo', label: 'Mínimo', description: 'Apenas no final' },
  { value: 'moderado', label: 'Moderado', description: 'Alguns emojis contextualmente' },
  { value: 'frequente', label: 'Frequente', description: 'Muitos emojis' },
];

export const OBJECTION_HANDLING_OPTIONS = [
  { value: 'suave', label: 'Suave', description: 'Aceita objeções e não insiste' },
  { value: 'assertivo', label: 'Assertivo', description: 'Contorna com argumentos sólidos' },
  { value: 'persistente', label: 'Persistente', description: 'Não desiste facilmente' },
];

export const CLOSING_STYLE_OPTIONS = [
  { value: 'consultivo', label: 'Consultivo', description: 'Sugere quando fizer sentido' },
  { value: 'direto', label: 'Direto', description: 'Pede a venda diretamente' },
  { value: 'urgencia', label: 'Urgência', description: 'Cria senso de urgência' },
  { value: 'beneficio', label: 'Benefício', description: 'Foca nos ganhos do cliente' },
];

export const FOLLOW_UP_TONE_OPTIONS = [
  { value: 'amigavel', label: 'Amigável', description: 'Tom leve e descontraído' },
  { value: 'profissional', label: 'Profissional', description: 'Direto e respeitoso' },
  { value: 'curioso', label: 'Curioso', description: 'Pergunta como está indo' },
  { value: 'preocupado', label: 'Preocupado', description: 'Demonstra preocupação genuína' },
];

export const GREETING_STYLE_OPTIONS = [
  { value: 'padrao', label: 'Padrão', description: 'Olá, tudo bem?' },
  { value: 'personalizado', label: 'Personalizado', description: 'Menciona nome da empresa' },
  { value: 'criativo', label: 'Criativo', description: 'Abordagem diferente e única' },
  { value: 'minimalista', label: 'Minimalista', description: 'Direto ao assunto' },
];

export const VALUE_PROPOSITION_OPTIONS = [
  { value: 'beneficios', label: 'Benefícios', description: 'Foca no que o cliente ganha' },
  { value: 'resultados', label: 'Resultados', description: 'Números e cases de sucesso' },
  { value: 'economia', label: 'Economia', description: 'Foca em ROI e redução de custos' },
  { value: 'exclusividade', label: 'Exclusividade', description: 'Destaca diferenciais únicos' },
];
