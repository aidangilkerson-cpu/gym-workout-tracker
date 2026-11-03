import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  CreateSessionBody, UpdateSessionBody, GetSessionParams,
  GetSessionResponse, ListSessionsResponse,
} from "@workspace/api-zod";
import { getApplicationAccount } from "../lib/application-account";
import { sessionFieldErrors } from "../lib/session-validation";
import {
  listOwnedSessions, getOwnedSession, saveOwnedSession, deleteOwnedSession,
  SessionNotFound, type SessionDatabase,
} from "../lib/session-store";

export function createSessionsRouter(database: SessionDatabase = db): IRouter {
  const router = Router();
  router.use("/sessions", async (req, res, next) => {
    const account = await getApplicationAccount(req, res);
    if (!account) return;
    res.locals.accountId = account.id;
    next();
  });

  // Do not log raw DB/provider errors or workout content.
  function failure(req: Request, res: Response, error: unknown) {
    if (error instanceof SessionNotFound) {
      res.status(404).json({ error: "Session or exercise not found." });
    } else {
      req.log.error("Session operation failed");
      res.status(503).json({ error: "We couldn't save or load your session. Please try again." });
    }
  }
  function parseId(req: Request, res: Response) {
    const params = GetSessionParams.safeParse(req.params);
    if (!params.success || !Number.isSafeInteger(params.data.id)) {
      res.status(404).json({ error: "Session not found." });
      return null;
    }
    return params.data.id;
  }

  router.get("/sessions", async (req, res) => {
    try {
      res.json(ListSessionsResponse.parse(await listOwnedSessions(database, res.locals.accountId)));
    } catch (error) { failure(req, res, error); }
  });
  router.get("/sessions/:id", async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;
    try {
      const session = await getOwnedSession(database, res.locals.accountId, id);
      if (!session) throw new SessionNotFound();
      res.json(GetSessionResponse.parse(session));
    } catch (error) { failure(req, res, error); }
  });

  const save = (editing: boolean) => async (req: Request, res: Response) => {
    const id = editing ? parseId(req, res) : undefined;
    if (id === null) return;
    const parsed = (editing ? UpdateSessionBody : CreateSessionBody).safeParse(req.body);
    const fieldErrors = sessionFieldErrors(req.body, parsed.success ? [] : parsed.error.issues);
    if (!parsed.success || Object.keys(fieldErrors).length) {
      res.status(400).json({ error: "Check the highlighted fields before saving.", fieldErrors });
      return;
    }
    try {
      const result = await saveOwnedSession(database, res.locals.accountId, parsed.data, id);
      res.status(editing ? 200 : 201).json(GetSessionResponse.parse(result));
    } catch (error) { failure(req, res, error); }
  };
  router.post("/sessions", save(false));
  router.put("/sessions/:id", save(true));
  router.delete("/sessions/:id", async (req, res) => {
    const id = parseId(req, res);
    if (id === null) return;
    try {
      if (!await deleteOwnedSession(database, res.locals.accountId, id)) throw new SessionNotFound();
      res.status(204).end();
    } catch (error) { failure(req, res, error); }
  });
  return router;
}

export default createSessionsRouter();
