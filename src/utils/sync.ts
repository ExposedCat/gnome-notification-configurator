import type { GlobalConfiguration, PatternConfiguration } from "./settings.js";
import { SettingsManager } from "./settings.js";

type Setting = boolean | number | string | number[];
export type ConfigurationFields = Map<string, Setting>;
export type ConfigurationImport = {
  global: ConfigurationFields | null;
  patterns: ConfigurationFields[];
};
export type ImportEntry = {
  title: string;
  incoming: ConfigurationFields;
  conflicts: ConfigurationFields;
  selected: boolean;
  excluded: Set<string>;
  patternIndex: number | null;
};

function isObject(candidate: unknown): candidate is Record<string, unknown> {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    !Array.isArray(candidate)
  );
}

export function configurationFields(
  configuration: unknown,
): ConfigurationFields {
  const fields: ConfigurationFields = new Map();
  const visit = (candidate: unknown, path: string) => {
    if (isObject(candidate)) {
      for (const [key, child] of Object.entries(candidate)) {
        visit(child, path ? `${path}.${key}` : key);
      }
    } else if (
      typeof candidate === "boolean" ||
      typeof candidate === "string" ||
      (typeof candidate === "number" && Number.isFinite(candidate)) ||
      (Array.isArray(candidate) &&
        candidate.every(
          (channel) => typeof channel === "number" && Number.isFinite(channel),
        ))
    ) {
      fields.set(path, candidate);
    } else {
      throw new Error(`Invalid configuration setting: ${path}`);
    }
  };
  visit(configuration, "");
  return fields;
}

export function mergeConfiguration<Configuration extends GlobalConfiguration>(
  current: Configuration,
  incoming: ConfigurationFields,
  excluded: Set<string> = new Set(),
): Configuration {
  const merge = (candidate: unknown, path: string): unknown => {
    if (isObject(candidate)) {
      return Object.fromEntries(
        Object.entries(candidate).map(([key, child]) => [
          key,
          merge(child, path ? `${path}.${key}` : key),
        ]),
      );
    }
    return excluded.has(path) ? candidate : (incoming.get(path) ?? candidate);
  };
  return merge(current, "") as Configuration;
}

function parseFields(
  candidate: unknown,
  defaults: GlobalConfiguration | PatternConfiguration,
): ConfigurationFields {
  if (!isObject(candidate)) throw new Error("Expected a configuration object.");
  const validate = (
    settings: Record<string, unknown>,
    expected: Record<string, unknown>,
    prefix: string,
  ) => {
    for (const [key, setting] of Object.entries(settings)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const fallback = expected[key];
      if (!Object.hasOwn(expected, key))
        throw new Error(`Unknown configuration setting: ${path}`);
      if (isObject(fallback) && isObject(setting)) {
        validate(setting, fallback, path);
      } else if (
        isObject(fallback) ||
        typeof setting !== typeof fallback ||
        Array.isArray(setting) !== Array.isArray(fallback) ||
        (Array.isArray(setting) && setting.length !== 4)
      ) {
        throw new Error(`Invalid configuration setting: ${path}`);
      }
    }
  };
  validate(candidate, defaults, "");
  const fields = configurationFields(candidate);
  const merged = mergeConfiguration(defaults, fields);
  const normalized = configurationFields(
    "matcher" in merged
      ? SettingsManager.normalizePattern(merged)
      : SettingsManager.parseGlobalConfiguration(JSON.stringify(merged)),
  );
  for (const [path, setting] of fields) {
    if (JSON.stringify(setting) !== JSON.stringify(normalized.get(path))) {
      throw new Error(`Invalid configuration setting: ${path}`);
    }
  }
  return fields;
}

export function parseConfigurationImport(
  contents: string,
): ConfigurationImport {
  const candidate: unknown = JSON.parse(contents);
  if (
    !isObject(candidate) ||
    candidate.version !== 1 ||
    (!Object.hasOwn(candidate, "global") &&
      !Object.hasOwn(candidate, "patterns"))
  ) {
    throw new Error(
      "Unsupported configuration file. Select a version 1 configuration export.",
    );
  }
  if (candidate.patterns !== undefined && !Array.isArray(candidate.patterns)) {
    throw new Error("Expected a list of patterns.");
  }
  return {
    global:
      candidate.global === undefined
        ? null
        : parseFields(
            candidate.global,
            SettingsManager.defaultGlobalConfiguration(),
          ),
    patterns: (candidate.patterns ?? []).map((pattern: unknown) => {
      const matcher = isObject(pattern) ? pattern.matcher : null;
      if (
        !isObject(matcher) ||
        !["appName", "title", "body"].every(
          (key) => typeof matcher[key] === "string",
        )
      ) {
        throw new Error("Each pattern must include all three matchers.");
      }
      return parseFields(
        pattern,
        SettingsManager.defaultPatternConfiguration(),
      );
    }),
  };
}

export function createImportEntry(
  title: string,
  current: GlobalConfiguration | PatternConfiguration,
  incoming: ConfigurationFields,
  defaults: GlobalConfiguration | PatternConfiguration,
  patternIndex: number | null,
): ImportEntry {
  const existing = configurationFields(current);
  const fallback = configurationFields(defaults);
  const conflicts: ConfigurationFields = new Map();
  for (const path of incoming.keys()) {
    if (path.startsWith("matcher.")) continue;
    const setting = existing.get(path);
    if (
      setting !== undefined &&
      JSON.stringify(setting) !== JSON.stringify(fallback.get(path))
    ) {
      conflicts.set(path, setting);
    }
  }
  return {
    title,
    incoming,
    conflicts,
    selected: true,
    excluded: new Set(),
    patternIndex,
  };
}
