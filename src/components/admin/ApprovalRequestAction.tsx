"use client";

import type { ComponentProps } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ApprovalPolicyKey } from "@/lib/admin-approval-policy";
import { ApprovalRequestDialog, type ApprovalInitialValues } from "./ApprovalRequestDialog";

interface ApprovalRequestActionProps {
  policyKey: ApprovalPolicyKey;
  initialValues?: ApprovalInitialValues;
  label?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
  className?: string;
}

export function ApprovalRequestAction({
  policyKey,
  initialValues,
  label = "申请 owner 审批",
  variant = "outline",
  size = "sm",
  className,
}: ApprovalRequestActionProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && (
        <ApprovalRequestDialog
          open
          onClose={() => setOpen(false)}
          initialPolicyKey={policyKey}
          initialValues={initialValues}
          lockPolicy
        />
      )}
    </>
  );
}
