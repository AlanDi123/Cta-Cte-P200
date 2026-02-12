import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  changePassword: (data) => api.post('/auth/change-password', data),
};

// Products API
export const productsAPI = {
  getAll: (params) => api.get('/products', { params }),
  getOne: (id) => api.get(`/products/${id}`),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${id}`, data),
  delete: (id) => api.delete(`/products/${id}`),
  getCriticalStock: () => api.get('/products/stock/critical'),
  adjustStock: (id, data) => api.post(`/products/${id}/adjust-stock`, data),
};

// Clients API
export const clientsAPI = {
  getAll: (params) => api.get('/clients', { params }),
  getOne: (id) => api.get(`/clients/${id}`),
  create: (data) => api.post('/clients', data),
  update: (id, data) => api.put(`/clients/${id}`, data),
  delete: (id) => api.delete(`/clients/${id}`),
  getAccountStatement: (id, params) => api.get(`/clients/${id}/cuenta-corriente`, { params }),
  getOverdue: () => api.get('/clients/overdue'),
};

// Sales API
export const salesAPI = {
  getAll: (params) => api.get('/sales', { params }),
  getOne: (id) => api.get(`/sales/${id}`),
  create: (data) => api.post('/sales', data),
  cancel: (id) => api.post(`/sales/${id}/cancel`),
};

// Cash Register API
export const cajaAPI = {
  getRegisters: () => api.get('/caja/registers'),
  openShift: (data) => api.post('/caja/open', data),
  closeShift: (data) => api.post('/caja/close', data),
  getCurrent: () => api.get('/caja/current'),
  addMovement: (data) => api.post('/caja/movement', data),
  getShiftMovements: (id) => api.get(`/caja/shifts/${id}/movements`),
  getHistory: (params) => api.get('/caja/shifts/history', { params }),
};

// Users API
export const usersAPI = {
  getAll: (params) => api.get('/users', { params }),
  getOne: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
};

// Dashboard API
export const dashboardAPI = {
  getKPIs: () => api.get('/dashboard/kpis'),
  getCharts: (params) => api.get('/dashboard/charts', { params }),
};

// Reports API
export const reportsAPI = {
  sales: (params) => api.get('/reports/sales', { params }),
  cash: (params) => api.get('/reports/cash', { params }),
  stock: (params) => api.get('/reports/stock', { params }),
  clients: (params) => api.get('/reports/clients', { params }),
};

export default api;
