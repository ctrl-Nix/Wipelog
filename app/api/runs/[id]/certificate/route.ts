import { handle } from "@/lib/http";
import { issueCertificate } from "@/lib/service";

export const dynamic = "force-dynamic";

export const POST = async (_: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return handle(() => issueCertificate(id), 201);
};