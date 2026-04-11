'use client';

import dynamic from 'next/dynamic';

const GameCanvas = dynamic(() => import('./GameCanvas'), { ssr: false });

export default function CompanyPage() {
  return <GameCanvas />;
}
