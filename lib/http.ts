import { NextResponse } from "next/server";
import { AppError } from "./errors";

export async function handle(fn: () => Promise<unknown>, okStatus = 200) {
    try {
        return NextResponse.json(await fn(), { status: okStatus });
    } catch (e) {
        if (e instanceof AppError) return NextResponse.json({ error: e.message }, { status: e.status });
        console.error(e);
        return NextResponse.json({ error: "Internal server error." }, { status: 500 });
    }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
    try {
        const b = await req.json();
        return typeof b === "object" && b !== null ? b : {};
    } catch {
        return {};
    }
}