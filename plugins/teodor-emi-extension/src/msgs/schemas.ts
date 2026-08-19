/**
 * ROS 2 message definitions, shipped as text.
 *
 * The recordings are rosbag2 metadata **version 5**, which has no
 * `message_definitions` table — nothing in a `.db3` is self-describing, so a
 * browser reading one has no way to learn what `emi_msgs/msg/EMI` looks like.
 * The definitions therefore travel with the plugin.
 *
 * Format is the ROS concatenated definition that `@foxglove/rosmsg` parses:
 * the message's own fields, then each dependency after an `MSG:` separator.
 * Constants are omitted throughout — they are not on the wire and their absence
 * cannot change a decode.
 *
 * Source of truth: `emi_ws/src/emi_msgs/msg/*.msg` and the upstream
 * `std_msgs` / `sensor_msgs` / `geometry_msgs` / `tf2_msgs` interfaces. If a
 * message changes on the robot, it changes here in the same breath — a stale
 * definition decodes to plausible nonsense rather than to an error.
 */

const SEP =
	"================================================================================";

/** `builtin_interfaces/Time`. */
const TIME = `int32 sec
uint32 nanosec`;

/** `std_msgs/Header`. */
const HEADER = `builtin_interfaces/Time stamp
string frame_id`;

/** `sensor_msgs/NavSatStatus`. */
const NAVSAT_STATUS = `int8 status
uint16 service`;

/** `sensor_msgs/NavSatFix`. */
const NAVSATFIX = `std_msgs/Header header
sensor_msgs/NavSatStatus status
float64 latitude
float64 longitude
float64 altitude
float64[9] position_covariance
uint8 position_covariance_type`;

/** `geometry_msgs/Vector3`. */
const VECTOR3 = `float64 x
float64 y
float64 z`;

/** `geometry_msgs/Quaternion`. */
const QUATERNION = `float64 x
float64 y
float64 z
float64 w`;

/** `geometry_msgs/Transform`. */
const TRANSFORM = `geometry_msgs/Vector3 translation
geometry_msgs/Quaternion rotation`;

/** Dependency block shared by every message that carries a stamped header. */
const HEADER_DEPS = [
	`${SEP}\nMSG: std_msgs/Header\n${HEADER}`,
	`${SEP}\nMSG: builtin_interfaces/Time\n${TIME}`,
].join("\n");

/** Dependency block for anything carrying a `NavSatFix`. */
const NAVSAT_DEPS = [
	`${SEP}\nMSG: sensor_msgs/NavSatFix\n${NAVSATFIX}`,
	`${SEP}\nMSG: sensor_msgs/NavSatStatus\n${NAVSAT_STATUS}`,
].join("\n");

/** `emi_msgs/msg/EMI` — raw counts, with the coil geometry as recorded. */
export const EMI_SCHEMA = `std_msgs/Header header
sensor_msgs/NavSatFix rtk_pose
int32 atr_threshold
emi_msgs/EMICoil[] emi_array
${HEADER_DEPS}
${NAVSAT_DEPS}
${SEP}
MSG: emi_msgs/EMICoil
uint8 id
geometry_msgs/Transform static_transform
bool alert
int32 raw1
int32 raw2
${SEP}
MSG: geometry_msgs/Transform
${TRANSFORM}
${SEP}
MSG: geometry_msgs/Vector3
${VECTOR3}
${SEP}
MSG: geometry_msgs/Quaternion
${QUATERNION}`;

/**
 * `emi_msgs/msg/EMIGnss` — the georeferenced output, one fix per coil.
 *
 * Two wire layouts exist and both must decode; see {@link SCHEMAS}. The current
 * robot build appends `float64 yaw` to each coil — the ENU heading the
 * georeference node applied to that coil's offset. It is additive on the robot
 * (existing subscribers ignore it) but it is NOT additive to a CDR reader:
 * `EMICoilGnss` is a sequence element, so eight extra bytes per element shift
 * every element after the first. A reader built for one layout cannot read the
 * other at all.
 */
