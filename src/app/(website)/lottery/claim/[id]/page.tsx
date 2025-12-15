"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { m } from "framer-motion";
import { Loader2, CheckCircle, AlertCircle, Gift, Phone } from "lucide-react";
import Link from "next/link";

interface WinnerInfo {
  id: string;
  phone: string;
  drawingDataUrl?: string;
  activity: {
    name: string;
    prizeName: string;
    prizeImage?: string;
  };
  claimed: boolean;
  claimInfo?: {
    name: string;
    address: string;
    phone: string;
  };
}

export default function ClaimPage() {
  const params = useParams();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<"verify" | "form" | "success" | "error">("verify");
  const [winner, setWinner] = useState<WinnerInfo | null>(null);
  const [error, setError] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [formData, setFormData] = useState({ name: "", address: "", phone: "" });

  // 获取中奖信息
  useEffect(() => {
    const fetchWinner = async () => {
      try {
        const res = await fetch(`/api/lottery/claim/${params.id}`);
        const data = await res.json();

        if (data.success) {
          setWinner(data.data);
          if (data.data.claimed) {
            setStep("success");
          }
        } else {
          setError(data.error?.message || "无效的领奖链接");
          setStep("error");
        }
      } catch {
        setError("网络错误");
        setStep("error");
      } finally {
        setLoading(false);
      }
    };
    fetchWinner();
  }, [params.id]);

  // 倒计时
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // 发送验证码
  const sendCode = async () => {
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      setError("请输入正确的手机号");
      return;
    }
    
    setVerifying(true);
    try {
      const res = await fetch("/api/lottery/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, entryId: params.id }),
      });
      const data = await res.json();

      if (data.success) {
        setCodeSent(true);
        setCountdown(60);
        setError("");
      } else {
        setError(data.error?.message || "发送失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setVerifying(false);
    }
  };

  // 验证手机号
  const handleVerify = async () => {
    if (!code || code.length !== 6) {
      setError("请输入6位验证码");
      return;
    }

    setVerifying(true);
    try {
      const res = await fetch("/api/lottery/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code, entryId: params.id }),
      });
      const data = await res.json();

      if (data.success) {
        setFormData({ ...formData, phone });
        setStep("form");
        setError("");
      } else {
        setError(data.error?.message || "验证失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setVerifying(false);
    }
  };

  // 提交领奖信息
  const handleSubmit = async () => {
    if (!formData.name || !formData.address || !formData.phone) {
      setError("请填写完整信息");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/lottery/claim/${params.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();

      if (data.success) {
        setStep("success");
      } else {
        setError(data.error?.message || "提交失败");
      }
    } catch {
      setError("网络错误");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-pink-50 to-white">
        <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white py-10 px-4">
      <div className="max-w-md mx-auto">
        {/* 错误状态 */}
        {step === "error" && (
          <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20">
            <AlertCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-gray-800 mb-2">无法领奖</h1>
            <p className="text-gray-500 mb-6">{error}</p>
            <Link href="/lottery/garden" className="text-pink-500 hover:underline">返回花园</Link>
          </m.div>
        )}

        {/* 验证步骤 */}
        {step === "verify" && winner && (
          <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="text-center mb-8">
              <div className="text-6xl mb-4">🎉</div>
              <h1 className="text-2xl font-bold text-gray-800">恭喜中奖！</h1>
              <p className="text-gray-500 mt-2">{winner.activity.name}</p>
            </div>

            <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
              <div className="flex items-center gap-4 mb-4">
                {winner.activity.prizeImage ? (
                  <img src={winner.activity.prizeImage} alt="" className="w-20 h-20 rounded-xl object-cover" />
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-pink-100 flex items-center justify-center">
                    <Gift className="h-10 w-10 text-pink-500" />
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-500">您获得了</p>
                  <p className="text-xl font-bold text-pink-600">{winner.activity.prizeName}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm text-gray-600 mb-3">请验证您的手机号领取奖品</p>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="请输入参与时的手机号"
                      maxLength={11}
                      className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500 focus:border-transparent outline-none"
                    />
                    <button
                      onClick={sendCode}
                      disabled={verifying || countdown > 0}
                      className="px-4 py-3 bg-pink-100 text-pink-600 rounded-xl font-medium disabled:opacity-50 whitespace-nowrap"
                    >
                      {countdown > 0 ? `${countdown}s` : "获取验证码"}
                    </button>
                  </div>
                  {codeSent && (
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      placeholder="请输入6位验证码"
                      maxLength={6}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500 focus:border-transparent outline-none"
                    />
                  )}
                  {error && <p className="text-red-500 text-sm">{error}</p>}
                </div>
              </div>
            </div>

            <button
              onClick={handleVerify}
              disabled={!codeSent || verifying}
              className="w-full py-4 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl font-medium disabled:opacity-50"
            >
              {verifying ? "验证中..." : "验证并领奖"}
            </button>
          </m.div>
        )}

        {/* 填写收货信息 */}
        {step === "form" && winner && (
          <m.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="text-center mb-6">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
              <h1 className="text-xl font-bold text-gray-800">验证成功</h1>
              <p className="text-gray-500">请填写收货信息</p>
            </div>

            <div className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">收件人姓名</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">联系电话</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">收货地址</label>
                <textarea
                  rows={3}
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="省市区 + 详细地址"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500 outline-none"
                />
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full mt-6 py-4 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl font-medium disabled:opacity-50"
            >
              {submitting ? "提交中..." : "确认领取"}
            </button>
          </m.div>
        )}

        {/* 成功状态 */}
        {step === "success" && (
          <m.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-10">
            <div className="text-6xl mb-4">🎁</div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">领取成功！</h1>
            <p className="text-gray-500 mb-6">奖品将在 7 个工作日内寄出，请注意查收</p>
            <div className="bg-green-50 rounded-xl p-4 text-left">
              <p className="text-sm text-green-700">我们会通过短信通知您物流信息，请保持手机畅通。</p>
            </div>
            <Link
              href="/lottery/garden"
              className="inline-block mt-8 px-8 py-3 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200"
            >
              返回花园
            </Link>
          </m.div>
        )}
      </div>
    </div>
  );
}

