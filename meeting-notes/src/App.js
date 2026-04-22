import { useState } from "react";

const PROJECTS = [
  { id: "colab-ui", label: "Co\\Lab UI", color: "#6366F1" },
  { id: "copygen", label: "CopyGen", color: "#E11D48" },
  { id: "dubsync", label: "Dubsync", color: "#0891B2" },
  { id: "apollo", label: "Apollo", color: "#EA580C" },
  { id: "ai-approvals", label: "AI Approvals", color: "#7C3AED" },
  { id: "xo-ai-team", label: "XO AI Team", color: "#059669" },
  { id: "knowledge-library", label: "Knowledge Library", color: "#B45309" },
  { id: "asset-library", label: "Asset Library", color: "#C2410C" },
  { id: "ai-production", label: "AI Production", color: "#0369A1" },
  { id: "dnai", label: "DNAi", color: "#BE185D" },
  { id: "direct-reports", label: "Direct Reports", color: "#475569" },
];

const NOTION_NOTES_DB     = "a5e8f353-a6b7-49eb-8895-b2d02ac9423a";
const NOTION_TASKS_DB     = "2aa7f330-9586-4244-9194-7adf6bc93141";
const NOTION_RESOURCES_DB = "c50a260e-3aa0-4ace-ba00-ac846f0cf49c";
const NOTION_TOKEN        = process.env.REACT_APP_NOTION_TOKEN;