const emiGnssSchema = (withYaw: boolean) => `std_msgs/Header header
int32 atr_threshold
emi_msgs/EMICoilGnss[] emi_array
${HEADER_DEPS}
${NAVSAT_DEPS}
${SEP}
MSG: emi_msgs/EMICoilGnss
uint8 id
sensor_msgs/NavSatFix gnss
bool alert
int32 raw1
int32 raw2${withYaw ? "\nfloat64 yaw" : ""}`;

/** Current robot build: each coil carries the heading used to place it. */
export const EMIGNSS_SCHEMA = emiGnssSchema(true);

/** The layout every recorded bag was written with. */
export const EMIGNSS_SCHEMA_LEGACY = emiGnssSchema(false);

/**
 * `emi_msgs/msg/EMITarget` — one physical object, append-only.
 *
 * `string source` names the tracker that wrote it, and is the same
 * work-in-progress robot change as `EMICoilGnss.yaw`: two trackers now run in
 * parallel on one alert stream and a recording of both cannot say which node
 * wrote which target without it. Same versioning consequence — a `string` in
 * the middle of a sequence element moves everything after it.
 */
const emiTarget = (withSource: boolean) => `uint32 id
sensor_msgs/NavSatFix gnss
float64 centroid_latitude
float64 centroid_longitude
int32 best_amplitude
uint8 best_coil
int32 atr_threshold
builtin_interfaces/Time first_seen
builtin_interfaces/Time last_seen
uint32 n_detections
uint8[] coils
float64 spread${withSource ? "\nstring source" : ""}
float64 gate_used
float64 sigma_at_creation
bool degraded_fix`;

/** `emi_msgs/msg/EMITargetList` — the full list as it currently stands. */
const emiTargetList = (withSource: boolean) => `std_msgs/Header header
uint32 n_targets
emi_msgs/EMITarget[] targets
${HEADER_DEPS}
${NAVSAT_DEPS}
${SEP}
MSG: emi_msgs/EMITarget
${emiTarget(withSource)}`;

/** Current robot build. */
export const EMITARGETLIST_SCHEMA = emiTargetList(true);
/** Before the two trackers ran in parallel. */
export const EMITARGETLIST_SCHEMA_LEGACY = emiTargetList(false);

/** `emi_msgs/msg/EMITarget` as a standalone message (the `/new` topics). */
export const EMITARGET_SCHEMA = `${emiTarget(true)}
${HEADER_DEPS}
${NAVSAT_DEPS}`;

/** `emi_msgs/msg/EMITarget`, pre-`source`. */
export const EMITARGET_SCHEMA_LEGACY = `${emiTarget(false)}
${HEADER_DEPS}
${NAVSAT_DEPS}`;

/** `sensor_msgs/msg/NavSatFix`. */
export const NAVSATFIX_SCHEMA = `${NAVSATFIX}
${HEADER_DEPS}
${SEP}
MSG: sensor_msgs/NavSatStatus
${NAVSAT_STATUS}`;

/** `geometry_msgs/msg/QuaternionStamped`. */
export const QUATERNIONSTAMPED_SCHEMA = `std_msgs/Header header
geometry_msgs/Quaternion quaternion
${HEADER_DEPS}
${SEP}
MSG: geometry_msgs/Quaternion
${QUATERNION}`;

/** `tf2_msgs/msg/TFMessage`. */
export const TFMESSAGE_SCHEMA = `geometry_msgs/TransformStamped[] transforms
${HEADER_DEPS}
${SEP}
MSG: geometry_msgs/TransformStamped
std_msgs/Header header
string child_frame_id
geometry_msgs/Transform transform
${SEP}
MSG: geometry_msgs/Transform
${TRANSFORM}
${SEP}
MSG: geometry_msgs/Vector3
${VECTOR3}
${SEP}
MSG: geometry_msgs/Quaternion
${QUATERNION}`;

