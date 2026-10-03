import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="page">
      <h1>Not found</h1>
      <p>Nothing lives at this address. <Link to="/">Back to the dashboard</Link>.</p>
    </div>
  );
}
