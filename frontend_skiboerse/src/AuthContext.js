import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from './api';

const AuthContext = createContext(null);

// Generate unique tab ID
const TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
const TAB_CHANNEL_NAME = 'skiboerse_tab_channel';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [duplicateTab, setDuplicateTab] = useState(false);
  const broadcastChannelRef = useRef(null);
  const isLoggingOut = useRef(false);

  // Logout function using sendBeacon for reliable logout on window close
  const logoutOnClose = useCallback(() => {
    if (isLoggingOut.current) return;
    isLoggingOut.current = true;

    // Use sendBeacon for reliable delivery when page is closing
    const csrfToken = document.cookie
      .split('; ')
      .find(row => row.startsWith('csrftoken='))
      ?.split('=')[1];

    const API_BASE = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:8000';

    // sendBeacon sends as POST with content-type: text/plain by default
    // We need to send as form data for Django to process it
    const formData = new FormData();
    formData.append('csrfmiddlewaretoken', csrfToken || '');

    navigator.sendBeacon(`${API_BASE}/api/auth/logout/`, formData);
  }, []);

  // Check for duplicate tabs using BroadcastChannel
  useEffect(() => {
    if (!('BroadcastChannel' in window)) {
      // Fallback for browsers without BroadcastChannel support
      return;
    }

    broadcastChannelRef.current = new BroadcastChannel(TAB_CHANNEL_NAME);

    // Announce this tab is opening
    broadcastChannelRef.current.postMessage({ type: 'TAB_OPENED', tabId: TAB_ID });

    // Listen for other tabs
    broadcastChannelRef.current.onmessage = (event) => {
      if (event.data.type === 'TAB_OPENED' && event.data.tabId !== TAB_ID) {
        // Another tab opened - notify it that we exist
        broadcastChannelRef.current.postMessage({ type: 'TAB_EXISTS', tabId: TAB_ID });
      }
      if (event.data.type === 'TAB_EXISTS' && event.data.tabId !== TAB_ID) {
        // We received confirmation another tab exists - we are the duplicate
        setDuplicateTab(true);
      }
    };

    return () => {
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.close();
      }
    };
  }, []);

  // Setup beforeunload handler for automatic logout
  useEffect(() => {
    if (!user || duplicateTab) return;

    const handleBeforeUnload = () => {
      logoutOnClose();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [user, duplicateTab, logoutOnClose]);

  // Check session on mount (if not duplicate tab)
  useEffect(() => {
    if (!duplicateTab) {
      checkSession();
    } else {
      setLoading(false);
    }
  }, [duplicateTab]);

  async function checkSession() {
    try {
      const response = await apiFetch('/api/auth/session/');
      const data = await response.json();
      if (data.isAuthenticated) {
        setUser({ username: data.username, role: data.role });
      } else {
        setUser(null);
      }
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  async function loginUser(username, password) {
    const response = await apiFetch('/api/auth/login/', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    if (response.ok) {
      // After login, fetch session to get role
      await checkSession();
      return { success: true };
    } else {
      const data = await response.json();
      return { success: false, error: data.error || 'Login fehlgeschlagen' };
    }
  }

  async function logoutUser() {
    isLoggingOut.current = true;
    await apiFetch('/api/auth/logout/', { method: 'POST' });
    setUser(null);
    isLoggingOut.current = false;
  }

  // Show duplicate tab warning
  if (duplicateTab) {
    return (
      <div className="duplicate-tab-warning">
        <div className="duplicate-tab-content">
          <h2>App bereits geöffnet</h2>
          <p>Die Skibörse-App ist bereits in einem anderen Tab geöffnet.</p>
          <p>Bitte verwenden Sie den bereits geöffneten Tab oder schließen Sie diesen.</p>
          <button onClick={() => window.close()} className="btn btn-primary">
            Diesen Tab schließen
          </button>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, login: loginUser, logout: logoutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
