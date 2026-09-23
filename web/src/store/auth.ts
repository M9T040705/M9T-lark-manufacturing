import { defineStore } from 'pinia';
import { getMe, login, refreshToken as apiRefreshToken } from '../api';

interface AuthState {
  token: string;
  refreshToken: string;
  user: any;
  tenant: any;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: localStorage.getItem('token') || '',
    refreshToken: localStorage.getItem('refreshToken') || '',
    user: JSON.parse(localStorage.getItem('user') || 'null'),
    tenant: JSON.parse(localStorage.getItem('tenant') || 'null'),
  }),
  getters: {
    isLogin: (s) => !!s.token,
    role: (s) => s.user?.role || '',
  },
  actions: {
    async doLogin(form: { tenantCode: string; username: string; password: string }) {
      const data: any = await login(form);
      this.setSession(data);
      return data;
    },
    setSession(data: any) {
      // 兼容旧格式 data.token（字符串）和新格式 data.accessToken + data.refreshToken
      const accessToken = data.accessToken || (typeof data.token === 'string' ? data.token : data.token?.accessToken);
      const refresh = data.refreshToken || (typeof data.token === 'object' ? data.token?.refreshToken : '');
      this.token = accessToken || '';
      this.refreshToken = refresh || '';
      this.user = data.user;
      this.tenant = data.tenant;
      if (this.token) localStorage.setItem('token', this.token);
      if (this.refreshToken) localStorage.setItem('refreshToken', this.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('tenant', JSON.stringify(data.tenant));
    },
    async doRefresh() {
      if (!this.refreshToken) return false;
      try {
        const data: any = await apiRefreshToken(this.refreshToken);
        this.setSession(data);
        return true;
      } catch {
        this.logout();
        return false;
      }
    },
    async refreshMe() {
      const me: any = await getMe();
      this.user = { ...this.user, ...me };
      this.tenant = me.tenant || this.tenant;
      localStorage.setItem('user', JSON.stringify(this.user));
      if (me.tenant) localStorage.setItem('tenant', JSON.stringify(me.tenant));
    },
    logout() {
      this.token = '';
      this.refreshToken = '';
      this.user = null;
      this.tenant = null;
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      localStorage.removeItem('tenant');
      location.href = '/login';
    },
  },
});
