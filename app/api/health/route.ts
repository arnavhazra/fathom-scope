import { json, options } from "@/lib/http";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

export function GET() {
  return json({ status: "ok", service: "fathom-scope", modules: 3 });
}
