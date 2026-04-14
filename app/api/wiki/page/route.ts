/**
 * /api/wiki/page?path=career/_summary.md — 개별 위키 페이지 조회
 *
 * GET /api/wiki/page?path=career/_summary.md
 * Returns: { page: WikiPage, related: WikiSearchResult[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { readWikiPage } from '@/lib/wiki';
import { getRequestAuth } from '@/lib/guest-guard';

export async function GET(req: NextRequest) {
  // 위키는 오너 전용 — 게스트 접근 차단
  const { isOwner } = getRequestAuth(req);
  if (!isOwner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const pagePath = req.nextUrl.searchParams.get('path');

  if (!pagePath) {
    return NextResponse.json({ error: 'path 파라미터가 필요합니다.' }, { status: 400 });
  }

  // Path traversal 방지
  if (pagePath.includes('..') || pagePath.startsWith('/')) {
    return NextResponse.json({ error: '잘못된 경로입니다.' }, { status: 400 });
  }

  const page = readWikiPage(pagePath);
  if (!page) {
    return NextResponse.json({ error: '페이지를 찾을 수 없습니다.' }, { status: 404 });
  }

  // related 페이지 조회 (frontmatter.related 기반)
  const related = page.frontmatter.related
    ? page.frontmatter.related
        .map(r => {
          const rPage = readWikiPage(r);
          if (!rPage) return null;
          return {
            path: r,
            title: rPage.frontmatter.title || r,
            type: rPage.frontmatter.type || 'unknown',
            snippet: rPage.content.slice(0, 150).replace(/\n/g, ' '),
            updated: rPage.frontmatter.updated || rPage.lastModified.slice(0, 10),
            confidence: rPage.frontmatter.confidence || 'medium',
            relevance: 1,
          };
        })
        .filter(Boolean)
    : [];

  return NextResponse.json({ page, related });
}
