import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminRole } from '@/hooks/use-admin';
import { Navigate } from 'react-router-dom';
import { Loader2, Crown, Users, Headphones, Database } from 'lucide-react';
import { AdminUsersTab } from '@/components/admin/AdminUsersTab';
import { AdminSupportTab } from '@/components/admin/AdminSupportTab';
import { AdminDataSourcesTab } from '@/components/admin/AdminDataSourcesTab';

export default function AdminPage() {
  const { isAdmin, isLoading: checkingAdmin } = useAdminRole();
  const [activeTab, setActiveTab] = useState('users');

  if (checkingAdmin) {
    return (
      <DashboardLayout
      eyebrow="Conta"
      title="Admin"
    >
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Verificando permissões...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <DashboardLayout
      eyebrow="Conta"
      title="Painel Admin"
      description="Gerencie usuários e suporte da plataforma"
    >
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
            <Crown className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Administração</h2>
            <p className="text-xs text-muted-foreground">Gerencie toda a plataforma</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-xl grid-cols-3">
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" />
              Usuários
            </TabsTrigger>
            <TabsTrigger value="support" className="gap-2">
              <Headphones className="h-4 w-4" />
              Suporte
            </TabsTrigger>
            <TabsTrigger value="sources" className="gap-2">
              <Database className="h-4 w-4" />
              Fontes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="mt-6">
            <AdminUsersTab />
          </TabsContent>

          <TabsContent value="support" className="mt-6">
            <AdminSupportTab />
          </TabsContent>

          {/* Infraestrutura de busca. Só o admin da plataforma vê: para o
              cliente existe apenas "a busca". */}
          <TabsContent value="sources" className="mt-6">
            <AdminDataSourcesTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
