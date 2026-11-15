import type { AdminPermission } from "@/lib/admin-permissions";

export const BA_STEP_UP_ACTIONS = {
  "ba.certificates.issue": "ba:certificates:issue",
  "ba.certificates.revoke": "ba:certificates:revoke",
  "ba.certificates.delete": "ba:certificates:delete",
} as const satisfies Record<string, AdminPermission>;

export type BaStepUpAction = keyof typeof BA_STEP_UP_ACTIONS;

export const BA_STEP_UP_ACTION_LABELS: Record<BaStepUpAction, string> = {
  "ba.certificates.issue": "BA 证书核发",
  "ba.certificates.revoke": "BA 证书吊销",
  "ba.certificates.delete": "BA 证书删除",
};

export function isBaStepUpAction(value: string): value is BaStepUpAction {
  return value in BA_STEP_UP_ACTIONS;
}

export function baStepUpPermission(action: BaStepUpAction): AdminPermission {
  return BA_STEP_UP_ACTIONS[action];
}
