import { create } from 'zustand';
import { authAPI } from '../services/api';

const useAuthStore = create((set, get) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),
  loading: false,
  error: null,

  login: async (credentials) => {
    try {
      set({ loading: true, error: null });
      const response = await authAPI.login(credentials);
      
      if (response.success && response.data) {
        const { token, user } = response.data;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        set({ 
          user, 
          token, 
          isAuthenticated: true, 
          loading: false,
          error: null 
        });
        return { success: true };
      }
      
      set({ loading: false, error: 'Login failed' });
      return { success: false, error: 'Login failed' };
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Error al iniciar sesión';
      set({ loading: false, error: errorMsg });
      return { success: false, error: errorMsg };
    }
  },

  logout: async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      set({ 
        user: null, 
        token: null, 
        isAuthenticated: false,
        error: null
      });
    }
  },

  checkAuth: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ isAuthenticated: false, user: null });
      return false;
    }

    try {
      const response = await authAPI.me();
      if (response.success && response.data) {
        set({ user: response.data, isAuthenticated: true });
        localStorage.setItem('user', JSON.stringify(response.data));
        return true;
      }
      get().logout();
      return false;
    } catch {
      get().logout();
      return false;
    }
  },

  hasRole: (requiredRole) => {
    const { user } = get();
    if (!user) return false;
    
    const roleHierarchy = {
      'dueño': 4,
      'administrativo': 3,
      'contabilidad': 2,
      'vendedor': 1,
    };
    
    return (roleHierarchy[user.rol] || 0) >= (roleHierarchy[requiredRole] || 0);
  },

  canAccess: (resource, action = 'read') => {
    const { user } = get();
    if (!user) return false;
    
    // Dueño can do everything
    if (user.rol === 'dueño') return true;
    
    // Define permissions per role
    const permissions = {
      vendedor: {
        sales: ['create', 'read'],
        products: ['read'],
        clients: ['read', 'create', 'update'],
        caja: ['read', 'create'],
      },
      contabilidad: {
        sales: ['read'],
        products: ['read'],
        clients: ['read'],
        caja: ['read'],
        reports: ['read'],
        dashboard: ['read'],
      },
      administrativo: {
        sales: ['read', 'create', 'update', 'delete'],
        products: ['read', 'create', 'update', 'delete'],
        clients: ['read', 'create', 'update', 'delete'],
        caja: ['read', 'create', 'update'],
        reports: ['read'],
        dashboard: ['read'],
        users: ['read', 'create', 'update'],
      },
    };
    
    const userPermissions = permissions[user.rol];
    return userPermissions?.[resource]?.includes(action) || false;
  },
}));

export default useAuthStore;
