import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { login as apiLogin, register as apiRegister, setAuthToken, setUnauthorizedHandler } from './api';

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
    await Promise.all(['token', 'email', 'guest'].map((k) => SecureStore.deleteItemAsync(k)));
    setAuthToken(null);
    setSession({ token: null, email: null, guest: false });
  }, []);

  useEffect(() => {
    (async () => {
      const [token, email, guest] = await Promise.all(['token', 'email', 'guest'].map((k) => SecureStore.getItemAsync(k)));
      if (token && !tokenExpired(token)) {
        setAuthToken(token);
        setSession({ token, email, guest: false });
      } else if (guest === '1') {
        setSession({ token: null, email: null, guest: true });
      } else if (token) {
        await SecureStore.deleteItemAsync('token');
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
    await SecureStore.setItemAsync('token', user.token);
    await SecureStore.setItemAsync('email', user.email);
    await SecureStore.deleteItemAsync('guest');
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
    await SecureStore.setItemAsync('guest', '1');
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
