"use client";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Insight } from "@/services/api";

interface Props {
  insights: Insight[];
}

const formatVND = (v: number) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(v);

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="font-mono font-medium">
            {p.dataKey === "roas"
              ? `${Number(p.value).toFixed(2)}x`
              : p.dataKey === "ctr"
              ? `${Number(p.value).toFixed(2)}%`
              : `${formatVND(p.value)}₫`}
          </span>
        </div>
      ))}
    </div>
  );
};

export default function SpendChart({ insights }: Props) {
  if (!insights.length) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
        Chưa có dữ liệu
      </div>
    );
  }

  const data = insights.map((r) => ({
    date: r.date.slice(5),   // MM-DD
    spend: Number(r.spend),
    cpa: Number(r.cpa),
    roas: Number(r.roas),
    ctr: Number(r.ctr),
  }));

  return (
    <div className="space-y-6">
      {/* Spend + CPA */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">
          Spend & CPA Trend
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis
              yAxisId="spend"
              orientation="left"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <YAxis
              yAxisId="cpa"
              orientation="right"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="spend" dataKey="spend" name="Spend (₫)" fill="#818cf8" opacity={0.7} radius={[3, 3, 0, 0]} />
            <Line yAxisId="cpa" dataKey="cpa" name="CPA (₫)" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ROAS + CTR */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">
          ROAS & CTR Trend
        </p>
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="roas" orientation="left" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}x`} />
            <YAxis yAxisId="ctr" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line yAxisId="roas" dataKey="roas" name="ROAS" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
            <Line yAxisId="ctr" dataKey="ctr" name="CTR" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
