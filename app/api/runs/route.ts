import { handle, readJson } from "@/lib/http";
import { createRun, createRunFromSample } from "@/lib/service";
import { AppError } from "@/lib/errors";
import { MAX_EVIDENCE_BYTES } from "@/lib/evidence";

export const dynamic = "force-dynamic";

// Body: { assetId, mode: "sample", sample: "pass"|"fail"|"review" }
//   or  { assetId, mode: "upload", content: "<raw JSON text>" }
export const POST = async (req: Request) => {
  const body = await readJson(req);
  return handle(async () => {
    const assetId = typeof body.assetId === "string" ? body.assetId : "";
    if (!assetId) throw new AppError("assetId is required.");
    if (body.mode === "sample") return createRunFromSample(assetId, body.sample as any);
    if (body.mode === "upload") {
      if (typeof body.content !== "string") throw new AppError("content must be a string.");
      const bytes = Buffer.from(body.content, "utf8");
      if (bytes.length > MAX_EVIDENCE_BYTES) throw new AppError("Evidence file exceeds 100 KB limit.", 413);
      return createRun(assetId, bytes);
    }
    throw new AppError('mode must be "sample" or "upload".');
  }, 201);
};