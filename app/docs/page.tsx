"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { PROJECT_DOCS, PROJECT_DOCS_META } from "@/lib/project-docs";

export default function DocsPage() {
  const [activeId, setActiveId] = useState(PROJECT_DOCS[0]?.id ?? "");
  const current =
    PROJECT_DOCS.find((s) => s.id === activeId) ?? PROJECT_DOCS[0];

  if (!current) {
    return (
      <main style={{ padding: 40, fontFamily: "system-ui, sans-serif" }}>
        <h1>Project Docs</h1>
        <p>No documentation was generated for this project.</p>
      </main>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        color: "#1a2238",
        background: "#f7f8fc",
      }}
    >
      <aside
        style={{
          width: 280,
          flexShrink: 0,
          borderRight: "1px solid #e4e8f2",
          background: "#fff",
          padding: "24px 16px",
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
        }}
      >
        <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "#93a0bd", marginBottom: 6 }}>
          AI Blueprint
        </div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>
          {PROJECT_DOCS_META.domain}
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {PROJECT_DOCS.map((section) => {
            const active = section.id === activeId;
            return (
              <button
                key={section.id}
                onClick={() => setActiveId(section.id)}
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 12px",
                  fontSize: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: active ? "#eef1ff" : "transparent",
                  color: active ? "#3a52d6" : "#4a5578",
                  fontWeight: active ? 600 : 500,
                }}
              >
                <span style={{ fontSize: 16 }}>{section.icon}</span>
                <span>{section.title}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main style={{ flex: 1, padding: "40px 48px", maxWidth: 900 }}>
        <div style={{ fontSize: 13, color: "#93a0bd", marginBottom: 8 }}>
          {current.agent}
        </div>
        <h1 style={{ fontSize: 28, margin: "0 0 4px" }}>
          {current.icon} {current.title}
        </h1>
        <p style={{ color: "#6b7699", marginBottom: 28, fontSize: 14 }}>
          Prompt: {PROJECT_DOCS_META.prompt}
        </p>
        <article style={{ lineHeight: 1.7, fontSize: 15 }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {current.content}
          </ReactMarkdown>
        </article>
      </main>
    </div>
  );
}
