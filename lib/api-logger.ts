import { NextRequest, NextResponse } from 'next/server';

export interface ApiLogData {
  ts: string;
  endpoint: string;
  method: string;
  status_code?: number;
  duration_ms?: number;
}

export function logApiRequest(
  endpoint: string,
  method: string,
  statusCode: number,
  startTime?: string
) {
  const now = Date.now();
  const duration = startTime ? now - parseInt(startTime) : undefined;

  const logData: ApiLogData = {
    ts: new Date().toISOString(),
    endpoint,
    method,
    status_code: statusCode,
    ...(duration !== undefined && { duration_ms: duration })
  };

  console.log(JSON.stringify(logData));
}

export function getRequestMetadata(request: NextRequest) {
  return {
    startTime: request.headers.get('X-Request-Start-Time'),
    endpoint: request.headers.get('X-Request-Path') || request.url,
    method: request.headers.get('X-Request-Method') || request.method
  };
}