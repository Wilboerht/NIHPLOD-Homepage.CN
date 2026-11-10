import { enqueueNotification } from "@/lib/notification-outbox";

export async function enqueueSecurityActionNotification(params: {
  userId: string;
  phone: string;
  action: string;
  reference: string;
}): Promise<void> {
  await enqueueNotification({
    idempotencyKey: `security-action:${params.reference}:sms`,
    channel: "SMS",
    eventType: "security_action",
    templateKey: "security_action",
    userId: params.userId,
    recipient: { phone: params.phone },
    payload: { action: params.action, time: new Date().toISOString() },
    aggregateType: "user_security",
    aggregateId: params.reference,
  });
}
