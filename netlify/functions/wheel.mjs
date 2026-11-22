import { getStore } from "@netlify/blobs";
import { createWheelHandler } from "../../lib/wheel-handler.mjs";

export default async (req) => {
  const store = getStore({ name: "dice-lobby", consistency: "strong" });
  return createWheelHandler({ store })(req);
};

export const config = { path: "/api/wheel", method: ["GET", "POST"] };
