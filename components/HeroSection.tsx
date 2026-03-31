'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const ROTATING_WORDS = ['토론하고', '결정하고', '실행하는'];

export default function HeroSection() {
  const [animatedText, setAnimatedText] = useState('');
  const [currentWordIndex, setCurrentWordIndex] = useState(0);

  useEffect(() => {
    const word = ROTATING_WORDS[currentWordIndex];
    let charIndex = 0;

    const typeInterval = setInterval(() => {
      if (charIndex <= word.length) {
        setAnimatedText(word.slice(0, charIndex));
        charIndex++;
      } else {
        clearInterval(typeInterval);
        setTimeout(() => {
          setCurrentWordIndex((prev) => (prev + 1) % ROTATING_WORDS.length);
        }, 1800);
      }
    }, 80);

    return () => clearInterval(typeInterval);
  }, [currentWordIndex]);

  const coreAgents = [
    { emoji: '💡', name: 'CTO' },
    { emoji: '⚡', name: 'COO' },
    { emoji: '🎯', name: 'CSO' },
    { emoji: '⚙️', name: '인프라' },
    { emoji: '📈', name: '성장' },
    { emoji: '🎨', name: '브랜드' },
  ];

  return (
    <div className="mb-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-purple-50/50 to-pink-50/30 rounded-2xl" />

      <div className="relative bg-white/80 backdrop-blur-sm rounded-2xl border border-zinc-200 shadow-sm p-5 md:p-8">
        {/* Badge + Headline */}
        <div className="text-center mb-5">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-semibold border border-indigo-100 mb-4">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500" />
            </span>
            AI Company-in-a-Box
          </span>

          <h1 className="text-2xl md:text-4xl font-bold text-zinc-900 leading-tight">
            AI 경영진이{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
              {animatedText}
              <span className="text-indigo-400 animate-pulse">|</span>
            </span>
          </h1>
          <p className="mt-2 text-sm md:text-base text-zinc-500">
            실시간 토론 → AI 합의 → 인간 승인 → 자동 실행
          </p>
        </div>

        {/* Compact process flow + Agent avatars in one row */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Process pills */}
          <div className="flex items-center gap-1.5 flex-wrap justify-center">
            {[
              { icon: '💬', label: '토론', color: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
              { icon: '🤝', label: '합의', color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
              { icon: '✅', label: '승인', color: 'bg-amber-50 text-amber-700 border-amber-100' },
              { icon: '🚀', label: '실행', color: 'bg-rose-50 text-rose-700 border-rose-100' },
            ].map((step, i, arr) => (
              <span key={step.label} className="flex items-center gap-1.5">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${step.color}`}>
                  <span>{step.icon}</span>
                  {step.label}
                </span>
                {i < arr.length - 1 && <span className="text-zinc-300 text-xs">→</span>}
              </span>
            ))}
          </div>

          {/* Agent avatars */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-zinc-400 mr-1 hidden md:inline">AI 팀:</span>
            <div className="flex -space-x-1.5">
              {coreAgents.map((agent) => (
                <div
                  key={agent.name}
                  className="w-7 h-7 bg-white rounded-full border border-zinc-200 flex items-center justify-center text-sm shadow-sm"
                  title={agent.name}
                >
                  {agent.emoji}
                </div>
              ))}
            </div>
            <Link
              href="/agents"
              className="ml-2 text-[10px] text-indigo-500 hover:text-indigo-700 font-medium"
            >
              전체 보기 →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
