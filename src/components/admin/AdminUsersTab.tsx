import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAdminUsers } from '@/hooks/use-admin';
import { useToast } from '@/hooks/use-toast';
import {
  Users, MessageSquare, Smartphone, Target, Search, Trash2, Loader2,
  Shield, ShieldCheck, CheckCircle2, XCircle, RefreshCw, Activity,
  TrendingUp, UserCheck, Zap, Ban, Unlock, Send,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQueryClient } from '@tanstack/react-query';

const statCards = [
  { key: 'total_users', label: 'Total Usuários', icon: Users, color: 'text-primary', bg: 'bg-primary/10', gradient: 'from-primary/20 to-primary/5' },
  { key: 'connected_whatsapp', label: 'WhatsApp Conectado', icon: Smartphone, color: 'text-success', bg: 'bg-success/10', gradient: 'from-success/20 to-success/5' },
  { key: 'total_leads', label: 'Total Leads', icon: Target, color: 'text-info', bg: 'bg-info/10', gradient: 'from-info/20 to-info/5' },
  { key: 'total_messages', label: 'Total Mensagens', icon: MessageSquare, color: 'text-primary', bg: 'bg-primary/10', gradient: 'from-primary/20 to-primary/5' },
] as const;

export function AdminUsersTab() {
  const { users, stats, loadingUsers, loadingStats, deleteUser, isDeletingUser, blockUser, isBlockingUser, unblockUser, isUnblockingUser, sendNotification, isSendingNotification } = useAdminUsers();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; email: string } | null>(null);
  const [blockTarget, setBlockTarget] = useState<{ id: string; email: string; action: 'block' | 'unblock' } | null>(null);
  const [messageTarget, setMessageTarget] = useState<{ id: string; email: string } | null>(null);
  const [msgTitle, setMsgTitle] = useState('');
  const [msgContent, setMsgContent] = useState('');

  const filteredUsers = users.filter(
    (u) =>
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  const activeUsers = users.filter(u => {
    if (!u.last_sign_in_at) return false;
    const lastLogin = new Date(u.last_sign_in_at);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return lastLogin > sevenDaysAgo;
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    toast({ title: '🔄 Atualizando...', description: 'Dados sendo recarregados.' });
  };

  const handleDelete = (userId: string) => {
    deleteUser(userId, {
      onSuccess: () => {
        toast({ title: '✓ Usuário removido' });
        setDeleteTarget(null);
      },
      onError: (err: any) => {
        toast({ title: 'Erro', description: err.message, variant: 'destructive' });
      },
    });
  };

  const handleBlockAction = () => {
    if (!blockTarget) return;
    if (blockTarget.action === 'block') {
      blockUser({ userId: blockTarget.id }, {
        onSuccess: () => {
          toast({ title: '🚫 Usuário bloqueado', description: blockTarget.email });
          setBlockTarget(null);
        },
        onError: (err: any) => {
          toast({ title: 'Erro', description: err.message, variant: 'destructive' });
        },
      });
    } else {
      unblockUser(blockTarget.id, {
        onSuccess: () => {
          toast({ title: '✅ Usuário desbloqueado', description: blockTarget.email });
          setBlockTarget(null);
        },
        onError: (err: any) => {
          toast({ title: 'Erro', description: err.message, variant: 'destructive' });
        },
      });
    }
  };

  const handleSendMessage = () => {
    if (!messageTarget || !msgTitle.trim() || !msgContent.trim()) return;
    sendNotification({ userId: messageTarget.id, title: msgTitle, message: msgContent }, {
      onSuccess: () => {
        toast({ title: '✓ Mensagem enviada', description: `Para: ${messageTarget.email}` });
        setMessageTarget(null);
        setMsgTitle('');
        setMsgContent('');
      },
      onError: (err: any) => {
        toast({ title: 'Erro', description: err.message, variant: 'destructive' });
      },
    });
  };

  const getStatValue = (key: string) => {
    if (loadingStats || !stats) return null;
    const val = stats[key as keyof typeof stats];
    return typeof val === 'number' ? val : 0;
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {users.length} usuários • {activeUsers.length} ativos nos últimos 7 dias
          </p>
          <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {statCards.map((s) => {
            const Icon = s.icon;
            const value = getStatValue(s.key);
            return (
              <Card key={s.key} className="relative overflow-hidden border-border/50 hover:border-border transition-colors">
                <div className={`absolute inset-0 bg-gradient-to-br ${s.gradient} opacity-50`} />
                <CardContent className="relative pt-5 pb-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{s.label}</p>
                      <p className="text-2xl font-bold tabular-nums">
                        {value !== null ? value.toLocaleString('pt-BR') : (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </p>
                    </div>
                    <div className={`p-2 rounded-lg ${s.bg}`}>
                      <Icon className={`h-4 w-4 ${s.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Quick Insights */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          <Card className="border-border/50">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-success/10">
                  <UserCheck className="h-4 w-4 text-success" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Taxa de Conexão WhatsApp</p>
                  <p className="text-lg font-bold">
                    {stats && stats.total_users > 0
                      ? `${Math.round((stats.connected_whatsapp / stats.total_users) * 100)}%`
                      : '—'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-info/10">
                  <TrendingUp className="h-4 w-4 text-info" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Leads por Usuário (média)</p>
                  <p className="text-lg font-bold">
                    {stats && stats.total_users > 0
                      ? Math.round(stats.total_leads / stats.total_users).toLocaleString('pt-BR')
                      : '—'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Zap className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Msgs por Usuário (média)</p>
                  <p className="text-lg font-bold">
                    {stats && stats.total_users > 0
                      ? Math.round(stats.total_messages / stats.total_users).toLocaleString('pt-BR')
                      : '—'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Users Table */}
        <Card className="border-border/50">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Shield className="h-4.5 w-4.5 text-primary" />
                Usuários
                <Badge variant="secondary" className="text-xs font-mono ml-1">{filteredUsers.length}</Badge>
              </CardTitle>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {loadingUsers ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Carregando usuários...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Users className="h-6 w-6 text-muted-foreground" />
                <p className="font-medium text-sm">Nenhum usuário encontrado</p>
              </div>
            ) : (
              <div className="overflow-x-auto -mx-6">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-6">Usuário</TableHead>
                      <TableHead className="text-center">WhatsApp</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Cadastro</TableHead>
                      <TableHead>Último acesso</TableHead>
                      <TableHead className="text-right pr-6">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((u) => (
                      <TableRow key={u.id} className="group">
                        <TableCell className="pl-6">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9 border border-border/50">
                              <AvatarFallback className="text-xs font-medium bg-muted/50">
                                {(u.full_name || u.email || '?').charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate max-w-[200px]">{u.full_name || '—'}</p>
                              <p className="text-xs text-muted-foreground truncate max-w-[200px]">{u.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Tooltip>
                            <TooltipTrigger>
                              {u.whatsapp_connected ? (
                                <CheckCircle2 className="h-4 w-4 text-success mx-auto" />
                              ) : (
                                <XCircle className="h-4 w-4 text-muted-foreground/50 mx-auto" />
                              )}
                            </TooltipTrigger>
                            <TooltipContent>{u.whatsapp_connected ? 'Conectado' : 'Desconectado'}</TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="text-center">
                          {u.is_blocked ? (
                            <Badge variant="destructive" className="text-[10px]">Bloqueado</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-success border-success/30">Ativo</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {u.roles.includes('admin') ? (
                            <Badge className="bg-primary/15 text-primary border-primary/20 text-[10px] font-semibold gap-1">
                              <ShieldCheck className="h-3 w-3" />
                              Admin
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/50">Usuário</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(u.created_at), { addSuffix: true, locale: ptBR })}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {u.last_sign_in_at
                              ? formatDistanceToNow(new Date(u.last_sign_in_at), { addSuffix: true, locale: ptBR })
                              : 'Nunca'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          {!u.roles.includes('admin') && (
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                                    onClick={() => setMessageTarget({ id: u.id, email: u.email })}
                                  >
                                    <Send className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Enviar mensagem</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className={`h-8 w-8 ${u.is_blocked ? 'text-success hover:text-success' : 'text-muted-foreground hover:text-warning'}`}
                                    onClick={() => setBlockTarget({ id: u.id, email: u.email, action: u.is_blocked ? 'unblock' : 'block' })}
                                  >
                                    {u.is_blocked ? <Unlock className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{u.is_blocked ? 'Desbloquear' : 'Bloquear'}</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={() => setDeleteTarget({ id: u.id, email: u.email })}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Excluir</TooltipContent>
                              </Tooltip>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Excluir usuário?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong className="text-foreground">{deleteTarget?.email}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDelete(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeletingUser}
            >
              {isDeletingUser ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Block/Unblock Confirmation */}
      <AlertDialog open={!!blockTarget} onOpenChange={() => setBlockTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {blockTarget?.action === 'block' ? (
                <><Ban className="h-5 w-5 text-warning" /> Bloquear usuário?</>
              ) : (
                <><Unlock className="h-5 w-5 text-success" /> Desbloquear usuário?</>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {blockTarget?.action === 'block'
                ? <>O usuário <strong className="text-foreground">{blockTarget?.email}</strong> será impedido de acessar a plataforma.</>
                : <>O usuário <strong className="text-foreground">{blockTarget?.email}</strong> poderá acessar a plataforma novamente.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBlockAction}
              className={blockTarget?.action === 'block' ? 'bg-warning text-white hover:bg-warning' : 'bg-success text-white hover:bg-success'}
              disabled={isBlockingUser || isUnblockingUser}
            >
              {(isBlockingUser || isUnblockingUser) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {blockTarget?.action === 'block' ? 'Bloquear' : 'Desbloquear'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send Message Dialog */}
      <Dialog open={!!messageTarget} onOpenChange={() => { setMessageTarget(null); setMsgTitle(''); setMsgContent(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Enviar mensagem para {messageTarget?.email}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Título</label>
              <Input
                placeholder="Título da mensagem..."
                value={msgTitle}
                onChange={(e) => setMsgTitle(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Mensagem</label>
              <Textarea
                placeholder="Digite sua mensagem..."
                value={msgContent}
                onChange={(e) => setMsgContent(e.target.value)}
                rows={4}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setMessageTarget(null); setMsgTitle(''); setMsgContent(''); }}>
              Cancelar
            </Button>
            <Button onClick={handleSendMessage} disabled={isSendingNotification || !msgTitle.trim() || !msgContent.trim()}>
              {isSendingNotification ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
