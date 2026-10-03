import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { CodeBlock } from "../components/CodeBlock";
import { Card, ErrorBox, Loading, Tabs } from "../components/ui";
import { useApi } from "../hooks/useApi";

type Part = "response" | "user" | "system";

export default function LogPage() {
  const { name = "", log = "" } = useParams();
  const entry = useApi(() => api.log(name, log), [name, log]);
  const [part, setPart] = useState<Part>("response");
  const address = log.match(/(0x[0-9a-f]+)\.txt$/)?.[1];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="mono">{log.replace(/\.txt$/, "")}</h1>
          <p className="muted small">
            <Link to={`/workspaces/${encodeURIComponent(name)}?tab=logs`}>← {name} logs</Link>
            {address && <> · <Link to={`/workspaces/${encodeURIComponent(name)}/functions/${address}`}>function {address}</Link></>}
            {entry.data && <> · provider <b>{entry.data.provider}</b></>}
          </p>
        </div>
      </div>
      {entry.error ? <ErrorBox error={entry.error} /> : !entry.data ? <Loading /> : (
        <Card>
          <Tabs<Part> value={part} onChange={setPart} tabs={[
            { id: "response", label: "Response" },
            { id: "user", label: "Prompt" },
            { id: "system", label: "System prompt" },
          ]} />
          <CodeBlock code={entry.data[part]} language={part === "response" && entry.data.response.trimStart().startsWith("{") ? "json" : "text"}
            maxHeight="75vh" />
        </Card>
      )}
    </div>
  );
}
