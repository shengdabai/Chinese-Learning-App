import { useState, useCallback, useEffect } from 'react';
import { clearSRSRecovery } from '../srs/srsEngine';
import { LearningStore } from '../../store/learningStore';

const AUTH_STORAGE_KEY = 'lingualens_auth';
const USERS_STORAGE_KEY = 'lingualens_users';

export interface AuthUser {
  readonly username: string;
  readonly createdAt: number;
}

interface StoredUser {
  readonly username: string;
  readonly passwordHash: string;
  readonly salt: string;
  readonly createdAt: number;
}

interface AuthState {
  readonly user: AuthUser | null;
  readonly isLoading: boolean;
}

/**
 * Generate a cryptographic salt for password hashing.
 */
function generateSalt(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash a password using PBKDF2 via the Web Crypto API.
 * Returns a hex-encoded derived key.
 */
async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const saltBytes = encoder.encode(salt);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return Array.from(new Uint8Array(derivedBits), b => b.toString(16).padStart(2, '0')).join('');
}

function loadUsers(): readonly StoredUser[] {
  try {
    const stored = localStorage.getItem(USERS_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as StoredUser[];
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error('Failed to load users:', error.message);
    }
  }
  return [];
}

function saveUsers(users: readonly StoredUser[]): void {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch (error) {
    if (error instanceof Error) {
      console.error('Failed to save users:', error.message);
    }
  }
}

function loadSession(): AuthUser | null {
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as AuthUser;
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error('Failed to load session:', error.message);
    }
  }
  return null;
}

function saveSession(user: AuthUser | null): void {
  try {
    if (user) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error('Failed to save session:', error.message);
    }
  }
}

export interface UseAuthReturn {
  readonly user: AuthUser | null;
  readonly isLoading: boolean;
  readonly login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  readonly register: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  readonly logout: () => void;
}

export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
  });

  useEffect(() => {
    const savedUser = loadSession();
    setState({ user: savedUser, isLoading: false });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const trimmedUsername = username.trim().toLowerCase();
    if (!trimmedUsername || !password) {
      return { success: false, error: 'Username and password are required.' };
    }

    const users = loadUsers();
    const found = users.find(u => u.username === trimmedUsername);

    if (!found) {
      return { success: false, error: 'User not found. Please register first.' };
    }

    const computedHash = await hashPassword(password, found.salt);
    if (found.passwordHash !== computedHash) {
      return { success: false, error: 'Incorrect password.' };
    }

    const authUser: AuthUser = { username: found.username, createdAt: found.createdAt };
    saveSession(authUser);
    setState({ user: authUser, isLoading: false });
    return { success: true };
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const trimmedUsername = username.trim().toLowerCase();
    if (!trimmedUsername || !password) {
      return { success: false, error: 'Username and password are required.' };
    }

    if (trimmedUsername.length < 3) {
      return { success: false, error: 'Username must be at least 3 characters.' };
    }

    if (password.length < 8) {
      return { success: false, error: 'Password must be at least 4 characters.' };
    }

    const users = loadUsers();
    const exists = users.some(u => u.username === trimmedUsername);
    if (exists) {
      return { success: false, error: 'Username already taken.' };
    }

    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);

    const newUser: StoredUser = {
      username: trimmedUsername,
      passwordHash,
      salt,
      createdAt: Date.now(),
    };

    saveUsers([...users, newUser]);

    const authUser: AuthUser = { username: newUser.username, createdAt: newUser.createdAt };
    saveSession(authUser);
    setState({ user: authUser, isLoading: false });
    return { success: true };
  }, []);

  const logout = useCallback(() => {
    saveSession(null);
    clearSRSRecovery();
    LearningStore.clearRecovery();
    setState({ user: null, isLoading: false });
  }, []);

  return {
    user: state.user,
    isLoading: state.isLoading,
    login,
    register,
    logout,
  };
}
