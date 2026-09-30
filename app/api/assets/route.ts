import { handle, readJson } from "@/lib/http";
import { createAsset, listAssets } from "@/lib/service";

export const dynamic = "force-dynamic";

export const GET = () => handle(() => listAssets());
export const POST = async (req: Request) => {
  const body = await readJson(req);
  return handle(() => createAsset(body), 201);
};