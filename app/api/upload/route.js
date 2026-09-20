// 伴奏音频上传 → Vercel Blob 公开存储
import { put } from '@vercel/blob';

export const dynamic = 'force-dynamic';

// 允许的音频 MIME（主流伴奏格式）
const AUDIO_TYPES = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
  'audio/ogg', 'audio/webm', 'audio/flac', 'audio/mp4', 'audio/x-m4a',
]);
const MAX_BYTES = 15 * 1024 * 1024; // 单文件 15MB 上限

export async function POST(req) {
  // Blob 未配置（本地开发未装集成）时给出明确提示，前端降级为仅本次会话
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return Response.json({ error: '伴奏云存储未配置（需要 Vercel Blob 集成）' }, { status: 503 });
  }

  const form = await req.formData();
  const file = form.get('audio');
  if (!file || !file.size) {
    return Response.json({ error: '缺少音频文件' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: '音频超过 15MB 限制' }, { status: 413 });
  }
  const ext = (file.name || '').match(/\.[A-Za-z0-9]{1,5}$/)?.[0] || '';
  const rand = Math.random().toString(36).slice(2, 8);

  try {
    const { url } = await put(
      `audio/${Date.now().toString(36)}-${rand}${ext}`,
      file,
      { access: 'public', contentType: file.type || 'application/octet-stream' }
    );
    return Response.json({ url });
  } catch (e) {
    return Response.json({ error: '上传失败：' + (e?.message || '未知错误') }, { status: 502 });
  }
}
