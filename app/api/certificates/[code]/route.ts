import { handle } from "@/lib/http";
import { lookupCertificate } from "@/lib/service";

export const dynamic = "force-dynamic";

export const GET = async (_: Request, { params }: { params: Promise<{ code: string }> }) => {
  const { code } = await params;
  return handle(() => lookupCertificate(code));
};