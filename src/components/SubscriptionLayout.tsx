import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { SubscriptionGuard } from '@/components/SubscriptionGuard';

interface SubscriptionLayoutProps {
  children: ReactNode;
}

// Rotas públicas — nunca passam pelo guard
const PUBLIC_ROUTES = ['/', '/auth'];

export function SubscriptionLayout({ children }: SubscriptionLayoutProps) {
  const location = useLocation();

  const isPublic = PUBLIC_ROUTES.includes(location.pathname);
  if (isPublic) return <>{children}</>;

  return <SubscriptionGuard>{children}</SubscriptionGuard>;
}
