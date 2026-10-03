import { useMemo } from "react";
import hljs from "highlight.js/lib/core";
import cpp from "highlight.js/lib/languages/cpp";
import x86asm from "highlight.js/lib/languages/x86asm";
import cmake from "highlight.js/lib/languages/cmake";
import json from "highlight.js/lib/languages/json";

hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("x86asm", x86asm);
hljs.registerLanguage("cmake", cmake);
hljs.registerLanguage("json", json);

export type CodeLanguage = "cpp" | "x86asm" | "cmake" | "json" | "text";

export function languageFor(path: string): CodeLanguage {
  if (/\.(c|cc|cpp|cxx|h|hh|hpp)$/i.test(path)) return "cpp";
  if (/CMakeLists\.txt$|\.cmake$/i.test(path)) return "cmake";
  if (/\.json$/i.test(path)) return "json";
  return "text";
}

export function CodeBlock({ code, language = "cpp", maxHeight }:
  { code: string; language?: CodeLanguage; maxHeight?: number | string }) {
  const html = useMemo(() => {
    if (!code) return "";
    if (language === "text" || code.length > 400_000) return escape(code);
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  }, [code, language]);
  if (!code) return <div className="code empty-code">(empty)</div>;
  return (
    <pre className="code" style={{ maxHeight }}>
      <code className={`hljs language-${language}`} dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
