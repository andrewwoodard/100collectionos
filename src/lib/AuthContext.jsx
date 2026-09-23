import React, { createContext, useState, useContext, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { appParams } from "@/lib/app-params";
import { createAxiosClient } from "@base44/sdk/dist/utils/axios-client";
import { authClient } from "@/lib/auth-client";
import { mapAuthUser } from "@/lib/mapAuthUser";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(undefined);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  const applyUser = useCallback((rawUser) => {
    const mapped = mapAuthUser(rawUser);
    setUser(mapped);
    setIsAuthenticated(!!mapped);
    if (mapped) {
      try { localStorage.setItem("100c_recent_auth", "true"); } catch (e) {}
      base44.auth.me = async () => mapped;
      base44.auth.updateMe = async (data) => {
        const next = mapAuthUser({ ...mapped, ...data, name: data.full_name || data.name || mapped.name });
        setUser(next);
        return next;
      };
    }
    return mapped;
  }, []);

  const loadSession = useCallback(async () => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const { data } = await authClient.getSession();
      if (data?.user) {
        applyUser(data.user);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error("Better Auth session check failed:", error);
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoadingAuth(false);
    }
  }, [applyUser]);

  const loadPublicSettings = useCallback(async () => {
    setIsLoadingPublicSettings(true);
    try {
      const appClient = createAxiosClient({
        baseURL: `/api/apps/public`,
        headers: { "X-App-Id": appParams.appId },
        token: appParams.token,
        interceptResponses: true,
      });
      const publicSettings = await appClient.get(`/prod/public-settings/by-id/${appParams.appId}`);
      setAppPublicSettings(publicSettings);
    } catch (appError) {
      console.error("App public settings check failed:", appError);
    } finally {
      setIsLoadingPublicSettings(false);
    }
  }, []);

  useEffect(() => {
    loadPublicSettings();
    loadSession();
  }, [loadPublicSettings, loadSession]);

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    try { localStorage.removeItem("100c_recent_auth"); } catch (e) {}
    const finish = () => {
      if (shouldRedirect) window.location.href = "/login";
    };
    authClient.signOut().then(finish).catch(finish);
  };

  const navigateToLogin = () => {
    const returnTo = window.location.pathname + window.location.search;
    window.location.href = "/login?returnTo=" + encodeURIComponent(returnTo || "/");
  };

  const refreshUser = async () => {
    const { data } = await authClient.getSession();
    if (data?.user) return applyUser(data.user);
    setUser(null);
    setIsAuthenticated(false);
    return null;
  };

  useEffect(() => {
    base44.auth.logout = () => logout();
    base44.auth.redirectToLogin = (fromUrl) => {
      const returnTo = typeof fromUrl === "string" && fromUrl.startsWith("/")
        ? fromUrl
        : window.location.pathname + window.location.search;
      window.location.href = "/login?returnTo=" + encodeURIComponent(returnTo || "/");
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        appPublicSettings,
        logout,
        navigateToLogin,
        checkAppState: loadSession,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
