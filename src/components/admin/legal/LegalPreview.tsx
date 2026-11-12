"use client";

import { Modal } from "@/components/ui/Modal";
import { PolicyDocument } from "@/components/ui/PolicyDocument";
import type { LegalDocumentContent } from "@/types/legal";

interface LegalPreviewProps {
  open: boolean;
  onClose: () => void;
  content: LegalDocumentContent;
}

export function LegalPreview({ open, onClose, content }: LegalPreviewProps) {
  return (
    <Modal open={open} onClose={onClose} title="预览" size="xl">
      <div className="rounded-xl bg-[#fefcf8] px-4 py-6 sm:px-8 sm:py-10">
        <PolicyDocument content={content} />
      </div>
    </Modal>
  );
}
