'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import DOMPurify from 'isomorphic-dompurify';
import type { ExtraProps } from 'react-markdown';
import type { Element } from 'hast';

interface MarkdownContentProps {
  content: string;
  className?: string;
  variant?: 'light' | 'dark';
}

// Copy button component for code blocks
function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Copy failed — silently fall back, no user action needed
      console.warn('clipboard copy failed');
    }
  }, [code]);
  return (
    <button
      onClick={copy}
      className="absolute top-2 right-2 px-2 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
      aria-label="코드 복사"
    >
      {copied ? '✓ 복사됨' : '복사'}
    </button>
  );
}

// Mermaid diagram component (lazy loaded)
function MermaidDiagram({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: 'dark', themeVariables: { primaryColor: '#6366f1', background: '#0d1117' } });
      const id = `mermaid-${Math.random().toString(36).slice(2)}`;
      mermaid.render(id, code).then(({ svg: rendered }: { svg: string }) => {
        if (!cancelled) setSvg(rendered);
      }).catch(() => {
        if (!cancelled) setError('다이어그램을 렌더링할 수 없습니다');
      });
    }).catch(() => {
      if (!cancelled) setError('다이어그램을 렌더링할 수 없습니다');
    });
    return () => { cancelled = true; };
  }, [code]);

  if (error) return <pre className="text-red-400 text-xs p-3 bg-red-900/20 rounded">{error}</pre>;
  if (!svg) return <div className="h-16 bg-slate-800 rounded animate-pulse flex items-center justify-center text-slate-500 text-xs">다이어그램 렌더링 중...</div>;
  return <div ref={ref} className="overflow-auto my-2" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } }) }} />;
}

// Obsidian callout types → visual style (light-mode palette)
const CALLOUT: Record<string, { icon: string; border: string; bg: string; title: string }> = {
  note:      { icon: 'ℹ️',  border: 'border-blue-400',    bg: 'bg-blue-50',    title: 'text-blue-700' },
  info:      { icon: 'ℹ️',  border: 'border-blue-400',    bg: 'bg-blue-50',    title: 'text-blue-700' },
  abstract:  { icon: '📝', border: 'border-cyan-400',     bg: 'bg-cyan-50',    title: 'text-cyan-700' },
  summary:   { icon: '📝', border: 'border-cyan-400',     bg: 'bg-cyan-50',    title: 'text-cyan-700' },
  tip:       { icon: '💡', border: 'border-emerald-400',  bg: 'bg-emerald-50', title: 'text-emerald-700' },
  success:   { icon: '✅', border: 'border-emerald-400',  bg: 'bg-emerald-50', title: 'text-emerald-700' },
  check:     { icon: '✅', border: 'border-emerald-400',  bg: 'bg-emerald-50', title: 'text-emerald-700' },
  done:      { icon: '✅', border: 'border-emerald-400',  bg: 'bg-emerald-50', title: 'text-emerald-700' },
  warning:   { icon: '⚠️', border: 'border-amber-400',   bg: 'bg-amber-50',   title: 'text-amber-700' },
  caution:   { icon: '⚠️', border: 'border-amber-400',   bg: 'bg-amber-50',   title: 'text-amber-700' },
  attention: { icon: '⚠️', border: 'border-amber-400',   bg: 'bg-amber-50',   title: 'text-amber-700' },
  danger:    { icon: '🔴', border: 'border-red-400',      bg: 'bg-red-50',     title: 'text-red-700' },
  error:     { icon: '🔴', border: 'border-red-400',      bg: 'bg-red-50',     title: 'text-red-700' },
  important: { icon: '❗', border: 'border-purple-400',   bg: 'bg-purple-50',  title: 'text-purple-700' },
  bug:       { icon: '🐛', border: 'border-red-400',      bg: 'bg-red-50',     title: 'text-red-700' },
  question:  { icon: '❓', border: 'border-gray-400',     bg: 'bg-gray-100',   title: 'text-gray-600' },
  help:      { icon: '❓', border: 'border-gray-400',     bg: 'bg-gray-100',   title: 'text-gray-600' },
  faq:       { icon: '❓', border: 'border-gray-400',     bg: 'bg-gray-100',   title: 'text-gray-600' },
  example:   { icon: '📋', border: 'border-indigo-400',   bg: 'bg-indigo-50',  title: 'text-indigo-700' },
  quote:     { icon: '💬', border: 'border-gray-400',     bg: 'bg-gray-100',   title: 'text-gray-600' },
  cite:      { icon: '💬', border: 'border-gray-400',     bg: 'bg-gray-100',   title: 'text-gray-600' },
};