const extractLinks = (text) =>
  [...text.matchAll(/https?:\/\/[^\s\)\"\']+/g)].map((m) => m[0]);

const today = () => new Date().toISOString().split("T")[0];
const todayFormatted = () =>
  new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function richText(str) {
  return [{ type: "text", text: { content: String(str || "").slice(0, 2000) } }];
}

function markdownToBlocks(md) {
  const blocks = [];
  for (const line of (md || "").split("\n")) {
    if (!line.trim()) continue;
    if (line.startsWith("## "))
      blocks.push({ object: "block", type: "heading_2", heading_2: { rich_text: richText(line.slice(3)) } });
    else if (line.startsWith("# "))
      blocks.push({ object: "block", type: "heading_1", heading_1: { rich_text: richText(line.slice(2)) } });
    else if (/^[-*] /.test(line))
      blocks.push({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: richText(line.slice(2)) } });
    else if (/^\d+\. /.test(line))
      blocks.push({ object: "block", type: "numbered_list_item", numbered_list_item: { rich_text: richText(line.replace(/^\d+\. /, "")) } });
    else
      blocks.push({ object: "block", type: "paragraph", paragraph: { rich_text: richText(line) } });
  }
  return blocks.slice(0, 40);
}

async function notionPost(endpoint, body) {
  const res = await fetch(`https://api.notion.com/v1/${endpoint}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.object === "error") throw new Error(data.message);
  return data;
}

async function saveToNotion(result, project) {
  const fullTitle = `${result.meetingType}: ${result.shortTitle} — ${todayFormatted()}`;

  const notePage = await notionPost("pages", {
    parent: { database_id: NOTION_NOTES_DB },
    properties: {
      Title: { title: richText(fullTitle) },
      Project: { select: { name: project.label } },
      Date: { date: { start: today() } },
      Summary: { rich_text: richText(result.summary || "") },
    },
    children: markdownToBlocks(result.cleanedNotes),
  });

  for (const todo of (result.todos || []).slice(0, 8)) {
    await notionPost("pages", {
      parent: { database_id: NOTION_TASKS_DB },
      properties: {
        Task: { title: richText(todo) },
        Project: { select: { name: project.label } },
        Status: { select: { name: "To Do" } },
        Source: { rich_text: richText(fullTitle) },
      },
    });
  }

  for (const link of (result.links || [])) {
    await notionPost("pages", {
      parent: { database_id: NOTION_RESOURCES_DB },
      properties: {
        Title: { title: richText(`Link from ${fullTitle}`) },
        Project: { select: { name: project.label } },
        URL: { url: link },
        "Date Added": { date: { start: today() } },
      },
    });
  }

  return { notionUrl: notePage.url, fullTitle };
}

async function processNotes(rawNotes, projectLabel, apiKey) {
  const links = extractLinks(rawNotes);
  const prompt = `You are a professional note-taker. Process these raw meeting notes for the "${projectLabel}" project.
Return ONLY a valid JSON object (no markdown, no backticks) with exactly these keys:
{
  "cleanedNotes": "Well-structured markdown. Use ## for sections, - for bullets.",
  "todos": ["action items starting with a verb, owner in brackets e.g. [Ritu] Do X"],
  "summary": "2-3 sentence executive summary",
  "meetingType": "One of: Meeting, Sync, Review, Workshop, Briefing",
  "shortTitle": "4-6 word description",
  "links": ${JSON.stringify(links)}
}
Raw notes:\n${rawNotes}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const text = data.content?.[0]?.text || "{}";
  try { return JSON.parse(text); }
  catch { return JSON.parse(text.replace(/```json|```/g, "").trim()); }
}

function SetupScreen({ onSave }) {
  const [key, setKey] = useState("");
  const valid = key.startsWith("sk-ant-");
  return (
    <div style={{ minHeight: "100vh", background: "#F8F7F4", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <div style={{ maxWidth: "480px", width: "100%" }}>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: "28px", fontWeight: "400", marginBottom: "8px", color: "#1A1A1A" }}>Meeting Notes</h1>
        <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "14px", color: "#888", marginBottom: "32px", lineHeight: "1.6" }}>
          Enter your Anthropic API key to get started. Stored only in your browser.
        </p>
        <label style={{ display: "block", fontSize: "11px", fontFamily: "'Inter', sans-serif", fontWeight: "600", letterSpacing: "0.09em", textTransform: "uppercase", color: "#999", marginBottom: "8px" }}>Anthropic API Key</label>
        <input type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="sk-ant-..."
          style={{ width: "100%", padding: "12px 16px", border: "1.5px solid #E0DDD8", borderRadius: "8px", fontSize: "14px", fontFamily: "'Inter', sans-serif", outline: "none", background: "#FFF", boxSizing: "border-box", marginBottom: "12px" }} />
        <p style={{ fontSize: "12px", color: "#BBB", fontFamily: "'Inter', sans-serif", marginBottom: "20px", lineHeight: "1.6" }}>
          Get your key at <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color: "#6366F1" }}>console.anthropic.com</a> → API Keys.
        </p>
        <button onClick={() => { if (valid) { localStorage.setItem("anthropic_key", key); onSave(key); } }} disabled={!valid}
          style={{ width: "100%", padding: "13px", borderRadius: "8px", border: "none", background: valid ? "#6366F1" : "#E0DDD8", color: valid ? "#FFF" : "#AAA", fontSize: "14px", fontFamily: "'Inter', sans-serif", fontWeight: "600", cursor: valid ? "pointer" : "not-allowed" }}>
          Get Started →
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("anthropic_key") || "");
  const [step, setStep] = useState("input");
  const [rawNotes, setRawNotes] = useState("");
  const [selectedProject, setSelectedProject] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("notes");
  const [copiedSection, setCopiedSection] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  const [saveLog, setSaveLog] = useState([]);
  const [notionUrl, setNotionUrl] = useState(null);

  const project = PROJECTS.find((p) => p.id === selectedProject);
  const projectColor = project?.color || "#6366F1";

  if (!apiKey) return <SetupScreen onSave={setApiKey} />;

  const addLog = (msg, type = "info") => setSaveLog(prev => [...prev, { msg, type }]);

  const handleProcess = async () => {
    if (!rawNotes.trim() || !selectedProject) return;
    setStep("processing"); setError(null);
    try {
      setResult(await processNotes(rawNotes, project.label, apiKey));
      setStep("result");
    } catch (e) {
      setError("Something went wrong: " + e.message);
      setStep("input");
    }
  };

  const handleSave = async () => {
    if (!result || !project) return;
    setSaveStatus("saving"); setSaveLog([]); setNotionUrl(null);
    try {
      addLog("Saving to Notion…");
      const { notionUrl: url } = await saveToNotion(result, project);
      setNotionUrl(url);
      addLog("Note, to-dos and links saved", "success");
    } catch (e) {
      addLog("Error: " + e.message, "error");
    }
    setSaveStatus("done");
  };

  const handleReset = () => {
    setStep("input"); setRawNotes(""); setSelectedProject(null);
    setResult(null); setError(null); setActiveTab("notes");
    setSaveStatus(null); setSaveLog([]); setNotionUrl(null);
  };

  const copyToClipboard = (text, section) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const card = { background: "#FFF", border: "1.5px solid #E0DDD8", borderRadius: "10px", padding: "24px 28px" };
  const lbl = { display: "block", fontSize: "11px", fontFamily: "'Inter', sans-serif", fontWeight: "600", letterSpacing: "0.09em", textTransform: "uppercase", color: "#999", marginBottom: "14px" };

  return (
    <div style={{ minHeight: "100vh", background: "#F8F7F4", fontFamily: "Georgia, serif", color: "#1A1A1A" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        textarea::placeholder { color: #BBB; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #DDD; border-radius: 3px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      <div style={{ borderBottom: "1px solid #E5E3DE", background: "#FFF", padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: "54px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: projectColor, transition: "background 0.3s" }} />
          <span style={{ fontSize: "15px", fontWeight: "500", color: "#1A1A1A", fontFamily: "'Inter', sans-serif" }}>Meeting Notes</span>
          {project && <>
            <span style={{ color: "#CCC", fontFamily: "'Inter', sans-serif" }}>/</span>
            <span style={{ fontSize: "15px", color: projectColor, fontFamily: "'Inter', sans-serif", fontWeight: "500" }}>{project.label}</span>
          </>}
        </div>
        <button onClick={() => { localStorage.removeItem("anthropic_key"); setApiKey(""); }}
          style={{ fontSize: "12px", color: "#BBB", background: "none", border: "none", cursor: "pointer", fontFamily: "'Inter', sans-serif" }}>
          Change API key
        </button>
      </div>

      <div style={{ maxWidth: "740px", margin: "0 auto", padding: "44px 24px 80px" }}>

        {error && <div style={{ padding: "14px 18px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px", color: "#B91C1C", fontSize: "14px", fontFamily: "'Inter', sans-serif", marginBottom: "24px" }}>{error}</div>}

        {step === "input" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={{ marginBottom: "36px" }}>
              <span style={lbl}>Project</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {PROJECTS.map((p) => {
                  const active = selectedProject === p.id;
                  return <button key={p.id} onClick={() => setSelectedProject(p.id)} style={{ padding: "8px 15px", borderRadius: "6px", border: active ? `1.5px solid ${p.color}` : "1.5px solid #E0DDD8", background: active ? p.color : "#FFF", color: active ? "#FFF" : "#444", fontSize: "13px", fontFamily: "'Inter', sans-serif", fontWeight: "500", cursor: "pointer", transition: "all 0.15s" }}>{p.label}</button>;
                })}
              </div>
            </div>
            <div style={{ marginBottom: "28px" }}>
              <span style={lbl}>Your Notes</span>
              <textarea value={rawNotes} onChange={(e) => setRawNotes(e.target.value)}
                placeholder={"Paste your raw notes here — messy is fine.\n\nInclude any links you'd like saved too."}
                style={{ width: "100%", minHeight: "300px", padding: "20px 22px", background: "#FFF", border: "1.5px solid #E0DDD8", borderRadius: "10px", color: "#1A1A1A", fontSize: "15px", lineHeight: "1.8", resize: "vertical", outline: "none", fontFamily: "Georgia, serif", transition: "border-color 0.2s" }}
                onFocus={(e) => e.target.style.borderColor = projectColor}
                onBlur={(e) => e.target.style.borderColor = "#E0DDD8"} />
              {rawNotes.length > 0 && <div style={{ marginTop: "8px", fontSize: "12px", color: "#BBB", fontFamily: "'Inter', sans-serif" }}>{rawNotes.length} chars · {extractLinks(rawNotes).length} links detected</div>}
            </div>
            <button onClick={handleProcess} disabled={!rawNotes.trim() || !selectedProject}
              style={{ padding: "13px 28px", borderRadius: "8px", border: "none", background: rawNotes.trim() && selectedProject ? projectColor : "#E0DDD8", color: rawNotes.trim() && selectedProject ? "#FFF" : "#AAA", fontSize: "14px", fontFamily: "'Inter', sans-serif", fontWeight: "600", cursor: rawNotes.trim() && selectedProject ? "pointer" : "not-allowed", transition: "all 0.2s" }}>
              Process Notes →
            </button>
          </div>
        )}

        {step === "processing" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", padding: "100px 0" }}>
            <div style={{ width: "38px", height: "38px", border: `2px solid ${projectColor}30`, borderTopColor: projectColor, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "16px", color: "#1A1A1A", fontFamily: "'Inter', sans-serif", fontWeight: "500", marginBottom: "6px" }}>Processing your notes</div>
              <div style={{ fontSize: "13px", color: "#BBB", fontFamily: "'Inter', sans-serif" }}>Cleaning up · Extracting to-dos · Organising links</div>
            </div>
          </div>
        )}

        {step === "result" && result && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div style={{ ...card, borderLeft: `4px solid ${projectColor}`, marginBottom: "28px" }}>
              <div style={{ fontSize: "11px", fontFamily: "'Inter', sans-serif", fontWeight: "600", letterSpacing: "0.09em", textTransform: "uppercase", color: projectColor, marginBottom: "12px" }}>Summary · {project?.label}</div>
              <p style={{ margin: 0, fontSize: "15px", lineHeight: "1.8", color: "#222", fontFamily: "Georgia, serif" }}>{result.summary}</p>
            </div>

            <div style={{ display: "flex", gap: "2px", background: "#ECEAE5", borderRadius: "9px", padding: "3px", marginBottom: "20px" }}>
              {[{ id: "notes", label: "Cleaned Notes" }, { id: "todos", label: `To-dos (${result.todos?.length || 0})` }, { id: "links", label: `Links (${result.links?.length || 0})` }].map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ flex: 1, padding: "9px 16px", borderRadius: "7px", border: "none", background: activeTab === tab.id ? "#FFF" : "transparent", color: activeTab === tab.id ? "#1A1A1A" : "#888", fontSize: "13px", fontWeight: activeTab === tab.id ? "600" : "400", cursor: "pointer", fontFamily: "'Inter', sans-serif", boxShadow: activeTab === tab.id ? "0 1px 3px rgba(0,0,0,0.09)" : "none" }}>{tab.label}</button>
              ))}
            </div>

            <div style={{ ...card, padding: 0, overflow: "hidden", marginBottom: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 20px", borderBottom: "1px solid #F0EDE8", background: "#FAFAF8" }}>
                <span style={{ fontSize: "12px", color: "#BBB", fontFamily: "'Inter', sans-serif" }}>{activeTab === "notes" ? "Formatted notes" : activeTab === "todos" ? "Action items" : "Saved links"}</span>
                <button onClick={() => { const c = activeTab === "notes" ? result.cleanedNotes : activeTab === "todos" ? result.todos?.map((t, i) => `${i+1}. ${t}`).join("\n") : result.links?.join("\n"); copyToClipboard(c || "", activeTab); }}
                  style={{ padding: "5px 14px", background: copiedSection === activeTab ? projectColor : "transparent", border: `1px solid ${copiedSection === activeTab ? projectColor : "#E0DDD8"}`, borderRadius: "5px", color: copiedSection === activeTab ? "#FFF" : "#666", fontSize: "12px", fontFamily: "'Inter', sans-serif", fontWeight: "500", cursor: "pointer" }}>
                  {copiedSection === activeTab ? "✓ Copied" : "Copy"}
                </button>
              </div>
              <div style={{ padding: "24px 28px", maxHeight: "380px", overflowY: "auto" }}>
                {activeTab === "notes" && <div style={{ fontSize: "15px", lineHeight: "1.85", color: "#1A1A1A", fontFamily: "Georgia, serif", whiteSpace: "pre-wrap" }}>{result.cleanedNotes}</div>}
                {activeTab === "todos" && <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>{result.todos?.length ? result.todos.map((todo, i) => (<div key={i} style={{ display: "flex", gap: "14px", alignItems: "flex-start", padding: "14px 16px", background: "#FAFAF8", border: "1px solid #F0EDE8", borderRadius: "8px" }}><div style={{ width: "17px", height: "17px", borderRadius: "4px", border: `1.5px solid ${projectColor}`, flexShrink: 0, marginTop: "3px" }} /><span style={{ fontSize: "14px", color: "#1A1A1A", lineHeight: "1.65", fontFamily: "'Inter', sans-serif" }}>{todo}</span></div>)) : <div style={{ color: "#BBB", fontSize: "14px", fontFamily: "'Inter', sans-serif" }}>No to-dos found.</div>}</div>}
                {activeTab === "links" && <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>{result.links?.length ? result.links.map((link, i) => (<div key={i} style={{ padding: "12px 16px", background: "#FAFAF8", border: "1px solid #F0EDE8", borderRadius: "8px", display: "flex", alignItems: "center", gap: "12px" }}><div style={{ width: "6px", height: "6px", borderRadius: "50%", background: projectColor, flexShrink: 0 }} /><a href={link} target="_blank" rel="noreferrer" style={{ fontSize: "13px", color: projectColor, textDecoration: "none", wordBreak: "break-all", fontFamily: "'Inter', sans-serif" }}>{link}</a></div>)) : <div style={{ color: "#BBB", fontSize: "14px", fontFamily: "'Inter', sans-serif" }}>No links detected.</div>}</div>}
              </div>
            </div>

            {saveStatus === null && (
              <div style={{ ...card, marginBottom: "24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
                <div>
                  <div style={{ fontSize: "14px", fontFamily: "'Inter', sans-serif", fontWeight: "600", color: "#1A1A1A", marginBottom: "4px" }}>Save to Notion</div>
                  <div style={{ fontSize: "13px", color: "#888", fontFamily: "'Inter', sans-serif" }}>Note, to-dos and links saved to your project workspace</div>
                </div>
                <button onClick={handleSave} style={{ padding: "12px 22px", borderRadius: "8px", border: "none", background: projectColor, color: "#FFF", fontSize: "13px", fontFamily: "'Inter', sans-serif", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>Save to Notion →</button>
              </div>
            )}

            {(saveStatus === "saving" || saveStatus === "done") && (
              <div style={{ ...card, marginBottom: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                  {saveStatus === "saving" && <div style={{ width: "16px", height: "16px", border: `2px solid ${projectColor}30`, borderTopColor: projectColor, borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />}
                  {saveStatus === "done" && <span style={{ fontSize: "16px" }}>✓</span>}
                  <span style={{ fontSize: "14px", fontFamily: "'Inter', sans-serif", fontWeight: "600", color: "#1A1A1A" }}>{saveStatus === "saving" ? "Saving…" : "Saved!"}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {saveLog.map((log, i) => (
                    <div key={i} style={{ fontSize: "12px", fontFamily: "'Inter', sans-serif", color: log.type === "success" ? "#059669" : log.type === "error" ? "#B91C1C" : "#888", display: "flex", gap: "8px" }}>
                      <span>{log.type === "success" ? "✓" : log.type === "error" ? "✗" : "·"}</span>
                      <span>{log.msg}</span>
                    </div>
                  ))}
                </div>
                {saveStatus === "done" && notionUrl && (
                  <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #F0EDE8" }}>
                    <a href={notionUrl} target="_blank" rel="noreferrer" style={{ padding: "8px 16px", borderRadius: "6px", background: "#1A1A1A", color: "#FFF", fontSize: "12px", fontFamily: "'Inter', sans-serif", fontWeight: "500", textDecoration: "none" }}>Open in Notion →</a>
                  </div>
                )}
              </div>
            )}

            <button onClick={handleReset} style={{ padding: "11px 22px", background: "transparent", border: "1.5px solid #E0DDD8", borderRadius: "8px", color: "#666", fontSize: "13px", fontFamily: "'Inter', sans-serif", fontWeight: "500", cursor: "pointer" }}>← New Notes</button>
          </div>
        )}
      </div>
    </div>
  );
}
