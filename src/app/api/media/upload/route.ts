import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/route-auth';
import { saveUploadedFile } from '@/lib/media';

// POST /api/media/upload — multipart file upload
export async function POST(request: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  const tenantId = formData.get('tenant_id') as string | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided. Use field name "file".' }, { status: 400 });
  }

  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 });
  }

  try {
    const result = await saveUploadedFile(file, tenantId);
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
