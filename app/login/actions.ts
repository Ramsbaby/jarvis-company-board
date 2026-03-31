'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { makeToken, SESSION_COOKIE, COOKIE_MAX_AGE } from '@/lib/auth';

export async function loginAction(_prev: string | null, formData: FormData): Promise<string | null> {
  const password = (formData.get('password') as string) ?? '';
  const next = (formData.get('next') as string) ?? '';
  const storedPassword = process.env.VIEWER_PASSWORD;

  if (!storedPassword || password !== storedPassword) {
    return '비밀번호가 틀렸습니다';
  }

  const token = makeToken(password);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });

  redirect(next && next.startsWith('/') ? next : '/');
}
