import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/db";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) {
    throw new Error(
      "VAPID env manquant : NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT",
    );
  }
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
}

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  /// Si fourni, remplace toute notif existante avec le même tag.
  /// Utile pour les rappels qui ne doivent pas s'empiler.
  tag?: string;
  icon?: string;
  badge?: string;
};

/// Envoie un push à tous les appareils abonnés du user.
/// Supprime automatiquement les subs invalides (HTTP 404/410) pour
/// garder la table propre.
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; pruned: number }> {
  ensureConfigured();
  const subs = await prisma.pushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  let sent = 0;
  let pruned = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
        );
        sent += 1;
      } catch (err: unknown) {
        const status =
          typeof err === "object" && err && "statusCode" in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;
        // 404 / 410 = abonnement révoqué côté navigateur — on purge.
        // Tout autre code : on laisse, ça peut être transitoire.
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } });
          pruned += 1;
        } else {
          console.warn("[push] send failed", { endpoint: sub.endpoint, status, err });
        }
      }
    }),
  );

  return { sent, pruned };
}
