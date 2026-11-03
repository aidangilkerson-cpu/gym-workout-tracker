import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { GetDashboardQueryParams, GetDashboardResponse } from "@workspace/api-zod";
import { getApplicationAccount } from "../lib/application-account";
import { ownedDashboard } from "../lib/dashboard-store";
import { SessionNotFound, type SessionDatabase } from "../lib/session-store";

export function createDashboardRouter(database: SessionDatabase = db): IRouter {
  const router = Router();
  router.get("/dashboard", async (req, res) => {
    const account = await getApplicationAccount(req, res);
    if (!account) return;
    const query = GetDashboardQueryParams.safeParse(req.query);
    if (!query.success || Object.entries(req.query).some(([key, value]) =>
      typeof value !== "string" || /^(exerciseId|workoutKey)\[/.test(key))) {
      res.status(400).json({ error: "Choose a valid exercise and workout from this dashboard." });
      return;
    }
    try {
      res.json(GetDashboardResponse.parse(await ownedDashboard(database, account.id, query.data)));
    } catch (error) {
      if (error instanceof SessionNotFound) {
        res.status(404).json({ error: "That progress selection is no longer available. Reset the selections and try again." });
      } else {
        req.log.error("Dashboard load failed");
        res.status(503).json({ error: "We couldn't load your dashboard. Your saved sessions are unchanged. Please try again." });
      }
    }
  });
  return router;
}

export default createDashboardRouter();
