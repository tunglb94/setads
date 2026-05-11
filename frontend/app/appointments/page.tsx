"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, Phone, Stethoscope, RefreshCw, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { useFilterStore } from "@/store/useFilterStore";
import { appointmentApi, Appointment } from "@/services/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string | null) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function fmtDetected(s: string) {
  return new Date(s).toLocaleString("vi-VN", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_CFG = {
  SCHEDULED: { label: "Đã đặt lịch", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  COMPLETED: { label: "Đã thực hiện", cls: "bg-green-100 text-green-700 border-green-200" },
  CANCELLED: { label: "Đã huỷ",      cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

// ── Appointment card ──────────────────────────────────────────────────────────

function AppointmentCard({ appt }: { appt: Appointment }) {
  const qc = useQueryClient();
  const { mutate: updateStatus, isPending } = useMutation({
    mutationFn: (status: Appointment["status"]) => appointmentApi.updateStatus(appt.id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
    onError: () => toast.error("Không thể cập nhật trạng thái"),
  });

  const cfg = STATUS_CFG[appt.status];

  return (
    <div className={cn(
      "bg-white rounded-xl border shadow-sm p-4 flex flex-col gap-3",
      appt.status === "CANCELLED" && "opacity-60"
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900">{appt.patient_name_display}</p>
          {appt.phone && (
            <a href={`tel:${appt.phone}`} className="flex items-center gap-1 text-sm text-blue-600 hover:underline mt-0.5">
              <Phone className="h-3 w-3" />{appt.phone}
            </a>
          )}
        </div>
        <Badge variant="outline" className={cn("text-xs shrink-0", cfg.cls)}>
          {cfg.label}
        </Badge>
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="flex items-center gap-1.5 text-gray-600">
          <Calendar className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <span>
            {fmtDate(appt.appointment_date)}
            {appt.appointment_time && ` · ${appt.appointment_time}`}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-gray-500 text-xs">
          <span className="truncate">{appt.page_name}</span>
        </div>
      </div>

      {appt.service && (
        <div className="flex items-start gap-1.5 text-sm text-gray-700">
          <Stethoscope className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
          <span className="line-clamp-2">{appt.service}</span>
        </div>
      )}

      {/* Status actions */}
      {appt.status === "SCHEDULED" && (
        <div className="flex gap-2 pt-1 border-t border-gray-50">
          <Button
            size="sm" variant="outline"
            className="flex-1 h-7 text-xs text-green-700 border-green-200 hover:bg-green-50"
            disabled={isPending}
            onClick={() => updateStatus("COMPLETED")}
          >
            Đã thực hiện
          </Button>
          <Button
            size="sm" variant="ghost"
            className="flex-1 h-7 text-xs text-gray-500 hover:bg-gray-100"
            disabled={isPending}
            onClick={() => updateStatus("CANCELLED")}
          >
            Huỷ lịch
          </Button>
        </div>
      )}

      <p className="text-[10px] text-gray-400">Phát hiện: {fmtDetected(appt.detected_at)}</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AppointmentsPage() {
  const [statusFilter, setStatusFilter] = useState<string>("SCHEDULED");
  const {
    leadsDateRange, leadsCustomStart, leadsCustomEnd,
    setLeadsDateRange, setLeadsCustomDates,
  } = useFilterStore();
  const qc = useQueryClient();

  const dateParams = leadsDateRange === "custom" && leadsCustomStart && leadsCustomEnd
    ? { date_from: leadsCustomStart, date_to: leadsCustomEnd }
    : { days: leadsDateRange as number };

  // Fetch all statuses at once so we can compute stats without extra requests
  const { data: allAppointments = [], isLoading } = useQuery({
    queryKey: ["appointments", dateParams],
    queryFn: async () => {
      const { data } = await appointmentApi.list({
        ...dateParams,
        page_size: 500,
      } as Parameters<typeof appointmentApi.list>[0]);
      // API returns PaginatedResponse; extract results array
      return Array.isArray(data) ? data : (data as any).results ?? [];
    },
  });

  const appointments: Appointment[] = statusFilter === "ALL"
    ? allAppointments
    : allAppointments.filter((a: Appointment) => a.status === statusFilter);

  const { mutate: scan, isPending: scanning } = useMutation({
    mutationFn: () => appointmentApi.scan(),
    onSuccess: (res) => {
      toast.success(`Quét xong: tìm thấy ${res.data.appointments_created} lịch hẹn mới`);
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: () => toast.error("Quét thất bại"),
  });

  const total = allAppointments.length;
  const scheduled = allAppointments.filter((a: Appointment) => a.status === "SCHEDULED").length;
  const completed = allAppointments.filter((a: Appointment) => a.status === "COMPLETED").length;

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Title + actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Lịch hẹn</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Tự động phát hiện từ tin nhắn xác nhận của nhân viên
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline" size="sm"
            className="gap-1.5 text-violet-700 border-violet-200 hover:bg-violet-50"
            onClick={() => scan()}
            disabled={scanning}
          >
            {scanning
              ? <span className="h-3 w-3 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
              : <ScanSearch className="h-3.5 w-3.5" />}
            Quét tin nhắn cũ
          </Button>
          <Button
            variant="outline" size="sm"
            className="gap-1.5"
            onClick={() => qc.invalidateQueries({ queryKey: ["appointments"] })}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Làm mới
          </Button>
        </div>
      </div>

      {/* Date filter */}
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3 shadow-sm">
        <DateRangeFilter
          value={leadsDateRange}
          customStart={leadsCustomStart}
          customEnd={leadsCustomEnd}
          onChange={setLeadsDateRange}
          onCustomChange={setLeadsCustomDates}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Tổng lịch hẹn", value: total, cls: "text-gray-900" },
          { label: "Chưa đến", value: scheduled, cls: "text-blue-700" },
          { label: "Đã thực hiện", value: completed, cls: "text-green-700" },
        ].map(({ label, value, cls }) => (
          <div key={label} className="bg-white rounded-xl border shadow-sm p-4 text-center">
            <p className={cn("text-2xl font-bold", cls)}>{value}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 border-b border-gray-100">
        {[
          { key: "SCHEDULED", label: "Chưa đến" },
          { key: "COMPLETED", label: "Đã thực hiện" },
          { key: "CANCELLED", label: "Đã huỷ" },
          { key: "ALL",       label: "Tất cả" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
              statusFilter === key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : appointments?.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Chưa có lịch hẹn nào trong khoảng thời gian này</p>
          <p className="text-xs mt-1">Nhấn "Quét tin nhắn cũ" để tìm lịch hẹn từ tin nhắn đã gửi</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {appointments?.map(appt => <AppointmentCard key={appt.id} appt={appt} />)}
        </div>
      )}
    </div>
  );
}
