import { useState } from "react";
import { api } from "../../api/client";
import { CodeBlock, languageFor } from "../../components/CodeBlock";
import { Card, Empty, ErrorBox, Loading } from "../../components/ui";
import { useApi } from "../../hooks/useApi";
import { fmtSize } from "../../lib/format";

export default function FilesTab({ name }: { name: string }) {
  const files = useApi(() => api.files(name), [name]);
  const [selected, setSelected] = useState<string>();
  const current = selected ?? files.data?.find((f) => f.path.startsWith("src/"))?.path ?? files.data?.[0]?.path;

  if (files.error) return <ErrorBox error={files.error} />;
  if (!files.data) return <Loading />;
  if (!files.data.length) return <Card><Empty>No project generated yet (the code stage hasn't run).</Empty></Card>;

  return (
    <div className="split">
      <Card className="split-list">
        <ul className="list selectable">
          {files.data.map((f) => (
            <li key={f.path}>
              <button className={`list-row ${f.path === current ? "selected" : ""}`} onClick={() => setSelected(f.path)}>
                <span className="list-main mono small">{f.path}</span>
                <span className="muted small">{fmtSize(f.size)}</span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
      {current && <FileView workspace={name} path={current} />}
    </div>
  );
}

function FileView({ workspace, path }: { workspace: string; path: string }) {
  const file = useApi(() => api.file(workspace, path), [workspace, path]);
  return (
    <Card className="split-detail" title={<span className="mono">{path}</span>}
      actions={file.data && <button className="btn btn-sm" onClick={() => navigator.clipboard.writeText(file.data!)}>Copy</button>}>
      {file.error ? <ErrorBox error={file.error} /> : file.data === undefined ? <Loading />
        : <CodeBlock code={file.data} language={languageFor(path)} maxHeight="75vh" />}
    </Card>
  );
}
