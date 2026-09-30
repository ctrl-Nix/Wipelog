import { handle } from "@/lib/http";
import { getAssetWithRuns } from "@/lib/service";

export const dynamic = "force-dynamic";

export const GET = async (_: Request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    return handle(() => getAssetWithRuns(id));
};