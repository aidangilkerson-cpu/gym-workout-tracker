import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { db, usersTable } from "@workspace/db";

// Identity is always obtained from the verified provider session, never input.
export async function getApplicationAccount(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  const authId = getAuth(req)?.userId;
  if (!authId) {
    res.status(401).json({ error: "Please sign in to access your account." });
    return null;
  }
  try {
    const identity = await clerkClient.users.getUser(authId);
    const primaryEmail = identity.emailAddresses.find(
      (address) => address.id === identity.primaryEmailAddressId,
    );
    if (!primaryEmail || primaryEmail.verification?.status !== "verified") {
      res.status(403).json({ error: "Please verify your email address before continuing." });
      return null;
    }
    const [account] = await db.insert(usersTable)
      .values({ id: randomUUID(), authId, email: primaryEmail.emailAddress })
      .onConflictDoUpdate({
        target: usersTable.authId,
        set: { email: primaryEmail.emailAddress },
      }).returning();
    return account;
  } catch {
    req.log.error("Unable to synchronize authenticated application account");
    res.status(503).json({ error: "We couldn't load your account right now. Please try again." });
    return null;
  }
}