/** One candidate wire layout for a ROS type. */
export interface SchemaVariant {
	/** Short label for diagnostics, e.g. `"current"` or `"legacy"`. */
	label: string;
	/** The concatenated definition text. */
	text: string;
	/**
	 * Structural check that this layout is the right one for a payload.
	 *
	 * A failed decode is not a reliable discriminator on its own: a *shorter*
	 * layout reads a longer payload quite happily and simply leaves the trailing
	 * bytes unread, so the wrong reader can "succeed" and return garbage. Only
	 * the reverse — a longer layout on a shorter payload — reliably runs off the
	 * end and throws.
	 *
	 * So a variant is accepted only if it decodes *and* the result satisfies an
	 * invariant the robot actually guarantees. Cheap, and it is checked once per
	 * type per session rather than per message.
	 */
	validate?: (msg: unknown) => boolean;
}

/**
 * Every coil in an `EMIGnss` names its own frame — `coil3_link` for id 3.
 *
 * A reader using the wrong layout mis-parses from the second sequence element
 * onward, and the `id`/`frame_id` agreement is the first thing to break. The
 * fixture test pins that this holds on real recorded data.
 *
 * @param msg - A decoded `EMIGnss`.
 * @returns True when every coil is self-consistent.
 */
function validEmiGnss(msg: unknown): boolean {
	const coils = (msg as { emi_array?: unknown }).emi_array;
	if (!Array.isArray(coils) || coils.length === 0) return false;
	return coils.every(
		(c: { id?: number; gnss?: { header?: { frame_id?: string } } }) =>
			typeof c?.id === "number" &&
			c.gnss?.header?.frame_id === `coil${c.id}_link`,
	);
}

/**
 * Every target in an `EMITargetList` names the tracker that wrote it.
 *
 * `source` is the field the newer layout adds, and the two trackers only ever
 * write these two values.
 *
 * @param msg - A decoded `EMITargetList`.
 * @returns True when every target names a known tracker.
 */
function validTargetList(msg: unknown): boolean {
	const targets = (msg as { targets?: unknown }).targets;
	if (!Array.isArray(targets) || targets.length === 0) return false;
	return targets.every((t: { source?: string }) =>
		["fixed+gate", "fixed+chain"].includes(t?.source ?? ""),
	);
}

/**
 * Every layout this plugin can decode, keyed by ROS type, newest first.
 *
 * A list rather than a single definition because two builds of `emi_msgs` are
 * live at once and the page has to work with both: the recorded bags predate
 * `EMICoilGnss.yaw` and `EMITarget.source`, while a robot running the current
 * working tree emits them. CDR carries no schema, so the reader cannot be told
 * which layout it is looking at — {@link decodeMessage} tries them in order and
 * remembers which one worked.
 *
 * Order matters: newest first, so a live robot is decoded on the first attempt
 * and only recordings pay for the retry.
 */
export const SCHEMAS: Readonly<Record<string, readonly SchemaVariant[]>> = {
	"emi_msgs/msg/EMI": [{ label: "current", text: EMI_SCHEMA }],
	"emi_msgs/msg/EMIGnss": [
		{ label: "with-yaw", text: EMIGNSS_SCHEMA, validate: validEmiGnss },
		{
			label: "legacy",
			text: EMIGNSS_SCHEMA_LEGACY,
			validate: validEmiGnss,
		},
	],
	"emi_msgs/msg/EMITargetList": [
		{
			label: "with-source",
			text: EMITARGETLIST_SCHEMA,
			validate: validTargetList,
		},
		{ label: "legacy", text: EMITARGETLIST_SCHEMA_LEGACY },
	],
	"emi_msgs/msg/EMITarget": [
		{
			label: "with-source",
			text: EMITARGET_SCHEMA,
			validate: (m) => validTargetList({ targets: [m] }),
		},
		{ label: "legacy", text: EMITARGET_SCHEMA_LEGACY },
	],
	"sensor_msgs/msg/NavSatFix": [{ label: "current", text: NAVSATFIX_SCHEMA }],
	"geometry_msgs/msg/QuaternionStamped": [
		{ label: "current", text: QUATERNIONSTAMPED_SCHEMA },
	],
	"tf2_msgs/msg/TFMessage": [{ label: "current", text: TFMESSAGE_SCHEMA }],
};

/** True when this plugin ships at least one definition for a ROS type. */
export function canDecode(rosType: string): boolean {
	return rosType in SCHEMAS;
}
