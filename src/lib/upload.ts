/**
 * 文件上传工具
 * TODO: 实现完整功能
 */

export interface UploadResult {
  url: string;
  filename: string;
  size: number;
}

export async function uploadFile(_file: File): Promise<UploadResult | null> {
  // TODO: 实现文件上传
  return null;
}

export async function deleteFile(_url: string): Promise<boolean> {
  // TODO: 实现文件删除
  return false;
}
