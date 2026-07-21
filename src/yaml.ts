/**
 * Minimal YAML serializer for the fixed artifact schema. Hand-rolled on
 * purpose: the output format is a contract, so serialization must stay
 * deterministic and dependency-free. Only the shapes used by the artifact
 * builder are supported (scalars, one level of key/value maps, and a list of
 * flat maps).
 */

// Plain (unquoted) YAML scalars, matching the contract examples: paths,
// timestamps, urls and simple phrases like "Chrome 138" stay bare; anything
// else is emitted as a JSON double-quoted string (valid YAML).
const BARE_SCALAR = /^[A-Za-z0-9/][A-Za-z0-9._:/ -]*$/;
const RESERVED = new Set([
  "true",
  "false",
  "null",
  "yes",
  "no",
  "on",
  "off",
  "~",
]);
const NUMERIC_LIKE = /^[+-]?(\d[\d_]*\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

export type YamlScalar = string | number | boolean | null;

export function formatScalar(value: YamlScalar): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (
    BARE_SCALAR.test(value) &&
    !RESERVED.has(value.toLowerCase()) &&
    !NUMERIC_LIKE.test(value) &&
    !value.endsWith(":") &&
    !value.endsWith(" ") &&
    !value.includes(": ") &&
    !value.includes(" #")
  ) {
    return value;
  }
  // JSON double-quoted strings are valid YAML scalars.
  return JSON.stringify(value);
}

/** A map value: a scalar, or a list of scalars rendered as a block sequence. */
export type YamlValue = YamlScalar | YamlScalar[];

export function yamlLine(key: string, value: YamlValue, indent = ""): string {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => `${indent}  - ${formatScalar(item)}`)
      .join("\n");
    return `${indent}${key}:\n${items}`;
  }
  return `${indent}${key}: ${formatScalar(value)}`;
}

/** Serialize a flat map, preserving key order. */
export function yamlMap(entries: [string, YamlValue][], indent = ""): string {
  return entries.map(([k, v]) => yamlLine(k, v, indent)).join("\n");
}

/** Serialize a list of maps as a YAML sequence. */
export function yamlListOfMaps(
  items: [string, YamlValue][][],
  indent = "  "
): string {
  return items
    .map((entries) =>
      entries
        .map(([k, v], i) =>
          i === 0
            ? `${indent}- ${yamlLine(k, v)}`
            : yamlLine(k, v, `${indent}  `)
        )
        .join("\n")
    )
    .join("\n");
}
