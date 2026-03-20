'use client';
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';

type NotifPermission = 'default' | 'granted' | 'denied' | 'unsupported';
type Listener = (ev: any) => void;

interface EventContextValue {
  connected: boolean;
  subscribe: (fn: Listener) => () => void;
  notifPermission: NotifPermission;
  requestNotifPermission: () => Promise<void>;
}

const EventContext = createContext<EventContextValue>({
  connected: false,
  subscribe: () => () => {},
  notifPermission: 'unsupported',
  requestNotifPermission: async () => {},
});

export function EventProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotifPermission>('unsupported');
  const listenersRef = useRef<Set<Listener>>(new Set());
  const retryRef = useRef(1000);
  const esRef = useRef<EventSource | null>(null);
  const pathname = usePathname();

  const shouldSkipSSE = pathname === '/login' || pathname.startsWith('/agents');

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission as NotifPermission);
    }
  }, []);

  const requestNotifPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setNotifPermission(result as NotifPermission);
  }, []);

  useEffect(() => {
    if (shouldSkipSSE) {
      esRef.current?.close();
      esRef.current = null;
      setConnected(false);
      return;
    }

    let destroyed = false;
    function connect() {
      if (destroyed) return;
      const es = new EventSource('/api/events');
      esRef.current = es;
      es.onopen = () => { setConnected(true); retryRef.current = 1000; };
      es.onerror = () => {
        setConnected(false);
        es.close();
        retryRef.current = Math.min(retryRef.current * 2, 30000);
        if (!destroyed) setTimeout(connect, retryRef.current + Math.random() * 1000);
      };
      es.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data);
          listenersRef.current.forEach(fn => fn(ev));

          // 페이지가 백그라운드일 때만 브라우저 알림 발송
          if (typeof document !== 'undefined' && document.hidden && Notification.permission === 'granted') {
            if (ev.type === 'new_post') {
              new Notification('📋 새 토론', {
                body: ev.data?.title ?? '새 포스트가 등록되었습니다.',
                tag: `post-${ev.data?.id}`,
              });
            } else if (ev.type === 'new_comment') {
              const author = ev.data?.author_display ?? '누군가';
              const body = (ev.data?.content ?? '').slice(0, 80);
              new Notification(`💬 ${author}`, {
                body: body || '새 댓글이 달렸습니다.',
                tag: `comment-${ev.data?.id}`,
              });
            }
          }
        } catch {}
      };
    }
    connect();
    return () => { destroyed = true; esRef.current?.close(); };
  }, [shouldSkipSSE]);

  const subscribe = useCallback((fn: Listener) => {
    listenersRef.current.add(fn);
    return () => listenersRef.current.delete(fn);
  }, []);

  return (
    <EventContext.Provider value={{ connected, subscribe, notifPermission, requestNotifPermission }}>
      {children}
    </EventContext.Provider>
  );
}

export function useEvent() { return useContext(EventContext); }
