"use client";

import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isWeakPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "@/components/website/auth/auth-utils";

interface PasswordRule {
  key: string;
  label: string;
  met: boolean;
}

/**
 * 密码规则实时清单：满足一项亮一项，避免"提交一次只报一条错"的试错接力。
 * 规则口径与后端 lib/password.ts 一致（经 auth-utils 客户端副本，不打包 bcryptjs）。
 */
export function PasswordRulesChecklist({
  password,
  className,
}: {
  password: string;
  className?: string;
}) {
  const rules: PasswordRule[] = [
    {
      key: "length",
      label: `${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} 个字符`,
      met: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    },
    { key: "upper", label: "包含大写字母", met: /[A-Z]/.test(password) },
    { key: "lower", label: "包含小写字母", met: /[a-z]/.test(password) },
    { key: "digit", label: "包含数字", met: /[0-9]/.test(password) },
    {
      key: "weak",
      label: "不是常见弱密码或连续字符",
      met: password.length > 0 && !isWeakPassword(password),
    },
  ];

  return (
    <ul aria-label="密码要求" className={cn("flex flex-wrap gap-x-4 gap-y-1", className)}>
      {rules.map((rule) => (
        <li
          key={rule.key}
          className={cn(
            "flex items-center gap-1 text-xs transition-colors",
            rule.met ? "text-emerald-600" : "text-brand-charcoal/65"
          )}
        >
          {rule.met ? (
            <Check className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Circle className="h-3 w-3" aria-hidden="true" />
          )}
          {rule.label}
        </li>
      ))}
    </ul>
  );
}
