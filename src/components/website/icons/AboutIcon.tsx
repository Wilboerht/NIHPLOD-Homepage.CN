/**
 * 自定义 "关于旎柏 / 品牌故事" SVG 图标
 *
 * 通过 currentColor 继承父元素文字颜色，便于在不同状态下统一换色。
 */
export function AboutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        stroke="currentColor"
        strokeWidth="1.82"
        d="M2.889 12.422c0 5.584 4.527 10.11 10.11 10.11q1.039-.001 2.017-.2c1.034-.228.587 1.232 1.31 1.353.883.147 6.785-5.082 6.785-11.263C23.111 6.837 18.584 2.31 13 2.31S2.889 6.837 2.889 12.42Z"
      />
      <path
        fill="currentColor"
        d="M8.602 17.29a.29.29 0 0 1-.29-.288V9.734a.29.29 0 0 1 .48-.218l1.415 1.238a.3.3 0 0 1 .099.218v6.03c0 .16-.13.288-.29.288zm-.192-6.825a.3.3 0 0 1-.097-.216V8.545c0-.31.367-.476.6-.27l5.575 4.928V8.33c0-.16.13-.289.289-.289h1.415c.16 0 .289.13.289.29v8.456a.361.361 0 0 1-.6.271z"
      />
      <circle cx="18.628" cy="16.209" r=".934" fill="currentColor" />
    </svg>
  );
}
