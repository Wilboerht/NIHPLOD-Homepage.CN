/**
 * 企业微信自建应用 API 工具
 * 用于操作企微文档（在线表格/智能表格）
 */

// 简单的内存缓存，用于存储 Access Token
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * 获取企业微信应用 Access Token
 */
async function getWecomAccessToken(): Promise<string | null> {
  const corpId = process.env.WECOM_CORP_ID;
  const secret = process.env.WECOM_APP_SECRET;

  if (!corpId || !secret) {
    console.error("企微应用配置不足: WECOM_CORP_ID 或 WECOM_APP_SECRET 缺失");
    return null;
  }

  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) {
    return cachedToken.token;
  }

  try {
    const res = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${secret}`
    );
    const data = await res.json();

    if (data.errcode === 0) {
      // 提前 10 分钟过期以确安全
      cachedToken = {
        token: data.access_token,
        expiresAt: now + (data.expires_in - 600) * 1000,
      };
      return data.access_token;
    } else {
      console.error("获取企微 Token 失败:", data.errmsg);
      return null;
    }
  } catch (error) {
    console.error("企微 Token 请求异常:", error);
    return null;
  }
}

/**
 * 获取智能表格的第一个 Sheet ID
 */
async function getFirstSheetId(accessToken: string, docId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/get_sheet_info?access_token=${accessToken}&docid=${docId}`
    );
    const data = await res.json();

    if (data.errcode === 0 && data.sheet_list && data.sheet_list.length > 0) {
      return data.sheet_list[0].sheet_id;
    }
    return null;
  } catch (error) {
    console.error("获取企微表格信息异常:", error);
    return null;
  }
}

/**
 * 向企微智能表格追加一条留言记录
 */
export async function appendMessageToWecomSheet(data: {
  name: string;
  email: string;
  type?: string;
  content: string;
}) {
  const docId = process.env.WECOM_SHEET_DOC_ID;

  if (!docId) {
    console.warn("未配置 WECOM_SHEET_DOC_ID，跳过表格同步");
    return;
  }

  const token = await getWecomAccessToken();
  if (!token) return;

  // 获取第一个工作表的 ID
  const sheetId = await getFirstSheetId(token, docId);
  if (!sheetId) {
    console.error("无法找到目标表格的工作表 ID");
    return;
  }

  try {
    const timestamp = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    
    // 构造写入数据
    // 注意：这里的 key 必须与表格中的列名完全一致
    const recordValues: Record<string, any> = {
      "姓名": data.name,
      "邮箱": data.email || "未填写",
      "咨询类型": data.type || "通用",
      "咨询内容": data.content,
      "提交时间": timestamp,
    };

    const response = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/add_records?access_token=${token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docid: docId,
          sheet_id: sheetId,
          records: [
            {
              values: recordValues,
            },
          ],
        }),
      }
    );

    const result = await response.json();
    if (result.errcode === 0) {
      console.log("✅ 成功同步至企微智能表格");
    } else {
      console.error("同步至企微表格失败:", result.errmsg);
    }
  } catch (error) {
    console.error("企微表格 API 请求异常:", error);
  }
}
