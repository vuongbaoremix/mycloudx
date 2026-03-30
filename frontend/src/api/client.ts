const API_BASE = '/api';

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('mycloud_token');
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('mycloud_token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('mycloud_token');
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    // Don't set Content-Type for FormData (browser sets it with boundary)
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      this.clearToken();
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Request failed: ${res.status}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json();
  }

  // Auth
  async login(email: string, password: string) {
    const data = await this.request<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.token);
    return data;
  }

  async register(name: string, email: string, password: string) {
    const data = await this.request<{ token: string; user: any }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    this.setToken(data.token);
    return data;
  }

  logout() {
    this.clearToken();
    window.location.href = '/login';
  }

  // Media
  async listMedia(params: Record<string, any> = {}) {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) query.set(k, String(v));
    }
    return this.request<any>(`/media?${query}`);
  }

  async getMedia(id: string) {
    return this.request<any>(`/media/${id}`);
  }

  async deleteMedia(id: string) {
    return this.request<void>(`/media/${id}`, { method: 'DELETE' });
  }

  async toggleFavorite(id: string) {
    return this.request<any>(`/media/${id}/favorite`, { method: 'PUT' });
  }

  async restoreMedia(id: string) {
    return this.request<void>(`/media/${id}/restore`, { method: 'POST' });
  }

  async getGeoMedia() {
    return this.request<any[]>('/media/geo');
  }

  async getTimeline() {
    return this.request<any>('/media/timeline');
  }

  // Upload
  async createSession(files: { name: string; size: number }[]) {
    return this.request<{ session_id: string }>('/upload/session', {
      method: 'POST',
      body: JSON.stringify({ files }),
    });
  }

  private generateVideoThumbnail(file: File): Promise<Blob | null> {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.autoplay = false;
      video.muted = true;
      video.playsInline = true;
      const url = URL.createObjectURL(file);
      video.src = url;

      video.onloadeddata = () => {
        // Seek to 0.5s or halfway if video is shorter
        const duration = isNaN(video.duration) || !isFinite(video.duration) ? 2 : video.duration;
        video.currentTime = Math.min(0.5, duration / 2);
      };

      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(url);
            resolve(blob);
          }, 'image/jpeg', 0.8);
        } else {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };

      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
    });
  }

  async uploadFile(
    file: File,
    sessionId?: string,
    onProgress?: (progress: { percent: number; loaded: number; total: number }) => void,
    maxRetries = 10,
  ): Promise<any> {
    let thumbnailBlob: Blob | null = null;
    if (file.type.startsWith('video/')) {
        thumbnailBlob = await this.generateVideoThumbnail(file);
    }

    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const fileId = crypto.randomUUID();
    const actualTotalChunks = Math.max(1, totalChunks);
    let uploadedBytes = 0;

    for (let chunkIndex = 0; chunkIndex < actualTotalChunks; chunkIndex++) {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      await this.uploadChunkWithRetry(
        fileId,
        chunkIndex,
        chunk,
        maxRetries,
        (loaded) => {
          if (onProgress) {
            const currentTotalLoaded = uploadedBytes + loaded;
            const cappedLoaded = Math.min(currentTotalLoaded, file.size);
            const percent = Math.round((cappedLoaded * 100) / file.size);
            onProgress({ percent, loaded: cappedLoaded, total: file.size });
          }
        }
      );
      uploadedBytes += chunk.size;
    }

    return this.completeUploadWithRetry(
      fileId,
      file,
      actualTotalChunks,
      sessionId,
      thumbnailBlob,
      maxRetries
    );
  }

  private async uploadChunkWithRetry(
    fileId: string,
    chunkIndex: number,
    chunk: Blob,
    maxRetries: number,
    onProgress?: (loaded: number) => void
  ): Promise<void> {
    const attempt = (retryCount: number): Promise<void> =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE}/upload/chunk`);

        if (this.token) {
          xhr.setRequestHeader('Authorization', `Bearer ${this.token}`);
        }

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable && onProgress) {
            // Cap at chunk size to avoid FormData overhead exceeding 100%
            const cappedLoaded = Math.min(e.loaded, chunk.size);
            onProgress(cappedLoaded);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else if (xhr.status === 429 && retryCount < maxRetries) {
            const delay = Math.min(1000 * (retryCount + 1), 8000);
            setTimeout(() => attempt(retryCount + 1).then(resolve).catch(reject), delay);
          } else {
            if (xhr.status === 401) {
              this.clearToken();
              window.location.href = '/login';
            }
            reject(new Error(`Chunk upload failed: ${xhr.status} ${xhr.responseText}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during chunk upload'));
        });

        const form = new FormData();
        form.append('file_id', fileId);
        form.append('chunk_index', chunkIndex.toString());
        form.append('chunk', chunk, 'chunk.bin');

        xhr.send(form);
      });

    return attempt(0);
  }

  private async completeUploadWithRetry(
    fileId: string,
    file: File,
    totalChunks: number,
    sessionId?: string,
    thumbnailBlob?: Blob | null,
    maxRetries: number = 10
  ): Promise<any> {
    const attempt = (retryCount: number): Promise<any> =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API_BASE}/upload/complete`);

        if (this.token) {
          xhr.setRequestHeader('Authorization', `Bearer ${this.token}`);
        }

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              resolve(xhr.responseText);
            }
          } else if (xhr.status === 429 && retryCount < maxRetries) {
            const delay = Math.min(1000 * (retryCount + 1), 8000);
            setTimeout(() => attempt(retryCount + 1).then(resolve).catch(reject), delay);
          } else {
            if (xhr.status === 401) {
              this.clearToken();
              window.location.href = '/login';
            }
            reject(new Error(`Complete upload failed: ${xhr.status} ${xhr.responseText}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during complete upload'));
        });

        const form = new FormData();
        form.append('file_id', fileId);
        form.append('original_name', file.name);
        form.append('mime_type', file.type);
        form.append('total_chunks', totalChunks.toString());
        if (sessionId) form.append('session_id', sessionId);
        if (thumbnailBlob) form.append('thumbnail', thumbnailBlob, 'thumb.jpg');

        xhr.send(form);
      });

    return attempt(0);
  }


  // User
  async getProfile() {
    return this.request<any>('/user/profile');
  }

  async updateProfile(data: any) {
    return this.request<any>('/user/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async changePassword(currentPassword: string, newPassword: string) {
    return this.request<void>('/user/password', {
      method: 'PUT',
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });
  }

  // Albums
  async listAlbums() {
    return this.request<any[]>('/albums');
  }

  async createAlbum(name: string, description?: string) {
    return this.request<any>('/albums', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
  }

  async getAlbum(id: string) {
    return this.request<any>(`/albums/${id}`);
  }

  async updateAlbum(id: string, data: any) {
    return this.request<any>(`/albums/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteAlbum(id: string) {
    return this.request<void>(`/albums/${id}`, { method: 'DELETE' });
  }

  async addMediaToAlbum(albumId: string, mediaIds: string[]) {
    return this.request<any>(`/albums/${albumId}/media`, {
      method: 'POST',
      body: JSON.stringify({ media_ids: mediaIds }),
    });
  }

  async removeMediaFromAlbum(albumId: string, mediaIds: string[]) {
    return this.request<any>(`/albums/${albumId}/media`, {
      method: 'DELETE',
      body: JSON.stringify({ media_ids: mediaIds }),
    });
  }

  // Admin
  async getStats() {
    return this.request<any>('/admin/stats');
  }

  async getSystemDashboard() {
    return this.request<any>('/admin/dashboard');
  }

  async listUsers() {
    return this.request<any[]>('/admin/users');
  }

  async updateUser(id: string, data: any) {
    return this.request<any>(`/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteUser(id: string) {
    return this.request<void>(`/admin/users/${id}`, { method: 'DELETE' });
  }

  async resetUserPassword(id: string) {
    return this.request<any>(`/admin/users/${id}/reset-password`, { method: 'POST' });
  }

  // Share
  async createShare(mediaIds: string[], options: { album_id?: string; password?: string; expires_hours?: number; max_views?: number } = {}) {
    return this.request<any>('/share', {
      method: 'POST',
      body: JSON.stringify({ media_ids: mediaIds, ...options }),
    });
  }

  async listShares() {
    return this.request<any[]>('/share');
  }

  async deleteShare(id: string) {
    return this.request<void>(`/share/${id}`, { method: 'DELETE' });
  }

  async accessShare(token: string, password?: string) {
    const url = password ? `/s/${token}?password=${encodeURIComponent(password)}` : `/s/${token}`;
    return this.request<any>(url);
  }

  // Search
  async searchMedia(q: string, page = 1) {
    return this.request<any>(`/search?q=${encodeURIComponent(q)}&page=${page}`);
  }

  // Health
  async healthCheck() {
    return this.request<any>('/health');
  }

  // Explorer
  async getMemories() {
    return this.request<any[]>('/explorer/memories');
  }

  async getExplorerScreenshots() {
    return this.request<any[]>('/explorer/screenshots');
  }

  async getExplorerStats() {
    return this.request<any>('/explorer/stats');
  }
}

export const api = new ApiClient();
export default api;
