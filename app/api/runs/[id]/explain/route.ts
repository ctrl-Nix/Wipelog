import { handle } from "@/lib/http";
import { getRun } from "@/lib/service";
import { explainRun } from "@/lib/explain";

export const dynamic = "force-dynamic";

export const POST = async (_: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return handle(async () => {
    const { run } = await getRun(id);
    return explainRun(run);
  });
};