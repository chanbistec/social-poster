import { PlatformType } from "@/lib/types";
import { cn } from "@/lib/utils";

const colors: Record<PlatformType, string> = {
  youtube: "bg-red-500/20 text-red-300 border-red-500/30",
  instagram: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  facebook: "bg-blue-500/20 text-blue-300 border-blue-500/30",
};

export default function PlatformBadge({
  platform,
  status,
}: {
  platform: PlatformType;
  status: "valid" | "expiring" | "expired";
}) {
  const statusColor =
    status === "valid"
      ? "text-emerald-400"
      : status === "expiring"
      ? "text-amber-400"
      : "text-rose-400";

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-2 text-xs",
        colors[platform]
      )}
    >
      <span className="font-medium capitalize">{platform}</span>
      <span className={cn("ml-auto text-[10px] uppercase", statusColor)}>
        {status}
      </span>
    </div>
  );
}
