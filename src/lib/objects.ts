export type Obj = Record<string, unknown>;

export const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export function getPath(obj: unknown, path: string[]): unknown {
  return path.reduce<unknown>((o, k) => (isObj(o) ? o[k] : undefined), obj);
}

export function setPath(obj: Obj, path: string[], value: unknown): Obj {
  if (!path.length) return value as Obj;
  const [head, ...rest] = path;
  const child = isObj(obj[head]) ? (obj[head] as Obj) : {};
  return { ...obj, [head]: rest.length ? setPath(child, rest, value) : value };
}

export function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The parts of `value` that differ from `base` (nested objects diffed recursively). */
export function diff(value: Obj, base: Obj): Obj {
  const out: Obj = {};
  for (const [k, v] of Object.entries(value)) {
    const b = base[k];
    if (isObj(v) && isObj(b)) {
      const sub = diff(v, b);
      if (Object.keys(sub).length) out[k] = sub;
    } else if (!equal(v, b)) {
      out[k] = v;
    }
  }
  return out;
}

export function countLeaves(obj: Obj): number {
  return Object.values(obj).reduce<number>((n, v) => n + (isObj(v) ? countLeaves(v) : 1), 0);
}
