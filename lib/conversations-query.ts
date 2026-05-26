const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

type ListQuery = {
  limit: number;
  offset: number;
  status: string | null;
  intent: string | null;
  urgency: string | null;
};

export function parseListQuery(searchParams: URLSearchParams):
  | { ok: true; query: ListQuery }
  | { ok: false; status: number; error: string } {
  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");

  const limit =
    limitParam === null || limitParam === ""
      ? DEFAULT_LIMIT
      : Number.parseInt(limitParam, 10);
  const offset =
    offsetParam === null || offsetParam === ""
      ? 0
      : Number.parseInt(offsetParam, 10);

  if (!Number.isFinite(limit) || limit < 1) {
    return { ok: false, status: 400, error: "limit must be a positive integer" };
  }
  if (!Number.isFinite(offset) || offset < 0) {
    return {
      ok: false,
      status: 400,
      error: "offset must be a non-negative integer",
    };
  }
  if (limit > MAX_LIMIT) {
    return {
      ok: false,
      status: 400,
      error: `limit must not exceed ${MAX_LIMIT}`,
    };
  }

  return {
    ok: true,
    query: {
      limit,
      offset,
      status: searchParams.get("status"),
      intent: searchParams.get("intent"),
      urgency: searchParams.get("urgency"),
    },
  };
}
