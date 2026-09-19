import { NextResponse } from 'next/server';
import { listSheets, createSheet } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/sheets —— 谱子列表
export async function GET() {
  try {
    const sheets = await listSheets();
    return NextResponse.json(sheets);
  } catch (e) {
    console.error('GET /api/sheets error:', e);
    return NextResponse.json({ error: '获取谱子列表失败' }, { status: 500 });
  }
}

// POST /api/sheets —— 新建谱子
export async function POST(request) {
  try {
    const body = await request.json();
    const created = await createSheet(body);
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    console.error('POST /api/sheets error:', e);
    return NextResponse.json({ error: '创建谱子失败' }, { status: 500 });
  }
}
