/**
 * 生成隐私政策和服务条款的 Word 文档
 * 用法: node scripts/generate-legal-docs.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";

// ============ 提取隐私政策内容 ============
function extractPrivacyData() {
  const source = readFileSync("src/app/(website)/privacy/PrivacyContent.tsx", "utf8");
  // 提取 privacyData 对象
  const startMarker = "const privacyData: Record<string, SectionContent> = ";
  const startIdx = source.indexOf(startMarker);
  const objStart = startIdx + startMarker.length;
  // 找到对象结束 (};\n\n// ====)
  const endMarker = "};\n\n// ====";
  const endIdx = source.indexOf(endMarker, objStart);
  const objStr = source.substring(objStart, endIdx + 1);
  
  // 用 Function 构造器安全执行
  const fn = new Function(`return ${objStr}`);
  return fn();
}

// ============ 提取服务条款内容 ============
function extractTermsData() {
  const source = readFileSync("src/app/(website)/terms/page.tsx", "utf8");
  const startMarker = "const defaultContent: TermsPageContent = ";
  const startIdx = source.indexOf(startMarker);
  const objStart = startIdx + startMarker.length;
  // 找到对象结束 - 在 "export const metadata" 之前
  const endMarker = "};\n\nexport const metadata";
  const endIdx = source.indexOf(endMarker, objStart);
  const objStr = source.substring(objStart, endIdx + 1);
  
  const fn = new Function(`return ${objStr}`);
  return fn();
}

// ============ 文本转段落 ============
function textToParagraphs(text) {
  const paragraphs = [];
  // 按 \n\n 分段
  const blocks = text.split("\n\n");
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    
    // 判断是否是标题行（以"一、""二、"等或数字.开头且较短）
    const isChapterTitle = /^[一二三四五六七八九十]+、/.test(trimmed) && trimmed.length < 30;
    const isSectionTitle = /^（[一二三四五六七八九十]+）/.test(trimmed) && trimmed.length < 40;
    
    if (isChapterTitle) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: trimmed, bold: true, size: 28, font: "SimSun" })],
        spacing: { before: 400, after: 200 },
        heading: HeadingLevel.HEADING_2,
      }));
    } else if (isSectionTitle) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: trimmed, bold: true, size: 24, font: "SimSun" })],
        spacing: { before: 300, after: 150 },
        heading: HeadingLevel.HEADING_3,
      }));
    } else {
      // 处理段内换行
      const lines = trimmed.split("\n");
      for (const line of lines) {
        const l = line.trim();
        if (!l) continue;
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: l, size: 21, font: "SimSun" })],
          spacing: { before: 60, after: 60 },
          indent: { firstLine: 420 },
        }));
      }
    }
  }
  return paragraphs;
}

// ============ 生成隐私政策文档 ============
async function generatePrivacyDoc() {
  const data = extractPrivacyData();
  const sectionOrder = ["ch1","ch2","ch3","ch4","ch5","ch6","ch7","ch8","ch9","ch10","ch11","ch12","ch13","ch14"];
  
  const children = [
    new Paragraph({
      children: [new TextRun({ text: "NIHPLOD 旎柏隐私政策", bold: true, size: 36, font: "SimHei" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "旎柏（上海）商贸有限公司", size: 24, font: "SimSun" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    }),
  ];
  
  for (const key of sectionOrder) {
    const section = data[key];
    if (!section) continue;
    for (const content of section.content) {
      children.push(...textToParagraphs(content));
    }
  }
  
  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
      },
      children,
    }],
  });
  
  const buffer = await Packer.toBuffer(doc);
  writeFileSync("NIHPLOD隐私政策.docx", buffer);
  console.log("✓ 已生成: NIHPLOD隐私政策.docx");
}

// ============ 生成服务条款文档 ============
async function generateTermsDoc() {
  const data = extractTermsData();
  const content = data.tabs.general.content;
  
  const children = [
    new Paragraph({
      children: [new TextRun({ text: "NIHPLOD 旎柏服务条款", bold: true, size: 36, font: "SimHei" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "旎柏（上海）商贸有限公司", size: 24, font: "SimSun" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
    }),
  ];
  
  for (const section of content) {
    children.push(...textToParagraphs(section));
  }
  
  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
      },
      children,
    }],
  });
  
  const buffer = await Packer.toBuffer(doc);
  writeFileSync("NIHPLOD服务条款.docx", buffer);
  console.log("✓ 已生成: NIHPLOD服务条款.docx");
}

// ============ 主流程 ============
async function main() {
  try {
    await generatePrivacyDoc();
    await generateTermsDoc();
    console.log("\n完成！文件位于项目根目录。");
  } catch (e) {
    console.error("生成失败:", e.message);
    process.exit(1);
  }
}

main();
