import { useState } from "react";
import type { JsonSchema } from "../api/types";
import { equal, getPath, isObj, type Obj, setPath } from "../lib/objects";

/**
 * Renders a form for a pydantic JSON Schema (as served by /api/settings/schema):
 * nested groups via $ref, booleans, enums (optionally nullable), numbers with
 * ranges, strings and string lists. Fields that differ from `baseline` are
 * marked and can be reset; `errors` maps dotted paths to messages.
 */
export interface SchemaFormProps {
  schema: JsonSchema;
  value: Obj;
  baseline: Obj;
  onChange: (value: Obj) => void;
  errors?: Record<string, string>;
  filter?: string;
  baselineLabel?: string;
}

export function SchemaForm({ schema, value, baseline, onChange, errors = {}, filter = "", baselineLabel = "saved" }:
  SchemaFormProps) {
  const ctx: Ctx = { root: schema, value, baseline, onChange, errors, filter: filter.trim().toLowerCase(), baselineLabel };
  const props = schema.properties ?? {};
  return (
    <div className="schema-form">
      {Object.entries(props).map(([key, prop]) => (
        <Node key={key} ctx={ctx} path={[key]} schema={prop} depth={0} />
      ))}
    </div>
  );
}

interface Ctx {
  root: JsonSchema;
  value: Obj;
  baseline: Obj;
  onChange: (value: Obj) => void;
  errors: Record<string, string>;
  filter: string;
  baselineLabel: string;
}

function resolve(root: JsonSchema, s: JsonSchema): JsonSchema {
  if (s.$ref) {
    const name = s.$ref.split("/").pop()!;
    const target = root.$defs?.[name] ?? {};
    const { $ref: _ref, ...siblings } = s;
    return { ...target, ...siblings, title: s.title ?? target.title, description: s.description ?? target.description };
  }
  if (s.allOf?.length === 1) return resolve(root, { ...s.allOf[0], ...s, allOf: undefined });
  return s;
}

/** For `anyOf: [X, {type: null}]`: X plus a nullable flag. */
function unwrapNullable(root: JsonSchema, s: JsonSchema): { schema: JsonSchema; nullable: boolean } {
  if (s.anyOf) {
    const nonNull = s.anyOf.filter((a) => a.type !== "null");
    if (nonNull.length === 1 && nonNull.length < s.anyOf.length) {
      return { schema: { ...resolve(root, nonNull[0]), title: s.title, description: s.description, default: s.default }, nullable: true };
    }
  }
  return { schema: resolve(root, s), nullable: false };
}

