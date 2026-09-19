import { NextResponse } from 'next/server';
import { getSheet, updateSheet, deleteSheet } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/sheets/[id] —— 获取单个谱子
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const sheet = await getSheet(id);
    if (!sheet) {
      return NextResponse.json({ error: '谱子不存在' }, { status: 404 });
    }
    return NextResponse.json(sheet);
  } catch (e) {
    console.error('GET /api/sheets/[id] error:', e);
    return NextResponse.json({ error: '获取谱子失败' }, { status: 500 });
  }
}

// PUT /api/sheets/[id] —— 更新谱子
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const updated = await updateSheet(id, body);
    if (!updated) {
      return NextResponse.json({ error: '谱子不存在' }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (e) {
    console.error('PUT /api/sheets/[id] error:', e);
    return NextResponse.json({ error: '更新谱子失败' }, { status: 500 });
  }
}

// DELETE /api/sheets/[id] —— 删除谱子
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const ok = await deleteSheet(id);
    if (!ok) {
      return NextResponse.json({ error: '谱子不存在' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/sheets/[id] error:', e);
    return NextResponse.json({ error: '删除谱子失败' }, { status: 500 });
  }
}
