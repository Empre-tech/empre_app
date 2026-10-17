import { request } from './client';
import type { PostEntry } from './types';

export type PostKind = 'all' | 'photo' | 'video';

export interface PostPageResult {
  posts: PostEntry[];
  /** Cuántas publicaciones hay de ese tipo en total. */
  total: number;
}

export const postsApi = {
  /** Una página de publicaciones (fotos y videos) del negocio, las más recientes primero (público). */
  page: async (entityId: string, p: { page?: number; pageSize?: number; type?: PostKind } = {}): Promise<PostPageResult> => {
    const res = await request<{ data?: PostEntry[] | null; meta?: { total?: number } }>(`/api/entities/${entityId}/posts`, {
      auth: false,
      query: { page: p.page ?? 1, pageSize: p.pageSize ?? 30, type: p.type && p.type !== 'all' ? p.type : undefined },
    });
    const posts = res.data ?? [];
    return { posts, total: res.meta?.total ?? posts.length };
  },
};
