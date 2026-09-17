/**
 * Whether a `PointCloud2` payload can be decoded through a `Float32Array` view.
 *
 * Pure, and deliberately separate from the converter so the condition can be
 * asserted directly. It used to be inline, and the only thing guarding it was a
 * benchmark that timed both paths and required the fast one to win — a
 * wall-clock comparison with a margin narrower than a GC pause, so it failed on
 * roughly one run in six and taught everyone to re-run CI rather than read it.
 * What that benchmark was actually trying to protect is this predicate: if it
 * silently starts returning `false` for the common layout, the decode quietly
 * drops to the per-component `DataView` reader and nothing else notices.
 *
 * Time is not a property of the code; this is.
 */

/** Numeric id of `sensor_msgs/PointField.FLOAT32`. */
export const POINT_FIELD_FLOAT32 = 7;

/** The layout facts that decide whether the float-view path is usable. */
export interface FloatViewLayout {
	/** False when the payload is big-endian (`is_bigendian`). */
	littleEndian: boolean;
	/** Bytes between consecutive points (`point_step`). */
	pointStep: number;
	/** Byte offset of the payload inside its backing `ArrayBuffer`. */
	byteOffset: number;
	/** Datatype ids of the x, y and z fields, in that order. */
	datatypes: readonly [
		number | undefined,
		number | undefined,
		number | undefined,
	];
	/** Byte offsets of the x, y and z fields, in that order. */
	offsets: readonly [
		number | undefined,
		number | undefined,
		number | undefined,
	];
}

/**
 * Decide whether a cloud's layout permits striding the payload as floats.
 *
 * A little-endian float32 x/y/z layout whose stride, field offsets and buffer
 * offset are all 4-byte aligned can be read as `view[base + fieldFloatOffset]`,
 * instead of paying a bounds-checked, endianness-branched `DataView` call per
 * component — this is the common Livox layout. Anything else keeps the
 * `DataView` reader, which is correct for every layout and merely slower.
 *
 * Every condition is necessary: a `Float32Array` view cannot be constructed at
 * all over a non-4-aligned byte offset, it reads host-endian so a big-endian
 * payload would decode to garbage, and a non-float32 field would be
 * reinterpreted rather than converted.
 *
 * @param layout - Layout facts read off the message.
 * @returns True when the float-view path is safe to take.
 */
export function canUseFloatView(layout: FloatViewLayout): boolean {
	const { littleEndian, pointStep, byteOffset, datatypes, offsets } = layout;

	if (!littleEndian) return false;
	if (pointStep % 4 !== 0) return false;
	if (byteOffset % 4 !== 0) return false;

	return (
		datatypes.every((datatype) => datatype === POINT_FIELD_FLOAT32) &&
		offsets.every((offset) => offset !== undefined && offset % 4 === 0)
	);
}
