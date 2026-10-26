/**
 * html-sanitize 工具测试
 * 重点覆盖 htmlToPlainText（小程序等纯文本消费方的展示字段转换）：
 * 块级结构保留换行、列表符号、链接取文字、实体解码、空白规范化
 */
import { describe, it, expect } from "vitest";
import { htmlToPlainText } from "@/lib/html-sanitize";

describe("htmlToPlainText", () => {
  it("null/undefined/空串返回空字符串", () => {
    expect(htmlToPlainText(null)).toBe("");
    expect(htmlToPlainText(undefined)).toBe("");
    expect(htmlToPlainText("")).toBe("");
  });

  it("单段落剥离标签", () => {
    expect(htmlToPlainText("<p>温和洁面</p>")).toBe("温和洁面");
  });

  it("多个块级元素保留段落换行", () => {
    expect(htmlToPlainText("<p>第一段</p><p>第二段</p>")).toBe("第一段\n第二段");
  });

  it("<br> 转换行，行内标签直接剥离", () => {
    expect(htmlToPlainText("<p>你好<br><strong>粗体</strong>与<em>斜体</em></p>")).toBe(
      "你好\n粗体与斜体"
    );
  });

  it("列表项转项目符号", () => {
    expect(htmlToPlainText("<ul><li>一项</li><li>二项</li></ul>")).toBe("• 一项\n• 二项");
  });

  it("链接保留文字丢弃地址", () => {
    expect(htmlToPlainText('<p>访问 <a href="https://nihplod.cn">官网</a></p>')).toBe("访问 官网");
  });

  it("解码常见实体且避免二次解码", () => {
    expect(htmlToPlainText("<p>A &amp; B &lt;C&gt; &quot;D&quot; &#39;E&#39;&nbsp;F</p>")).toBe(
      "A & B <C> \"D\" 'E' F"
    );
  });

  it("压缩行内空白与连续空行", () => {
    expect(htmlToPlainText("<p>  a   b  </p><p></p><p></p><p>c</p>")).toBe("a b\n\nc");
  });

  it("纯文本（无标签）原样返回", () => {
    expect(htmlToPlainText("取适量于掌心搓揉起泡")).toBe("取适量于掌心搓揉起泡");
  });
});
