"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authApi, setAuthToken } from "@/services/api";
import { Brain, Lock } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error("Vui lòng nhập đầy đủ thông tin");
      return;
    }

    setLoading(true);
    try {
      const { data } = await authApi.login(username, password);
      setAuthToken(data.token);
      toast.success("Đăng nhập thành công");
      router.push("/");
    } catch {
      toast.error("Sai tên đăng nhập hoặc mật khẩu");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#1877F2] mb-4">
            <Brain className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Super Admin</h1>
          <p className="text-sm text-gray-500 mt-1">Meta Ads AI Management</p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleLogin}
          className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4"
        >
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">
              Tên đăng nhập
            </label>
            <Input
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Mật khẩu</label>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2" />
            ) : (
              <Lock className="h-4 w-4 mr-2" />
            )}
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </Button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          Super Admin Digital v1.0 · Chỉ dành cho nội bộ
        </p>
      </div>
    </div>
  );
}
