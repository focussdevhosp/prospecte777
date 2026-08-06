import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { RocketTransition } from '@/components/auth/RocketTransition';

import { supabase } from '@/integrations/supabase/client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Loader2, ArrowRight, Mail, User, Eye, EyeOff, Shield, Zap, Sparkles, CheckCircle2 } from 'lucide-react';
import logoImg from '@/assets/logo.webp';

export default function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signInWithEmail, signUpWithEmail, loading, user } = useAuth();
  const { toast } = useToast();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showRocketTransition, setShowRocketTransition] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  useEffect(() => {
    if (searchParams.get('reset') === 'true') {
      setShowResetPassword(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (user && !showResetPassword && !showRocketTransition) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate, showResetPassword, showRocketTransition, user]);

  const handleRocketComplete = useCallback(() => {
    navigate('/dashboard', { replace: true });
  }, [navigate]);

  if (user && !showResetPassword && !showRocketTransition) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setAuthError('');

    if (isSignUp) {
      const { error } = await signUpWithEmail(email, password, name);
      if (error) {
        setAuthError(error.message);
      } else {
        toast({ title: 'Cadastro realizado!', description: 'Verifique seu e-mail para confirmar a conta.' });
      }
      setIsSubmitting(false);
    } else {
      const { error } = await signInWithEmail(email, password);
      if (error) {
        setAuthError(error.message);
        setIsSubmitting(false);
      } else {
        setShowRocketTransition(true);
      }
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        toast({ title: 'Erro ao redefinir senha', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Senha redefinida!', description: 'Sua senha foi atualizada com sucesso.' });
        setShowResetPassword(false);
        navigate('/dashboard');
      }
    } catch {
      toast({ title: 'Erro inesperado', description: 'Tente novamente mais tarde.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showRocketTransition) {
    return <RocketTransition isActive={showRocketTransition} onComplete={handleRocketComplete} />;
  }

  if (showResetPassword) {
    return (
      <main className="relative w-screen h-screen overflow-hidden bg-[#07080E]">
        <div className="relative z-10 flex items-center justify-center w-full h-full p-4">
          <div className="w-full max-w-sm animate-scale-in">
            <div className="relative p-8 space-y-6 rounded-3xl border border-white/[0.08] overflow-hidden"
              style={{ background: 'linear-gradient(145deg, rgba(15,15,25,0.9), rgba(10,10,18,0.95))' }}>
              <div className="absolute inset-0 bg-gradient-to-br from-[#7B2FF2]/5 via-transparent to-[#E91E8C]/5 pointer-events-none" />
              <div className="relative z-10 space-y-6">
                <img src={logoImg} alt="NexaProspect" className="h-10 w-auto mx-auto" width={40} height={40} />
                <div className="text-center">
                  <h1 className="text-xl font-bold text-white">Redefinir Senha</h1>
                  <p className="text-sm text-white/40 mt-1">Digite sua nova senha abaixo</p>
                </div>
                <form onSubmit={handleResetPassword} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="new-password" className="text-white/50 text-xs">Nova Senha</Label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                      <Input id="new-password" type="password" placeholder="Mínimo 6 caracteres"
                        className="pl-10 h-12 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/20 rounded-xl focus:border-[#7B2FF2]/50 focus:ring-[#7B2FF2]/20"
                        value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} required />
                    </div>
                  </div>
                  <button type="submit" disabled={isSubmitting}
                    className="w-full h-12 rounded-xl font-semibold text-white text-sm flex items-center justify-center gap-2 transition-all duration-300 active:scale-[0.98] disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #7B2FF2, #E91E8C)' }}>
                    {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />Salvando...</> : <>Salvar Nova Senha<ArrowRight className="h-4 w-4" /></>}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (showForgotPassword) {
    return (
      <main className="relative w-screen h-screen overflow-hidden bg-[#07080E]">
        <div className="relative z-10 flex items-center justify-center w-full h-full p-4">
          <div className="w-full max-w-sm animate-scale-in">
            <ForgotPasswordForm onBack={() => setShowForgotPassword(false)} />
          </div>
        </div>
      </main>
    );
  }

  const passwordStrength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 8 ? 2 : password.length < 12 ? 3 : 4;
  const strengthColors = ['', '#ef4444', '#f59e0b', '#22c55e', '#7B2FF2'];
  const strengthLabels = ['', 'Fraca', 'Razoável', 'Boa', 'Excelente!'];

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#07080E]">


      <div className="relative z-10 flex items-center justify-center w-full h-full p-4">
        <div className="w-full max-w-[420px] animate-scale-in">
          {/* Main card */}
          <div className="relative rounded-3xl overflow-hidden">
            {/* Gradient border effect */}
            <div className="absolute -inset-px rounded-3xl z-0"
              style={{ background: 'linear-gradient(145deg, rgba(123,47,242,0.3), rgba(233,30,140,0.15), rgba(0,180,216,0.1), transparent 60%)' }} />

            <div className="relative z-10 m-px rounded-3xl p-8 md:p-10"
              style={{ background: 'linear-gradient(145deg, rgba(12,14,22,0.97), rgba(8,9,16,0.99))' }}>
              
              {/* Inner ambient glow */}
              <div className="absolute inset-0 rounded-3xl pointer-events-none overflow-hidden">
                <div className="absolute -top-20 -right-20 w-40 h-40 opacity-[0.07]"
                  style={{ background: 'radial-gradient(circle, #7B2FF2, transparent 70%)' }} />
                <div className="absolute -bottom-10 -left-10 w-32 h-32 opacity-[0.05]"
                  style={{ background: 'radial-gradient(circle, #E91E8C, transparent 70%)' }} />
              </div>

              <div className="relative z-10 space-y-7">
                {/* Logo & Header */}
                <div className="text-center space-y-3">
                  <div className="relative inline-block">
                    <img src={logoImg} alt="NexaProspect" className="h-14 w-auto mx-auto drop-shadow-[0_0_20px_rgba(123,47,242,0.3)]" width={56} height={56} />
                    {/* Pulse ring behind logo */}
                    <div className="absolute -inset-3 rounded-full opacity-20 animate-pulse"
                      style={{ background: 'radial-gradient(circle, rgba(123,47,242,0.3), transparent 70%)' }} />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">
                      {isSignUp ? 'Crie sua conta' : 'Bem-vindo de volta'}
                    </h1>
                    <p className="text-[13px] text-white/35 mt-1">
                      {isSignUp ? 'Comece a prospectar em 5 minutos' : 'Entre para continuar prospectando'}
                    </p>
                  </div>
                </div>

                {/* Error */}
                {authError && (
                  <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 animate-fade-in">
                    <p className="text-[13px] text-destructive">{authError}</p>
                  </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-5">
                  {/* Name (sign up only) */}
                  {isSignUp && (
                    <div className="space-y-1.5 animate-fade-in">
                      <label className="text-[11px] font-medium text-white/30 uppercase tracking-wider">Nome completo</label>
                      <div className={`relative rounded-xl transition-all duration-300 ${focusedField === 'name' ? 'ring-2 ring-[#7B2FF2]/30' : ''}`}>
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                        <input
                          type="text"
                          className="w-full h-12 pl-10 pr-4 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm placeholder:text-white/15 focus:outline-none focus:border-[#7B2FF2]/40 transition-colors"
                          placeholder="Seu nome"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          onFocus={() => setFocusedField('name')}
                          onBlur={() => setFocusedField(null)}
                          required
                        />
                      </div>
                    </div>
                  )}

                  {/* Email */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-white/30 uppercase tracking-wider">E-mail</label>
                    <div className={`relative rounded-xl transition-all duration-300 ${focusedField === 'email' ? 'ring-2 ring-[#7B2FF2]/30' : ''}`}>
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                      <input
                        type="email"
                        className="w-full h-12 pl-10 pr-4 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm placeholder:text-white/15 focus:outline-none focus:border-[#7B2FF2]/40 transition-colors"
                        placeholder="seu@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onFocus={() => setFocusedField('email')}
                        onBlur={() => setFocusedField(null)}
                        required
                      />
                      {email.includes('@') && email.includes('.') && (
                        <CheckCircle2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-success/60" />
                      )}
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-medium text-white/30 uppercase tracking-wider">Senha</label>
                      {!isSignUp && (
                        <button type="button" className="text-[11px] text-[#7B2FF2]/60 hover:text-[#7B2FF2] transition-colors"
                          onClick={() => setShowForgotPassword(true)}>
                          Esqueceu?
                        </button>
                      )}
                    </div>
                    <div className={`relative rounded-xl transition-all duration-300 ${focusedField === 'password' ? 'ring-2 ring-[#7B2FF2]/30' : ''}`}>
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className="w-full h-12 pl-10 pr-12 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white text-sm placeholder:text-white/15 focus:outline-none focus:border-[#7B2FF2]/40 transition-colors"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onFocus={() => setFocusedField('password')}
                        onBlur={() => setFocusedField(null)}
                        minLength={6}
                        required
                      />
                      <button type="button"
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 transition-colors"
                        onClick={() => setShowPassword(!showPassword)}>
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>

                    {/* Password strength */}
                    {isSignUp && password.length > 0 && (
                      <div className="space-y-1 animate-fade-in pt-1">
                        <div className="flex gap-1">
                          {[1, 2, 3, 4].map(level => (
                            <div key={level} className="h-[3px] flex-1 rounded-full transition-all duration-500"
                              style={{ background: passwordStrength >= level ? strengthColors[level] : 'rgba(255,255,255,0.06)' }} />
                          ))}
                        </div>
                        <p className="text-[10px] text-white/25">{strengthLabels[passwordStrength]}</p>
                      </div>
                    )}
                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={isSubmitting || loading}
                    className="group relative w-full h-[52px] rounded-xl font-semibold text-white text-[14px] flex items-center justify-center gap-2 overflow-hidden transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-[0_8px_30px_rgba(123,47,242,0.25)]"
                    style={{ background: 'linear-gradient(135deg, #7B2FF2, #9B4DFF)' }}
                  >
                    {/* Shimmer effect */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                      style={{ background: 'linear-gradient(135deg, #7B2FF2, #E91E8C)' }} />
                    
                    <span className="relative z-10 flex items-center gap-2">
                      {isSubmitting || loading ? (
                        <><Loader2 className="h-4 w-4 animate-spin" />Aguarde...</>
                      ) : (
                        <>
                          {isSignUp ? <><Sparkles className="h-4 w-4" />Criar conta</> : <>Entrar<ArrowRight className="h-4 w-4 transform group-hover:translate-x-1 transition-transform" /></>}
                        </>
                      )}
                    </span>
                  </button>
                </form>

                {/* Toggle */}
                <p className="text-center text-[13px] text-white/30">
                  {isSignUp ? 'Já tem uma conta?' : 'Não tem uma conta?'}{' '}
                  <button type="button"
                    className="font-semibold text-[#7B2FF2]/80 hover:text-[#7B2FF2] transition-colors"
                    onClick={() => { setIsSignUp(!isSignUp); setAuthError(''); }}>
                    {isSignUp ? 'Entrar' : 'Criar conta'}
                  </button>
                </p>
              </div>
            </div>
          </div>

          {/* Trust signals */}
          <div className="mt-8 flex items-center justify-center gap-6">
            <span className="flex items-center gap-1.5 text-[11px] text-white/15">
              <Shield className="h-3 w-3" /> Dados protegidos
            </span>
            <span className="h-3 w-px bg-white/[0.06]" />
            <span className="flex items-center gap-1.5 text-[11px] text-white/15">
              <Zap className="h-3 w-3" /> Setup em 5 min
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
