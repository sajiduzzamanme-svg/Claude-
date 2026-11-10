"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { mutate } from "swr";
import { api, tokens } from "./api";

export type Role = "OWNER" | "ADMIN" | "ACCOUNTS" | "SALES" | "ENGINEER" | "PURCHASE";
export type User = {
  id: number;
  username: string;
  display_name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  designation: string;
  role: Role;
  is_active: boolean;
};

// Mirrors backend/core/permissions.py
export const ROLES = {
  ALL: ["OWNER", "ADMIN", "ACCOUNTS", "SALES", "ENGINEER", "PURCHASE"] as Role[],
  MANAGERS: ["OWNER", "ADMIN"] as Role[],
  FINANCE: ["OWNER", "ADMIN", "ACCOUNTS"] as Role[],
  SALES_TEAM: ["OWNER", "ADMIN", "ACCOUNTS", "SALES"] as Role[],
  SITE: ["OWNER", "ADMIN", "ACCOUNTS", "ENGINEER", "PURCHASE"] as Role[],
  BUYING: ["OWNER", "ADMIN", "ACCOUNTS", "PURCHASE"] as Role[],
};

type Ctx = {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  can: (roles: Role[]) => boolean;
};

const AuthContext = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tokens.access) {
      setLoading(false);
      return;
    }
    api
      .get<User>("/auth/me")
      .then(setUser)
      .catch(() => tokens.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.post<{ access: string; refresh: string }>("/auth/login", { username, password });
    tokens.set(res.access, res.refresh);
    await mutate(() => true, undefined, { revalidate: false });
    setUser(await api.get<User>("/auth/me"));
  }, []);

  const logout = useCallback(() => {
    tokens.clear();
    setUser(null);
    void mutate(() => true, undefined, { revalidate: false });
    window.location.assign("/login");
  }, []);

  const value = useMemo<Ctx>(
    () => ({ user, loading, login, logout, can: (roles) => !!user && roles.includes(user.role) }),
    [user, loading, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Ctx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
