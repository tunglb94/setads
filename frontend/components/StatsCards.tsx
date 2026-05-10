"use client";
import { AdSet } from "@/services/api";
import { TrendingUp, DollarSign, Target, Activity } from "lucide-react";

interface Props {
  adsets: AdSet[];
}

export default function StatsCards({ adsets }: Props) {
  const active = adsets.filter((a) => a.status === "ACTIVE").length;
  const autoPaused = adsets.filter((a) => a.auto_paused).length;

  const totalSpend = adsets.reduce((s, a) => s + (a.latest_insight?.spend ?? 0), 0);
  const avgCpa = (() => {
    const cpas = adsets.map((a) => a.latest_insight?.cpa ?? 0).filter((c) => c > 0);
    return cpas.length ? cpas.reduce((s, c) => s + c, 0) / cpas.length : 0;
  })();
  const avgRoas = (() => {
    const roases = adsets.map((a) => a.latest_insight?.roas ?? 0).filter((r) => r > 0);
    return roases.length ? roases.reduce((s, r) => s + r, 0) / roases.length : 0;
  })();

  const cards = [
    {
      label: "Active AdSets",
      value: `${active} / ${adsets.length}`,
      sub: `${autoPaused} auto-paused`,
      icon: Activity,
      color: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Total Spend (3d)",
      value: new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(totalSpend),
      sub: "Across all accounts",
      icon: DollarSign,
      color: "text-blue-600 bg-blue-50",
    },
    {
      label: "Avg CPA",
      value: avgCpa > 0
        ? new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(avgCpa)
        : "—",
      sub: "Last day data",
      icon: Target,
      color: avgCpa > 50000 ? "text-red-600 bg-red-50" : "text-violet-600 bg-violet-50",
    },
    {
      label: "Avg ROAS",
      value: avgRoas > 0 ? `${avgRoas.toFixed(2)}x` : "—",
      sub: "Return on ad spend",
      icon: TrendingUp,
      color: avgRoas >= 2 ? "text-green-600 bg-green-50" : "text-orange-600 bg-orange-50",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map(({ label, value, sub, icon: Icon, color }) => (
        <div key={label} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-500 font-medium">{label}</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
            </div>
            <div className={`p-2.5 rounded-xl ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
