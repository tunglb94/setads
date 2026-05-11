"use client";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { DateRangeOption } from "@/store/useFilterStore";

const PRESETS: { label: string; value: DateRangeOption }[] = [
  { label: "3 ngày", value: 3 },
  { label: "7 ngày", value: 7 },
  { label: "30 ngày", value: 30 },
  { label: "Tuỳ chỉnh", value: "custom" },
];

interface DateRangeFilterProps {
  value: DateRangeOption;
  customStart: string;
  customEnd: string;
  onChange: (value: DateRangeOption) => void;
  onCustomChange: (start: string, end: string) => void;
  extraPresets?: { label: string; value: DateRangeOption }[];
}

export function DateRangeFilter({
  value,
  customStart,
  customEnd,
  onChange,
  onCustomChange,
  extraPresets,
}: DateRangeFilterProps) {
  const presets = extraPresets ?? PRESETS;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 text-xs text-gray-500 font-medium">
        <CalendarDays className="h-3.5 w-3.5" />
        Thời gian:
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map(({ label, value: v }) => (
          <button
            key={String(v)}
            onClick={() => onChange(v)}
            className={cn(
              "px-3 py-1 rounded-lg text-xs font-semibold transition-colors",
              value === v
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {value === "custom" && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <input
            type="date"
            value={customStart}
            max={customEnd || undefined}
            onChange={(e) => onCustomChange(e.target.value, customEnd)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
          <span className="text-xs text-gray-400">→</span>
          <input
            type="date"
            value={customEnd}
            min={customStart || undefined}
            onChange={(e) => onCustomChange(customStart, e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>
      )}
    </div>
  );
}
