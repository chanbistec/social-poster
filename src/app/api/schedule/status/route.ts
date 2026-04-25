import { NextResponse } from 'next/server';
import { scheduler } from '@/lib/scheduler';

export async function GET() {
  try {
    return NextResponse.json({
      running: scheduler.running,
      processing: scheduler.processingCount,
      pending: scheduler.getPendingCount(),
      pending_pipeline_runs: scheduler.getPendingPipelineRunCount(),
      nextCheck: scheduler.running ? 'within 60 seconds' : 'stopped',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[API] Error fetching scheduler status:', err);
    return NextResponse.json(
      { error: 'Failed to fetch scheduler status' },
      { status: 500 }
    );
  }
}