/**
 * Preprocess Obsidian-flavored markdown:
 * 1. Flatten [[wikilinks]] → display text
 * 2. Ensure callout body is in a separate paragraph from the title
 */
function preprocessContent(content: string): string {
  // [[Target|Alias]] → Alias, [[Target]] → Target
  let out = content.replace(
    /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
    (_, target: string, alias?: string) => alias ?? target,
  );

  // > [!TYPE] Title\n> body → > [!TYPE] Title\n>\n> body
  out = out.replace(
    /(> \[!\w+\][^\n]*)(\n)(> \S)/g,
    '$1\n>\n$3',
  );

  // CommonMark fix 1: closing ** preceded by " (or other punctuation) is not right-flanking
  // e.g. **"text"**이 → **"text"\u200B**이
  // ZWS between " and ** makes ** not preceded by punctuation → right-flanking ✓
  out = out.replace(/([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~\u201C\u201D\u2018\u2019])(\*{1,2})(?!\s)/g, '$1\u200B$2');

  // CommonMark fix 2: **text**한글 → **text**​한글 (closing ** before Korean = not parsed as bold)
  out = out.replace(/(\*{1,2}[^*\n]+\*{1,2})([\uAC00-\uD7A3])/g, '$1\u200B$2');

  return out;
}

export default function MarkdownContent({ content, className = '', variant = 'light' }: MarkdownContentProps) {
  const processed = preprocessContent(content);

  const lightTheme = `prose-light text-gray-700 text-sm leading-relaxed
    [&>*+*]:mt-3
    [&_h1]:text-gray-900 [&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2
    [&_h2]:text-gray-900 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-1.5
    [&_h3]:text-gray-800 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-3
    [&_p]:text-gray-700 [&_p]:leading-relaxed
    [&_strong]:text-gray-800 [&_strong]:font-semibold
    [&_em]:text-gray-600 [&_em]:italic
    [&_code]:text-indigo-700 [&_code]:bg-indigo-50 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono
    [&_pre]:bg-gray-900 [&_pre]:border [&_pre]:border-gray-200 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:my-3
    [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-gray-200
    [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-1
    [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-1
    [&_li]:text-gray-700
    [&_hr]:border-gray-200 [&_hr]:my-4
    [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse
    [&_th]:text-left [&_th]:text-gray-500 [&_th]:font-medium [&_th]:py-1.5 [&_th]:border-b [&_th]:border-gray-200
    [&_td]:py-1.5 [&_td]:border-b [&_td]:border-gray-100 [&_td]:text-gray-600`;

  const darkTheme = `prose-dark text-slate-200 text-sm leading-relaxed
    [&>*+*]:mt-3
    [&_h1]:text-white [&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2
    [&_h2]:text-slate-100 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-1.5
    [&_h3]:text-slate-200 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-3
    [&_p]:text-slate-200 [&_p]:leading-relaxed
    [&_strong]:text-white [&_strong]:font-semibold
    [&_em]:text-slate-300 [&_em]:italic
    [&_code]:text-indigo-300 [&_code]:bg-indigo-950/60 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono
    [&_pre]:bg-black/60 [&_pre]:border [&_pre]:border-slate-700 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:my-3
    [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-slate-200
    [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-1
    [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-1
    [&_li]:text-slate-200
    [&_hr]:border-slate-700 [&_hr]:my-4
    [&_blockquote]:border-l-2 [&_blockquote]:border-slate-600 [&_blockquote]:pl-3 [&_blockquote]:text-slate-400 [&_blockquote]:italic
    [&_a]:text-indigo-300
    [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse
    [&_th]:text-left [&_th]:text-slate-400 [&_th]:font-medium [&_th]:py-1.5 [&_th]:border-b [&_th]:border-slate-700
    [&_td]:py-1.5 [&_td]:border-b [&_td]:border-slate-800 [&_td]:text-slate-300`;

  const themeClasses = variant === 'dark' ? darkTheme : lightTheme;

  return (
    <div className={`${themeClasses} ${className}`}>
      <ReactMarkdown
        remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          blockquote({ node, children }: React.ComponentPropsWithoutRef<'blockquote'> & ExtraProps) {
            // Detect Obsidian callout via first child text
            const firstPara = (node as Element | undefined)?.children?.find(
              (n) => (n as Element).type === 'element' && (n as Element).tagName === 'p',
            ) as Element | undefined;
            const firstTextNode = firstPara?.children?.[0];
            const firstText = firstTextNode?.type === 'text' ? firstTextNode.value : '';
            const match = firstText.match(/^\[!(\w+)\](?:\s+(.+))?/);

            if (match) {
              const type = match[1].toLowerCase();
              const title = match[2]?.trim() || match[1].toUpperCase();
              const style = CALLOUT[type] ?? CALLOUT.note;
              const body = Array.isArray(children) ? children.slice(1) : null;
              return (
                <div className={`border-l-2 rounded-r-lg px-3 py-2 my-3 ${style.border} ${style.bg}`}>
                  <div className={`flex items-center gap-1.5 text-xs font-semibold mb-1.5 ${style.title}`}>
                    <span>{style.icon}</span>
                    <span>{title}</span>
                  </div>
                  {body && <div className="space-y-1">{body}</div>}
                </div>
              );
            }

            return (
              <blockquote className="border-l-2 border-gray-300 pl-3 text-gray-500 italic my-3">
                {children}
              </blockquote>
            );
          },
          code({ node: _node, className: cls, children, ...props }: React.ComponentPropsWithoutRef<'code'> & ExtraProps) {
            const match = /language-(\w+)/.exec(cls || '');
            const lang = match?.[1] || '';
            const codeString = String(children).replace(/\n$/, '');

            // Mermaid special case
            if (lang === 'mermaid') {
              return <MermaidDiagram code={codeString} />;
            }

            // Inline code (no language match and no newlines = inline)
            if (!match) {
              return <code className={cls} {...props}>{children}</code>;
            }

            // Block code with copy button
            return (
              <div className="relative group">
                <CopyButton code={codeString} />
                <pre className={cls}>
                  <code className={cls} {...props}>{children}</code>
                </pre>
              </div>
            );
          },
          img({ src, alt, ...props }: React.ComponentPropsWithoutRef<'img'> & ExtraProps) {
            return (
              <img
                src={src}
                alt={alt}
                className="rounded-lg shadow-lg max-w-full my-2"
                loading="lazy"
                {...props}
              />
            );
          },
          a({ href, children, ...props }: React.ComponentPropsWithoutRef<'a'> & ExtraProps) {
            const isExternal = href?.startsWith('http');
            return (
              <a
                href={href}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                className="text-indigo-600 hover:text-indigo-700 underline underline-offset-2"
                {...props}
              >
                {children}
              </a>
            );
          },
          table({ children, ...props }: React.ComponentPropsWithoutRef<'table'> & ExtraProps) {
            return (
              <div className="overflow-x-auto my-3">
                <table className="min-w-full" {...props}>{children}</table>
              </div>
            );
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
