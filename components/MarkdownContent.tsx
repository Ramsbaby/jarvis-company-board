'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

// Copy button component for code blocks
function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
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
      }).catch((e: unknown) => {
        if (!cancelled) setError(String(e));
      });
    }).catch(() => {
      if (!cancelled) setError('Mermaid 로드 실패');
    });
    return () => { cancelled = true; };
  }, [code]);

  if (error) return <pre className="text-red-400 text-xs p-3 bg-red-900/20 rounded">{error}</pre>;
  if (!svg) return <div className="h-16 bg-slate-800 rounded animate-pulse flex items-center justify-center text-slate-500 text-xs">다이어그램 렌더링 중...</div>;
  return <div ref={ref} className="overflow-auto my-2" dangerouslySetInnerHTML={{ __html: svg }} />;
}

// Obsidian callout types → visual style
const CALLOUT: Record<string, { icon: string; border: string; bg: string; title: string }> = {
  note:      { icon: 'ℹ️',  border: 'border-blue-500/40',    bg: 'bg-blue-500/5',    title: 'text-blue-300' },
  info:      { icon: 'ℹ️',  border: 'border-blue-500/40',    bg: 'bg-blue-500/5',    title: 'text-blue-300' },
  abstract:  { icon: '📝', border: 'border-cyan-500/40',     bg: 'bg-cyan-500/5',    title: 'text-cyan-300' },
  summary:   { icon: '📝', border: 'border-cyan-500/40',     bg: 'bg-cyan-500/5',    title: 'text-cyan-300' },
  tip:       { icon: '💡', border: 'border-emerald-500/40',  bg: 'bg-emerald-500/5', title: 'text-emerald-300' },
  success:   { icon: '✅', border: 'border-emerald-500/40',  bg: 'bg-emerald-500/5', title: 'text-emerald-300' },
  check:     { icon: '✅', border: 'border-emerald-500/40',  bg: 'bg-emerald-500/5', title: 'text-emerald-300' },
  done:      { icon: '✅', border: 'border-emerald-500/40',  bg: 'bg-emerald-500/5', title: 'text-emerald-300' },
  warning:   { icon: '⚠️', border: 'border-amber-500/40',   bg: 'bg-amber-500/5',   title: 'text-amber-300' },
  caution:   { icon: '⚠️', border: 'border-amber-500/40',   bg: 'bg-amber-500/5',   title: 'text-amber-300' },
  attention: { icon: '⚠️', border: 'border-amber-500/40',   bg: 'bg-amber-500/5',   title: 'text-amber-300' },
  danger:    { icon: '🔴', border: 'border-red-500/40',      bg: 'bg-red-500/5',     title: 'text-red-300' },
  error:     { icon: '🔴', border: 'border-red-500/40',      bg: 'bg-red-500/5',     title: 'text-red-300' },
  important: { icon: '❗', border: 'border-purple-500/40',   bg: 'bg-purple-500/5',  title: 'text-purple-300' },
  bug:       { icon: '🐛', border: 'border-red-500/40',      bg: 'bg-red-500/5',     title: 'text-red-300' },
  question:  { icon: '❓', border: 'border-gray-500/40',     bg: 'bg-gray-800/40',   title: 'text-gray-300' },
  help:      { icon: '❓', border: 'border-gray-500/40',     bg: 'bg-gray-800/40',   title: 'text-gray-300' },
  faq:       { icon: '❓', border: 'border-gray-500/40',     bg: 'bg-gray-800/40',   title: 'text-gray-300' },
  example:   { icon: '📋', border: 'border-indigo-500/40',   bg: 'bg-indigo-500/5',  title: 'text-indigo-300' },
  quote:     { icon: '💬', border: 'border-gray-500/40',     bg: 'bg-gray-800/40',   title: 'text-gray-400' },
  cite:      { icon: '💬', border: 'border-gray-500/40',     bg: 'bg-gray-800/40',   title: 'text-gray-400' },
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

  return out;
}

export default function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  const processed = preprocessContent(content);

  return (
    <div className={`prose-light text-gray-700 text-sm leading-relaxed
      [&>*+*]:mt-3
      [&_h1]:text-slate-100 [&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2
      [&_h2]:text-slate-100 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-1.5
      [&_h3]:text-slate-200 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-3
      [&_p]:text-slate-300 [&_p]:leading-relaxed
      [&_strong]:text-white [&_strong]:font-semibold
      [&_em]:text-slate-300 [&_em]:italic
      [&_code]:text-indigo-300 [&_code]:bg-slate-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono
      [&_pre]:bg-slate-900 [&_pre]:border [&_pre]:border-white/10 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:my-3
      [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-slate-300
      [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-1
      [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-1
      [&_li]:text-slate-300
      [&_hr]:border-white/10 [&_hr]:my-4
      [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse
      [&_th]:text-left [&_th]:text-slate-400 [&_th]:font-medium [&_th]:py-1.5 [&_th]:border-b [&_th]:border-white/10
      [&_td]:py-1.5 [&_td]:border-b [&_td]:border-white/5 [&_td]:text-slate-300
      ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          blockquote({ node, children }: any) {
            // Detect Obsidian callout via first child text
            const firstPara = node?.children?.find(
              (n: any) => n.type === 'element' && n.tagName === 'p',
            );
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
              <blockquote className="border-l-2 border-slate-700 pl-3 text-slate-400 italic my-3">
                {children}
              </blockquote>
            );
          },
          code({ node, className: cls, children, ...props }: any) {
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
          img({ src, alt, ...props }: any) {
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
          a({ href, children, ...props }: any) {
            const isExternal = href?.startsWith('http');
            return (
              <a
                href={href}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                {...props}
              >
                {children}
              </a>
            );
          },
          table({ children, ...props }: any) {
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
