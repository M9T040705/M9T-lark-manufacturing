import axios from 'axios';
import { ElMessage } from 'element-plus';

const request = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

request.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

request.interceptors.response.use(
  (res) => res.data,
  async (err) => {
    const status = err.response?.status;
    const originalRequest = err.config;

    // 401 且不是刷新接口本身 → 尝试自动刷新 token
    if (status === 401 && !originalRequest._retry && !originalRequest.url?.includes('/auth/refresh')) {
      const refreshTokenValue = localStorage.getItem('refreshToken');
      if (refreshTokenValue) {
        if (isRefreshing) {
          // 已有刷新在进行，排队等待
          return new Promise((resolve) => {
            subscribeTokenRefresh((token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(request(originalRequest));
            });
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const res: any = await axios.post('/api/auth/refresh', { refreshToken: refreshTokenValue });
          const { accessToken, refreshToken: newRefreshToken } = res.data;
          localStorage.setItem('token', accessToken);
          if (newRefreshToken) localStorage.setItem('refreshToken', newRefreshToken);
          onRefreshed(accessToken);
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return request(originalRequest);
        } catch {
          // 刷新失败，跳登录
          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          localStorage.removeItem('tenant');
          if (!location.pathname.startsWith('/login')) {
            location.href = '/login';
          }
          return Promise.reject(err);
        } finally {
          isRefreshing = false;
        }
      } else {
        // 没有 refreshToken，直接跳登录
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('tenant');
        if (!location.pathname.startsWith('/login')) {
          location.href = '/login';
        }
      }
    }

    let msg = err.response?.data?.message || err.message || '请求失败';
    if (Array.isArray(msg)) msg = msg.join('，');
    if (status !== 401) ElMessage.error(msg);
    return Promise.reject(err);
  },
);

export default request;
