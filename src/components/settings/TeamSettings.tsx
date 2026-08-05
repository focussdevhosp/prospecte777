import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useTeams, useTeamMembers, useTeamInvites, Team } from '@/hooks/use-teams';
import { useAuth } from '@/lib/auth';
import { Users, UserPlus, Crown, Shield, User, Mail, Trash2, Plus, Settings } from 'lucide-react';

export function TeamSettings() {
  const { user } = useAuth();
  const { teams, teamsLoading, createTeam, deleteTeam, isCreating } = useTeams();
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [newTeamName, setNewTeamName] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const handleCreateTeam = () => {
    if (!newTeamName.trim()) return;
    createTeam(newTeamName, {
      onSuccess: () => {
        setNewTeamName('');
        setCreateDialogOpen(false);
      },
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Minhas Equipes
              </CardTitle>
              <CardDescription>
                Gerencie suas equipes e colaboradores
              </CardDescription>
            </div>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Equipe
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Nova Equipe</DialogTitle>
                  <DialogDescription>
                    Crie uma equipe para colaborar com outros usuários
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="team-name">Nome da Equipe</Label>
                    <Input
                      id="team-name"
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      placeholder="Ex: Equipe de Vendas"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleCreateTeam} disabled={isCreating || !newTeamName.trim()}>
                    {isCreating ? 'Criando...' : 'Criar Equipe'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {teamsLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Carregando equipes...
            </div>
          ) : teams.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Você ainda não tem nenhuma equipe.
              </p>
              <p className="text-sm text-muted-foreground">
                Crie uma equipe para colaborar com outros usuários.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {teams.map((team) => (
                <div
                  key={team.id}
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    selectedTeam?.id === team.id
                      ? 'border-primary bg-primary/5'
                      : 'hover:border-primary/50'
                  }`}
                  onClick={() => setSelectedTeam(team)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium">{team.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {team.owner_id === user?.id ? (
                            <span className="flex items-center gap-1">
                              <Crown className="h-3 w-3 text-warning" />
                              Proprietário
                            </span>
                          ) : (
                            'Membro'
                          )}
                        </p>
                      </div>
                    </div>
                    {team.owner_id === user?.id && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir Equipe</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja excluir a equipe "{team.name}"? 
                              Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteTeam(team.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedTeam && (
        <TeamManagement team={selectedTeam} />
      )}
    </div>
  );
}

function TeamManagement({ team }: { team: Team }) {
  const { user } = useAuth();
  const { members, isLoading: membersLoading, removeMember, updateMemberRole } = useTeamMembers(team.id);
  const { invites, sendInvite, cancelInvite, isSending } = useTeamInvites(team.id);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);

  const isOwner = team.owner_id === user?.id;
  const currentMember = members.find(m => m.user_id === user?.id);
  const canManage = isOwner || currentMember?.role === 'admin';

  const handleSendInvite = () => {
    if (!inviteEmail.trim()) return;
    sendInvite({ email: inviteEmail, role: inviteRole }, {
      onSuccess: () => {
        setInviteEmail('');
        setInviteDialogOpen(false);
      },
    });
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return <Crown className="h-4 w-4 text-warning" />;
      case 'admin':
        return <Shield className="h-4 w-4 text-primary" />;
      default:
        return <User className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'owner':
        return <Badge variant="default" className="bg-warning/20 text-warning dark:text-warning">Proprietário</Badge>;
      case 'admin':
        return <Badge variant="default" className="bg-primary/20 text-primary">Admin</Badge>;
      default:
        return <Badge variant="secondary">Membro</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {team.name}
            </CardTitle>
            <CardDescription>
              Gerencie os membros e convites desta equipe
            </CardDescription>
          </div>
          {canManage && (
            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Convidar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Convidar Membro</DialogTitle>
                  <DialogDescription>
                    Envie um convite para adicionar um novo membro à equipe
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="invite-email">Email</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="email@exemplo.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cargo</Label>
                    <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as 'admin' | 'member')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Membro</SelectItem>
                        <SelectItem value="admin">Administrador</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleSendInvite} disabled={isSending || !inviteEmail.trim()}>
                    {isSending ? 'Enviando...' : 'Enviar Convite'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Members */}
        <div>
          <h4 className="text-sm font-medium mb-3">Membros ({members.length})</h4>
          {membersLoading ? (
            <p className="text-sm text-muted-foreground">Carregando membros...</p>
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={member.profile?.avatar_url || undefined} />
                      <AvatarFallback>
                        {member.profile?.full_name?.[0] || member.profile?.email?.[0] || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">
                        {member.profile?.full_name || member.profile?.email || 'Usuário'}
                        {member.user_id === user?.id && (
                          <span className="text-muted-foreground ml-1">(você)</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {member.profile?.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getRoleBadge(member.role)}
                    {canManage && member.role !== 'owner' && member.user_id !== user?.id && (
                      <>
                        <Select
                          value={member.role}
                          onValueChange={(v) => updateMemberRole({ memberId: member.id, role: v as 'admin' | 'member' })}
                        >
                          <SelectTrigger className="w-28 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Membro</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => removeMember(member.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending Invites */}
        {invites.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-3">Convites Pendentes ({invites.length})</h4>
            <div className="space-y-2">
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-dashed"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{invite.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Expira em {new Date(invite.expires_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getRoleBadge(invite.role)}
                    {canManage && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => cancelInvite(invite.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
