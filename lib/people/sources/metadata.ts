import {
  SOURCE_METADATA_MAX_BYTES,
  SOURCE_METADATA_MAX_KEYS,
  type SourceErr,
  type SourceMetadata,
  type SourceMetadataValue,
  type SourceOk,
} from "@/lib/people/sources/types";
import { isRecord, sourceFail, sourceOk } from "@/lib/people/sources/fields";

function isPlainValue(value: unknown): value is SourceMetadataValue {
  if (value === null) return true;
  if (typeof value === "string") return true;
  if (typeof value === "boolean") return true;
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  return false;
}

export function parseSourceMetadata(
  raw: unknown,
): SourceOk<SourceMetadata> | SourceErr {
  if (raw === undefined) return sourceOk({});
  if (!isRecord(raw)) {
    return sourceFail("source_metadata must be an object");
  }

  const keys = Object.keys(raw);
  if (keys.length > SOURCE_METADATA_MAX_KEYS) {
    return sourceFail(
      `source_metadata must not exceed ${SOURCE_METADATA_MAX_KEYS} keys`,
    );
  }

  const out: SourceMetadata = {};
  for (const key of keys) {
    if (!key || key.length > 64) {
      return sourceFail("source_metadata keys must be 1–64 characters");
    }
    const value = raw[key];
    if (!isPlainValue(value)) {
      return sourceFail(
        "source_metadata values must be strings, numbers, booleans, or null",
      );
    }
    out[key] = value;
  }

  const bytes = new TextEncoder().encode(JSON.stringify(out)).length;
  if (bytes > SOURCE_METADATA_MAX_BYTES) {
    return sourceFail(
      `source_metadata must not exceed ${SOURCE_METADATA_MAX_BYTES} bytes`,
    );
  }

  return sourceOk(out);
}
