import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { login as apiLogin, register as apiRegister, setAuthToken, setUnauthorizedHandler } from './api';

/** Keychain / Keystore on phones; localStorage on web (development previews only). Never throws on read. */
const secure = {
  get: async (k: string): Promise<string | null> => {
    try {
      return Platform.OS === 'web' ? globalThis.localStorage?.getItem(k) ?? null : await SecureStore.getItemAsync(k);
    } catch {
      return null;
    }
  },
  set: async (k: string, v: string) => (Platform.OS === 'web' ? globalThis.localStorage?.setItem(k, v) : SecureStore.setItemAsync(k, v)),
  del: async (k: string) => {
    try {
      if (Platform.OS === 'web') globalThis.localStorage?.removeItem(k);
      else await SecureStore.deleteItemAsync(k);
    } catch {
      // nothing stored
    }
  },
};

interface Session {
  token: string | null;
  email: string | null;
  guest: boolean;
}

interface AuthContextValue extends Session {
  ready: boolean;
  signedIn: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  continueAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function tokenExpired(token: string): boolean {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(globalThis.atob ? globalThis.atob(payload) : '{}');
    return typeof json.exp === 'number' && json.exp * 1000 < Date.now();
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session>({ token: null, email: null, guest: false });

  const signOut = useCallback(async () => {
    await Promise.all(['token', 'email', 'guest'].map((k) => secure.del(k)));
    setAuthToken(null);
    setSession({ token: null, email: null, guest: false });
  }, []);

  useEffect(() => {
    (async () => {
      const [token, email, guest] = await Promise.all(['token', 'email', 'guest'].map((k) => secure.get(k)));
      if (token && !tokenExpired(token)) {
        setAuthToken(token);
        setSession({ token, email, guest: false });
      } else if (guest === '1') {
        setSession({ token: null, email: null, guest: true });
      } else if (token) {
        await secure.del('token');
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (session.token) void signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [session.token, signOut]);

  const signIn = useCallback(async (email: string, password: string) => {
    const user = await apiLogin(email.trim().toLowerCase(), password);
    await secure.set('token', user.token);
    await secure.set('email', user.email);
    await secure.del('guest');
    setAuthToken(user.token);
    setSession({ token: user.token, email: user.email, guest: false });
  }, []);

  const signUp = useCallback(
    async (email: string, password: string) => {
      await apiRegister(email.trim().toLowerCase(), password);
      await signIn(email, password);
    },
    [signIn],
  );

  const continueAsGuest = useCallback(async () => {
    await secure.set('guest', '1');
    setSession({ token: null, email: null, guest: true });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...session,
      ready,
      signedIn: !!session.token || session.guest,
      signIn,
      signUp,
      continueAsGuest,
      signOut,
    }),
    [session, ready, signIn, signUp, continueAsGuest, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
