import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LicensePlan } from "@/lib/licenses/types";

const PLAN_STYLES: Record<LicensePlan, string> = {
  Trial: "border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-400",
  Standard: "border-sky-300 text-sky-700 dark:border-sky-900 dark:text-sky-300",
  Enterprise:
    "border-violet-300 text-violet-700 dark:border-violet-900 dark:text-violet-300",
};

export function PlanBadge({ plan }: { plan: LicensePlan }) {
  return (
    <Badge variant="outline" className={cn("font-normal", PLAN_STYLES[plan])}>
      {plan}
    </Badge>
  );
}
