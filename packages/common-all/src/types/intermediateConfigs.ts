/**
 * Intermediate Dendron Config
 * Holds part of both old and new configs
 * During the migration period.
 */
import { DendronConfig as DendronConfigV1 } from "./workspace";
import { DendronConfig as DendronConfigV2 } from "./configs/dendronConfig";

export * from "./configs";

export const CURRENT_CONFIG_VERSION = 3;
/**
 * Partial of the old config, but respect the required keys
 * that are not yet in the process of migration.
 */
type IntermediateOldConfig = Partial<DendronConfigV1> &
  Required<Pick<DendronConfigV1, "version" | "site">>;

/**
 * Partial of the new config, may only contain keys
 * that are currently in the process of, or completed migration.
 */
type IntermediateNewConfig = Partial<
  Pick<DendronConfigV2, "commands" | "workspace">
>;

export type IntermediateDendronConfig = IntermediateOldConfig &
  IntermediateNewConfig;

/**
 * Strict type of v1 config,
 * but allowing partially picked new config namespaces
 * of subsequent new versions.
 */
export type StrictV1 = IntermediateDendronConfig &
  Required<Pick<DendronConfigV1, "journal" | "vaults">> & { version: 1 };

/**
 * Strict type of v2 config,
 * but allowing partially picked new config namespaces
 * of subsequent new versions.
 */
export type StrictV2 = IntermediateDendronConfig &
  Partial<Pick<IntermediateNewConfig, "commands">> & { version: 2 };

/**
 * Strict type of v3 config.
 */
export type StrictV3 = IntermediateDendronConfig & { version: 3 };

/**
 * Union type of all strict config types discriminated by version number.
 */
export type StrictIntermediateDendronConfig = StrictV1 | StrictV2 | StrictV3;
