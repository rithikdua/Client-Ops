import { Router } from "express";
import { ACCESS_SECTIONS } from "../../../src/data/options";
import type { Access } from "../../../src/data/types";
import { createPasswordReset, createUser, emailOf } from "../auth/accounts";
import { assertAcceptablePasswordAsync } from "../auth/passwordPolicy";
import {
  loadAccess,
  requireSection,
  requireTeamAdmin,
  writeAccess,
} from "../auth/permissions";
import { envString } from "../config";
import { transact, type Db } from "../db/index";
import { audit } from "../domain/audit";
import { asyncRoute, HttpError, notFound } from "../http/errors";
import { accessSchema, teammateSchema } from "../http/validate";
import { snapshotFor } from "./clients";

/** Coerces an untrusted `{section: bool}` map into a full Access record. */
function toAccess(input: Record<string, boolean>): Access {
  return ACCESS_SECTIONS.reduce((acc, section) => {
    acc[section.key] = !!input[section.key];
    return acc;
  }, {} as Access);
}

/** The sections a user currently holds, as a stable comma-separated list. */
function grantedList(db: Db, userId: string): string {
  const access = loadAccess(db, userId);
  const granted = ACCESS_SECTIONS.filter((s) => access[s.key]).map(
    (s) => s.key,
  );
  return granted.length ? granted.join(",") : "none";
}

export function teamRoutes(db: Db): Router {
  const router = Router();

  router.get("/", requireSection("team"), (req, res) => {
    res.json(snapshotFor(db, req));
  });

  // Creating people and changing what they can see is Owner-only.
  router.post(
    "/",
    requireSection("team"),
    requireTeamAdmin,
    // asyncRoute, or a throw inside an async handler becomes an unhandled
    // rejection and Express never answers the request at all — the caller waits
    // forever instead of seeing the error.
    asyncRoute(async (req, res) => {
      const input = teammateSchema.parse(req.body);
      // An Owner choosing a password for someone else still has to choose a good
      // one — the holder is required to replace it, but not before they sign in
      // with it at least once.
      await assertAcceptablePasswordAsync(input.password, {
        email: input.email,
        name: input.name,
      });
      const created = createUser(db, {
        name: input.name,
        email: input.email,
        role: input.role,
        permission: input.permission,
        password: input.password,
        // An Owner chose this password, so the account holder must replace it
        // before they can use the workspace.
        mustChangePassword: true,
        access: input.access
          ? toAccess(input.access)
          : toAccess(
              Object.fromEntries(ACCESS_SECTIONS.map((s) => [s.key, true])),
            ),
      });
      audit(db, req, {
        action: "team.add",
        targetType: "user",
        targetId: created,
        targetLabel: input.email,
        detail: `${input.permission}, granted: ${grantedList(db, created)}`,
      });
      res.status(201).json(snapshotFor(db, req));
    }),
  );

  router.put(
    "/:userId/access",
    requireSection("team"),
    requireTeamAdmin,
    (req, res) => {
      const { userId } = req.params;
      const user = db
        .prepare("SELECT id, email, permission FROM users WHERE id = ?")
        .get(userId) as
        | { id: string; email: string; permission: string }
        | undefined;
      if (!user) throw notFound("Teammate");

      const { access } = accessSchema.parse(req.body);
      // Capture the previous grant before overwriting it: "who could see invoices
      // last week" is unanswerable from the current state alone.
      const before = grantedList(db, userId);
      writeAccess(db, userId, toAccess(access));
      audit(db, req, {
        action: "team.access_change",
        targetType: "user",
        targetId: userId,
        targetLabel: user.email,
        detail: `${before} -> ${grantedList(db, userId)}`,
      });
      res.json(snapshotFor(db, req));
    },
  );

  /**
   * Issues a one-time reset link for a teammate who cannot get in.
   *
   * The link is returned to the Owner to pass on out of band — there is no email
   * delivery here. The alternative was leaving "delete and recreate the account"
   * as the only recovery path, which loses the account's history.
   */
  router.post(
    "/:userId/reset-password",
    requireSection("team"),
    requireTeamAdmin,
    (req, res) => {
      const { userId } = req.params;
      if (userId === req.actor!.userId) {
        throw new HttpError(
          400,
          'Use "Change your password" for your own account.',
        );
      }
      const grant = createPasswordReset(db, userId, req.actor!.userId);
      // Issuing one of these is a way to take over an account. It belongs in the
      // trail whether or not it is ever redeemed.
      audit(db, req, {
        action: "team.reset_link",
        targetType: "user",
        targetId: userId,
        targetLabel: emailOf(db, userId),
        detail: `expires ${grant.expiresAt}`,
      });
      const base = envString("APP_URL", "http://localhost:5173").replace(
        /\/+$/,
        "",
      );
      res.status(201).json({
        resetUrl: `${base}/?reset=${encodeURIComponent(grant.token)}`,
        expiresAt: grant.expiresAt,
      });
    },
  );

  router.delete(
    "/:userId",
    requireSection("team"),
    requireTeamAdmin,
    (req, res) => {
      const { userId } = req.params;
      if (userId === req.actor!.userId)
        throw new HttpError(400, "You cannot remove your own account.");

      const user = db
        .prepare("SELECT name, email, permission FROM users WHERE id = ?")
        .get(userId) as
        | { name: string; email: string; permission: string }
        | undefined;
      if (!user) throw notFound("Teammate");

      // Never leave the workspace without an Owner who can administer it.
      if (user.permission === "Owner") {
        const owners = db
          .prepare("SELECT COUNT(*) AS n FROM users WHERE permission = 'Owner'")
          .get() as { n: number };
        if (owners.n <= 1)
          throw new HttpError(409, "The last Owner cannot be removed.");
      }

      // The removed account's own sessions, access rows and reset links cascade
      // away with it, so the trail is the only thing that will remember this.
      transact(db, () => {
        db.prepare("DELETE FROM users WHERE id = ?").run(userId);
        audit(db, req, {
          action: "team.remove",
          targetType: "user",
          targetId: userId,
          targetLabel: `${user.name} <${user.email}>`,
          detail: user.permission,
        });
      });
      res.json(snapshotFor(db, req));
    },
  );

  return router;
}
