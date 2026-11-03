import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { GetCurrentUserResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// All identity and email information comes from Clerk, never from request input.
router.get("/me", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const auth = getAuth(req);
  const authId = auth?.userId;
  if (!authId) {
    res.status(401).json({ error: "Please sign in to access your account." });
    return;
  }

  try {
    const identity = await clerkClient.users.getUser(authId);
    const primaryEmail = identity.emailAddresses.find(
      (address) => address.id === identity.primaryEmailAddressId,
    );
    if (!primaryEmail || primaryEmail.verification?.status !== "verified") {
      res.status(403).json({ error: "Please verify your email address before continuing." });
      return;
    }

    // Upsert makes first access and concurrent tabs safe. Changing a verified
    // email updates the row without replacing the stable application user ID.
    const [account] = await db
      .insert(usersTable)
      .values({ id: randomUUID(), authId, email: primaryEmail.emailAddress })
      .onConflictDoUpdate({
        target: usersTable.authId,
        set: { email: primaryEmail.emailAddress },
      })
      .returning();

    res.json(GetCurrentUserResponse.parse(account));
  } catch {
    // Do not log provider error objects: they may include request headers,
    // user attributes, or credentials.
    req.log.error("Unable to synchronize authenticated application account");
    res.status(503).json({
      error: "We couldn't load your account right now. Please try again.",
    });
  }
});

export default router;
