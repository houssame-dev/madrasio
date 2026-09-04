import 'server-only';

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

import { getServerEnv } from '@/lib/config/env';

export interface AuthAdminPort {
  getUserById(id: string): Promise<User | null>;
  inviteUserByEmail(email: string, redirectTo: string): Promise<User>;
  deleteUser(id: string): Promise<void>;
}

class SupabaseAuthAdmin implements AuthAdminPort {
  constructor(private readonly client: SupabaseClient) {}

  async getUserById(id: string): Promise<User | null> {
    const result = await this.client.auth.admin.getUserById(id);
    if (result.error) {
      if (result.error.status === 404) return null;
      throw result.error;
    }
    return result.data.user;
  }

  async inviteUserByEmail(email: string, redirectTo: string): Promise<User> {
    const result = await this.client.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (result.error || !result.data.user) throw result.error ?? new Error('Invite failed.');
    return result.data.user;
  }

  async deleteUser(id: string): Promise<void> {
    const result = await this.client.auth.admin.deleteUser(id);
    if (result.error) throw result.error;
  }
}

let cachedAdmin: AuthAdminPort | undefined;

/** Server-only Auth Admin authority. Never use this client for application data access. */
export function getAuthAdmin(): AuthAdminPort {
  if (cachedAdmin) return cachedAdmin;
  const env = getServerEnv();
  if (!env.SUPABASE_SECRET_KEY) {
    throw new Error('Supabase Auth Admin is not configured.');
  }
  cachedAdmin = new SupabaseAuthAdmin(createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));
  return cachedAdmin;
}
