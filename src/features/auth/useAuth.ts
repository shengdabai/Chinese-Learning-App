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
  const stored = localStorage.getItem(USERS_STORAGE_KEY);
  if (stored === null) return [];
  const parsed: unknown = JSON.parse(stored);
  // Preserve corrupt records rather than replacing existing accounts with a new list.
  if (!Array.isArray(parsed) || !parsed.every(value => isAuthUser(value)
    && typeof value.salt === 'string' && /^[a-f0-9]{32}$/.test(value.salt)
    && typeof value.passwordHash === 'string' && /^[a-f0-9]{64}$/.test(value.passwordHash))) {
    throw new Error('Invalid account storage.');
  }
  return parsed;
}

function saveUsers(users: readonly StoredUser[]): void {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

function isAuthUser(value: unknown): value is AuthUser & Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const user = value as Record<string, unknown>;
  return typeof user.username === 'string' && user.username.trim().length > 0
    && typeof user.createdAt === 'number' && Number.isFinite(user.createdAt) && user.createdAt >= 0;
}

function loadSession(): AuthUser | null {
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      return isAuthUser(parsed) ? { username: parsed.username, createdAt: parsed.createdAt } : null;
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error('Failed to load session.');
    }
  }
  return null;
}

function saveSession(user: AuthUser | null): boolean {
  try {
    if (user) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
    return true;
  } catch (error) {
    if (error instanceof Error) {
      console.error('Failed to save session.');
    }
    return false;
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
    try {
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
      if (!saveSession(authUser)) return { success: false, error: 'Unable to save your session. Check browser storage and try again.' };
      setState({ user: authUser, isLoading: false });
      return { success: true };
    } catch {
      return { success: false, error: 'Unable to sign in. Check browser storage and try again.' };
    }
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    try {
      const trimmedUsername = username.trim().toLowerCase();
      if (!trimmedUsername || !password) {
        return { success: false, error: 'Username and password are required.' };
      }

      if (trimmedUsername.length < 3) {
        return { success: false, error: 'Username must be at least 3 characters.' };
      }

      if (password.length < 8) {
        return { success: false, error: 'Password must be at least 8 characters.' };
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
      if (!saveSession(authUser)) return { success: false, error: 'Account saved, but the session could not be saved. Check browser storage, then sign in.' };
      setState({ user: authUser, isLoading: false });
      return { success: true };
    } catch {
      return { success: false, error: 'Unable to create an account. Check browser storage and try again.' };
    }
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
