import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { ErrorBox, Loading, Tabs } from "../components/ui";
import { useApi } from "../hooks/useApi";
import ClassesTab from "./workspace/ClassesTab";
import FilesTab from "./workspace/FilesTab";
import FunctionsTab from "./workspace/FunctionsTab";
import GlobalsTab from "./workspace/GlobalsTab";
import LogsTab from "./workspace/LogsTab";
import OverviewTab from "./workspace/OverviewTab";
import ReportTab from "./workspace/ReportTab";

const TABS = ["overview", "functions", "classes", "globals", "files", "logs", "report"] as const;
type TabId = (typeof TABS)[number];

export default function WorkspacePage() {
  const { name = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = (TABS.includes(params.get("tab") as TabId) ? params.get("tab") : "overview") as TabId;
  const detail = useApi(() => api.workspace(name), [name], 5000);

  if (detail.error) return <div className="page"><h1>{name}</h1><ErrorBox error={detail.error} /></div>;
  if (!detail.data) return <div className="page"><h1>{name}</h1><Loading /></div>;
  const w = detail.data;

  async function remove() {
    if (!confirm(`Delete workspace "${name}"? Its analyses, LLM logs and generated project are removed.`)) return;
    try {
      await api.deleteWorkspace(name);
      navigate("/workspaces");
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  const c = w.counts;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{w.name}</h1>
          <p className="muted small">{w.program.language} · {w.program.compiler} · image base {w.program.image_base}</p>
        </div>
        <div className="row gap">
          <Link className="btn" to={`/run?binary=${encodeURIComponent(w.binary)}`}>Resume / run again</Link>
          <button className="btn btn-danger-outline" onClick={remove}>Delete</button>
        </div>
      </div>
      <Tabs<TabId>
        value={tab}
        onChange={(t) => setParams(t === "overview" ? {} : { tab: t }, { replace: true })}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "functions", label: `Functions (${c.in_scope})` },
          { id: "classes", label: `Classes (${c.classes})` },
          { id: "globals", label: `Globals (${c.globals})` },
          { id: "files", label: "Project files" },
          { id: "logs", label: "LLM logs" },
          { id: "report", label: "Report" },
        ]}
      />
      {tab === "overview" && <OverviewTab workspace={w} />}
      {tab === "functions" && <FunctionsTab name={name} />}
      {tab === "classes" && <ClassesTab name={name} />}
      {tab === "globals" && <GlobalsTab name={name} />}
      {tab === "files" && <FilesTab name={name} />}
      {tab === "logs" && <LogsTab name={name} />}
      {tab === "report" && <ReportTab name={name} />}
    </div>
  );
}
