"use client";

import { ReactNode, useEffect } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/**
 * 通用模态框组件
 * TODO: 实现完整功能
 */
export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Content */}
      <div className="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-xl text-brand-charcoal">{title}</h2>
            <button onClick={onClose} className="text-brand-charcoal/60 hover:text-brand-charcoal">
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
