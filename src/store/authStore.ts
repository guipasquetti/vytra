import type { Session, User } from "@supabase/supabase-js";
import { create } from "zustand";

import { getProfile, isProfessional, type Profile } from "@/services/authService";
import { supabase } from "@/lib/supabase";

interface AuthStore {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isProfessional: boolean;
  isLoading: boolean;
  /** false enquanto profile/professional do usuário logado ainda não foram buscados. */
  profileLoaded: boolean;
  initialize: () => Promise<void>;
  setProfile: (profile: Profile) => void;
}

/** Um único listener por vez: `initialize` roda de novo no remount do layout (fast refresh, volta
 * de background em alguns fluxos) e cada chamada empilhava mais um `onAuthStateChange`. */
let authListener: { unsubscribe: () => void } | null = null;

async function loadProfile(userId: string) {
  const [profile, professional] = await Promise.all([getProfile(userId), isProfessional(userId)]);
  return { profile, professional };
}

export const useAuthStore = create<AuthStore>((set) => ({
  session: null,
  user: null,
  profile: null,
  isProfessional: false,
  isLoading: true,
  profileLoaded: false,

  initialize: async () => {
    set({ isLoading: true });
    // Falha de rede/storage no boot não pode deixar a splash presa: segue sem sessão e o
    // guard do _layout manda pro login.
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      set({ session, user: session?.user ?? null });

      if (session?.user) {
        const { profile, professional } = await loadProfile(session.user.id);
        set({ profile, isProfessional: professional });
      }
    } catch {
      set({ session: null, user: null, profile: null, isProfessional: false });
    }

    // O callback não pode ser async/await chamadas supabase direto (lock interno de
    // auth) — deferimos o fetch de profile pra fora com setTimeout, mesmo padrão do OLI.
    authListener?.unsubscribe();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const hadUser = !!session?.user;
      set({ session, user: session?.user ?? null, profileLoaded: !hadUser });

      if (session?.user) {
        const userId = session.user.id;
        setTimeout(() => {
          void (async () => {
            const { profile, professional } = await loadProfile(userId);
            set({ profile, isProfessional: professional, profileLoaded: true });
          })();
        }, 0);
      } else {
        set({ profile: null, isProfessional: false });
      }
    });

    authListener = listener.subscription;

    set({ isLoading: false, profileLoaded: true });
  },

  setProfile: (profile) => set({ profile }),
}));
