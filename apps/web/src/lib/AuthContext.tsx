import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  clearSession,
  fetchMe,
  getStoredUser,
  getToken,
  login as apiLogin,
  register as apiRegister,
  storeSession,
  type User,
} from './api';
import { clearStoredCandidate } from './session';

interface AuthContextValue {
  user: User | null;
  initializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(getStoredUser);
  const [initializing, setInitializing] = useState(Boolean(getToken()));

  // Revalidate the stored token once on mount; drop the session if stale.
  useEffect(() => {
    if (!getToken()) {
      setInitializing(false);
      return;
    }
    fetchMe()
      .then(setUser)
      .catch(() => {
        clearSession();
        setUser(null);
      })
      .finally(() => setInitializing(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const auth = await apiLogin(email, password);
    storeSession(auth);
    setUser(auth.user);
  }, []);

  const register = useCallback(
    async (email: string, password: string, fullName?: string) => {
      const auth = await apiRegister(email, password, fullName);
      storeSession(auth);
      setUser(auth.user);
    },
    [],
  );

  const logout = useCallback(() => {
    clearSession();
    clearStoredCandidate();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, initializing, login, register, logout }),
    [user, initializing, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