function humanize(key: string): string {
  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function matchesFilter(ctx: Ctx, path: string[], s: JsonSchema): boolean {
  if (!ctx.filter) return true;
  const hay = `${path.join(".")} ${s.title ?? ""} ${s.description ?? ""}`.toLowerCase();
  return hay.includes(ctx.filter);
}

function subtreeMatches(ctx: Ctx, path: string[], s: JsonSchema): boolean {
  const r = resolve(ctx.root, s);
  if (matchesFilter(ctx, path, r)) return true;
  return Object.entries(r.properties ?? {}).some(([k, p]) => subtreeMatches(ctx, [...path, k], p));
}

function Node({ ctx, path, schema, depth }: { ctx: Ctx; path: string[]; schema: JsonSchema; depth: number }) {
  const resolved = resolve(ctx.root, schema);
  if (resolved.type === "object" && resolved.properties) {
    if (!subtreeMatches(ctx, path, schema)) return null;
    return <Group ctx={ctx} path={path} schema={resolved} depth={depth} />;
  }
  if (!matchesFilter(ctx, path, resolved)) return null;
  return <Field ctx={ctx} path={path} schema={schema} />;
}

function Group({ ctx, path, schema, depth }: { ctx: Ctx; path: string[]; schema: JsonSchema; depth: number }) {
  const [open, setOpen] = useState(depth === 0);
  const changed = !equal(getPath(ctx.value, path), getPath(ctx.baseline, path));
  const hasError = Object.keys(ctx.errors).some((k) => k === path.join(".") || k.startsWith(path.join(".") + "."));
  const expanded = open || !!ctx.filter || hasError;
  const title = schema.title && !/Settings$/.test(schema.title) ? schema.title : humanize(path[path.length - 1]);
  return (
    <fieldset className={`sf-group depth-${depth}`}>
      <legend>
        <button type="button" className="sf-group-toggle" onClick={() => setOpen(!open)} aria-expanded={expanded}>
          <span className="chev">{expanded ? "▾" : "▸"}</span> {title}
          {changed && <span className="sf-dot" title={`differs from ${ctx.baselineLabel}`} />}
          {hasError && <span className="badge badge-bad">error</span>}
        </button>
      </legend>
      {expanded && (
        <>
          {schema.description && <p className="sf-group-desc">{schema.description}</p>}
          {ctx.errors[path.join(".")] && <div className="sf-error">{ctx.errors[path.join(".")]}</div>}
          <div className="sf-fields">
            {Object.entries(schema.properties ?? {}).map(([key, prop]) => (
              <Node key={key} ctx={ctx} path={[...path, key]} schema={prop} depth={depth + 1} />
            ))}
          </div>
        </>
      )}
    </fieldset>
  );
}

function Field({ ctx, path, schema: raw }: { ctx: Ctx; path: string[]; schema: JsonSchema }) {
  const { schema, nullable } = unwrapNullable(ctx.root, raw);
  const id = `sf-${path.join("-")}`;
  const current = getPath(ctx.value, path);
  const base = getPath(ctx.baseline, path);
  const changed = !equal(current, base);
  const error = ctx.errors[path.join(".")];
  const set = (v: unknown) => ctx.onChange(setPath(ctx.value, path, v));
  const title = schema.title ?? humanize(path[path.length - 1]);

  let input;
  if (schema.type === "boolean") {
    input = (
      <label className="switch">
        <input id={id} type="checkbox" checked={!!current} onChange={(e) => set(e.target.checked)} />
        <span className="switch-track" />
        <span className="switch-label">{current ? "on" : "off"}</span>
      </label>
    );
  } else if (schema.enum) {
    input = (
      <select id={id} value={current == null ? "" : String(current)}
        onChange={(e) => set(e.target.value === "" && nullable ? null : e.target.value)}>
        {nullable && <option value="">— use the default —</option>}
        {schema.enum.map((opt) => <option key={String(opt)} value={String(opt)}>{String(opt)}</option>)}
      </select>
    );
  } else if (schema.type === "integer" || schema.type === "number") {
    const isInt = schema.type === "integer";
    const max = schema.maximum ?? schema.exclusiveMaximum;
    input = (
      <input id={id} type="number" value={current == null ? "" : String(current)}
        min={schema.minimum ?? schema.exclusiveMinimum} max={max}
        step={isInt ? 1 : max !== undefined && max <= 1 ? 0.01 : "any"}
        onChange={(e) => {
          if (e.target.value === "") return set(nullable ? null : 0);
          const n = isInt ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
          if (!Number.isNaN(n)) set(n);
        }} />
    );
  } else if (schema.type === "array") {
    const list = Array.isArray(current) ? (current as unknown[]).map(String) : [];
    input = (
      <textarea id={id} rows={Math.max(2, Math.min(8, list.length + 1))} value={list.join("\n")}
        placeholder="one per line"
        onChange={(e) => set(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))} />
    );
  } else {
    input = (
      <input id={id} type="text" value={current == null ? "" : String(current)} spellCheck={false}
        onChange={(e) => set(nullable && e.target.value === "" ? null : e.target.value)} />
    );
  }

  const range = rangeText(schema);
  return (
    <div className={`sf-field ${changed ? "changed" : ""} ${error ? "has-error" : ""}`}>
      <div className="sf-label">
        <label htmlFor={id}>{title}</label>
        <code className="sf-path">{path.join(".")}</code>
      </div>
      <div className="sf-control">
        {input}
        {changed && (
          <button type="button" className="btn-link sf-reset" title={`reset to ${ctx.baselineLabel}: ${fmt(base)}`}
            onClick={() => set(base)}>reset</button>
        )}
      </div>
      <div className="sf-help">
        {schema.description}
        {range && <span className="sf-range">{range}</span>}
        {changed && <span className="sf-was">{ctx.baselineLabel}: {fmt(base)}</span>}
      </div>
      {error && <div className="sf-error">{error}</div>}
    </div>
  );
}

function rangeText(s: JsonSchema): string {
  const lo = s.minimum ?? s.exclusiveMinimum;
  const hi = s.maximum ?? s.exclusiveMaximum;
  if (lo !== undefined && hi !== undefined) return `${lo} – ${hi}`;
  if (lo !== undefined) return `≥ ${lo}`;
  if (hi !== undefined) return `≤ ${hi}`;
  return "";
}

function fmt(v: unknown): string {
  if (v == null) return "default";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "(none)";
  if (isObj(v)) return "{…}";
  return String(v);
}

/** Pydantic 422 errors -> { "llm.concurrency": "Input should be ≥ 1" }. */
export function errorMap(items: { loc: (string | number)[]; msg: string }[], prefix: string[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  for (const it of items) {
    const loc = it.loc.filter((p) => p !== "body").map(String);
    out[[...prefix, ...loc].join(".") || "_"] = it.msg;
  }
  return out;
}
