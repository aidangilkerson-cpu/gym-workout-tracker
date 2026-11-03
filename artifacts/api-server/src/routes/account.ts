import { Router, type IRouter } from "express";
import { GetCurrentUserResponse } from "@workspace/api-zod";
import { getApplicationAccount } from "../lib/application-account";

const router: IRouter = Router();

// All identity and email information comes from Clerk, never from request input.
router.get("/me", async (req, res): Promise<void> => {
  const account = await getApplicationAccount(req, res);
  if (account) res.json(GetCurrentUserResponse.parse(account));
});

export default router;
