import { getStore } from "@netlify/blobs";
import { createHandler } from "../../lib/lobby-handler.mjs";

export default async (req) => {
  const store = getStore({ name: "dice-lobby", consistency: "strong" });
  return createHandler({ store })(req);
};

export const config = { path: "/api/lobby", method: ["GET", "POST"] };
