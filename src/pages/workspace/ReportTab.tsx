import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../../api/client";
import { Card, ErrorBox, Loading } from "../../components/ui";
import { useApi } from "../../hooks/useApi";

export default function ReportTab({ name }: { name: string }) {
  const report = useApi(() => api.report(name), [name]);
  return (
    <Card>
      {report.error ? <ErrorBox error={report.error} /> : report.data === undefined ? <Loading /> : (
        <div className="markdown">
          <Markdown remarkPlugins={[remarkGfm]}>{report.data}</Markdown>
        </div>
      )}
    </Card>
  );
}
