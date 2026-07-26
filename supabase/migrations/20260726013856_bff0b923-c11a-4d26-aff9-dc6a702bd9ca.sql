DELETE FROM public.subscriptions WHERE user_id = '4ab898dc-d738-4e01-ab2d-48e7554af43d';
INSERT INTO public.subscriptions (user_id, plan, status, started_at, expires_at)
VALUES ('4ab898dc-d738-4e01-ab2d-48e7554af43d', 'enterprise', 'active', NOW(), NOW() + INTERVAL '100 years');