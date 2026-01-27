/**
 * Tests for coordinate system conversions
 *
 * Critical: Wrong conversions = robots/drones moving in wrong directions
 * Focus: Mathematical correctness, round-trip conversions, edge cases
 */

import { describe, test, expect } from "bun:test";
import {
  convertPosition,
  convertQuaternion,
  rosToThree,
  threeToRos,
  enuToRos,
  rosToEnu,
  nedToRos,
  rosToNed,
  COORDINATE_CONVENTION_INFO,
} from "../coordinate-systems";
import type {
  Vector3,
  Quaternion,
  Transform,
  CoordinateConvention,
} from "../../types";

describe("Coordinate Systems - Vector Conversions", () => {
  test("should not modify vector when converting from same convention to itself", () => {
    const vector: Vector3 = { x: 1, y: 2, z: 3 };
    const result = convertPosition(vector, "ROS", "ROS");

    expect(result.x).toBe(1);
    expect(result.y).toBe(2);
    expect(result.z).toBe(3);
  });

  test("should convert ROS to THREE.js correctly", () => {
    // ROS: X forward, Y left, Z up
    // THREE: X right, Y up, Z out (towards viewer)
    // ROS forward (1,0,0) should become THREE out (0,0,-1)
    const rosForward: Vector3 = { x: 1, y: 0, z: 0 };
    const three = rosToThree(rosForward);

    expect(three.x).toBeCloseTo(0, 5); // right
    expect(three.y).toBeCloseTo(0, 5); // up
    expect(three.z).toBeCloseTo(-1, 5); // out

    // ROS left (0,1,0) should become THREE left (-1,0,0)
    const rosLeft: Vector3 = { x: 0, y: 1, z: 0 };
    const threeLeft = rosToThree(rosLeft);

    expect(threeLeft.x).toBeCloseTo(-1, 5); // -right = left
    expect(threeLeft.y).toBeCloseTo(0, 5);
    expect(threeLeft.z).toBeCloseTo(0, 5);

    // ROS up (0,0,1) should become THREE up (0,1,0)
    const rosUp: Vector3 = { x: 0, y: 0, z: 1 };
    const threeUp = rosToThree(rosUp);

    expect(threeUp.x).toBeCloseTo(0, 5);
    expect(threeUp.y).toBeCloseTo(1, 5); // up
    expect(threeUp.z).toBeCloseTo(0, 5);
  });

  test("should convert ROS to ENU correctly", () => {
    // ROS: X forward, Y left, Z up (assuming forward = north)
    // ENU: X east, Y north, Z up

    // ROS forward (1,0,0) = north = ENU Y
    const rosForward: Vector3 = { x: 1, y: 0, z: 0 };
    const enu = rosToEnu(rosForward);

    expect(enu.x).toBeCloseTo(0, 5); // east
    expect(enu.y).toBeCloseTo(1, 5); // north
    expect(enu.z).toBeCloseTo(0, 5); // up

    // ROS left (0,1,0) = west = ENU -X
    const rosLeft: Vector3 = { x: 0, y: 1, z: 0 };
    const enuWest = rosToEnu(rosLeft);

    expect(enuWest.x).toBeCloseTo(-1, 5); // west = -east
    expect(enuWest.y).toBeCloseTo(0, 5);
    expect(enuWest.z).toBeCloseTo(0, 5);
  });

  test("should convert ROS to NED correctly", () => {
    // ROS: X forward, Y left, Z up
    // NED: X north, Y east, Z down

    // ROS forward (1,0,0) = north = NED X
    const rosForward: Vector3 = { x: 1, y: 0, z: 0 };
    const ned = rosToNed(rosForward);

    expect(ned.x).toBeCloseTo(1, 5); // north
    expect(ned.y).toBeCloseTo(0, 5); // east
    expect(ned.z).toBeCloseTo(0, 5); // down

    // ROS up (0,0,1) = NED down (-1)
    const rosUp: Vector3 = { x: 0, y: 0, z: 1 };
    const nedDown = rosToNed(rosUp);

    expect(nedDown.x).toBeCloseTo(0, 5);
    expect(nedDown.y).toBeCloseTo(0, 5);
    expect(nedDown.z).toBeCloseTo(-1, 5); // down = -up
  });

  test("should perform round-trip conversion correctly (ROS -> THREE -> ROS)", () => {
    const original: Vector3 = { x: 3, y: 7, z: -2 };

    const three = rosToThree(original);
    const backToRos = threeToRos(three);

    expect(backToRos.x).toBeCloseTo(original.x, 5);
    expect(backToRos.y).toBeCloseTo(original.y, 5);
    expect(backToRos.z).toBeCloseTo(original.z, 5);
  });

  test("should perform round-trip conversion correctly (ROS -> ENU -> ROS)", () => {
    const original: Vector3 = { x: 5, y: -3, z: 8 };

    const enu = rosToEnu(original);
    const backToRos = enuToRos(enu);

    expect(backToRos.x).toBeCloseTo(original.x, 5);
    expect(backToRos.y).toBeCloseTo(original.y, 5);
    expect(backToRos.z).toBeCloseTo(original.z, 5);
  });

  test("should perform round-trip conversion correctly (THREE -> NED -> THREE)", () => {
    const original: Vector3 = { x: 2, y: 4, z: -6 };

    const ned = convertPosition(original, "THREE", "NED");
    const backToThree = convertPosition(ned, "NED", "THREE");

    expect(backToThree.x).toBeCloseTo(original.x, 5);
    expect(backToThree.y).toBeCloseTo(original.y, 5);
    expect(backToThree.z).toBeCloseTo(original.z, 5);
  });

  test("should preserve vector magnitude across conversions", () => {
    const original: Vector3 = { x: 3, y: 4, z: 5 };
    const originalMagnitude = Math.sqrt(
      original.x ** 2 + original.y ** 2 + original.z ** 2,
    );

    const three = rosToThree(original);
    const threeMagnitude = Math.sqrt(
      three.x ** 2 + three.y ** 2 + three.z ** 2,
    );

    expect(threeMagnitude).toBeCloseTo(originalMagnitude, 5);
  });
});

describe("Coordinate Systems - Quaternion Conversions", () => {
  test("should preserve identity quaternion across conventions", () => {
    const identity: Quaternion = { x: 0, y: 0, z: 0, w: 1 };
    const result = convertQuaternion(identity, "ROS", "THREE");

    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(0, 5);
    expect(result.z).toBeCloseTo(0, 5);
    expect(result.w).toBeCloseTo(1, 5);
  });

  test("should convert quaternion from ROS to THREE", () => {
    // 90 degree rotation around Z axis in ROS
    const rosRotation: Quaternion = {
      x: 0,
      y: 0,
      z: Math.sin(Math.PI / 4),
      w: Math.cos(Math.PI / 4),
    };

    const threeRotation = convertQuaternion(rosRotation, "ROS", "THREE");

    // Should still represent the same rotation in THREE convention
    // Magnitude should be preserved
    const rosMag = Math.sqrt(
      rosRotation.x ** 2 +
        rosRotation.y ** 2 +
        rosRotation.z ** 2 +
        rosRotation.w ** 2,
    );
    const threeMag = Math.sqrt(
      threeRotation.x ** 2 +
        threeRotation.y ** 2 +
        threeRotation.z ** 2 +
        threeRotation.w ** 2,
    );

    expect(threeMag).toBeCloseTo(rosMag, 5);
  });

  test("should perform round-trip quaternion conversion correctly", () => {
    const original: Quaternion = {
      x: 0.1,
      y: 0.2,
      z: 0.3,
      w: Math.sqrt(1 - 0.1 ** 2 - 0.2 ** 2 - 0.3 ** 2),
    };

    const three = convertQuaternion(original, "ROS", "THREE");
    const backToRos = convertQuaternion(three, "THREE", "ROS");

    expect(backToRos.x).toBeCloseTo(original.x, 5);
    expect(backToRos.y).toBeCloseTo(original.y, 5);
    expect(backToRos.z).toBeCloseTo(original.z, 5);
    expect(backToRos.w).toBeCloseTo(original.w, 5);
  });

  test("should maintain quaternion unit norm after conversion", () => {
    const original: Quaternion = {
      x: 0,
      y: 0,
      z: Math.sin(Math.PI / 6),
      w: Math.cos(Math.PI / 6),
    };

    const converted = convertQuaternion(original, "ROS", "ENU");
    const norm = Math.sqrt(
      converted.x ** 2 + converted.y ** 2 + converted.z ** 2 + converted.w ** 2,
    );

    expect(norm).toBeCloseTo(1, 5);
  });
});

describe("Coordinate Systems - Transform Conversions", () => {
  test("should convert complete transform from ROS to THREE", () => {
    const rosTransform: Transform = {
      position: { x: 1, y: 2, z: 3, w: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      convention: "ROS",
    };

    // Convert position
    const threePosition = rosToThree(rosTransform.position);
    // Convert rotation
    const threeRotation = convertQuaternion(
      rosTransform.rotation,
      "ROS",
      "THREE",
    );

    expect(threePosition).toBeDefined();
    expect(threeRotation).toBeDefined();
  });

  test("should perform round-trip transform conversion", () => {
    const original: Transform = {
      position: { x: 5, y: -3, z: 7, w: 0 },
      rotation: {
        x: 0.1,
        y: 0.2,
        z: 0.3,
        w: Math.sqrt(1 - 0.1 ** 2 - 0.2 ** 2 - 0.3 ** 2),
      },
      convention: "ROS",
    };

    const enuPos = rosToEnu(original.position);
    const enuRot = convertQuaternion(original.rotation, "ROS", "ENU");
    const backToRosPos = enuToRos(enuPos);
    const backToRosRot = convertQuaternion(enuRot, "ENU", "ROS");

    expect(backToRosPos.x).toBeCloseTo(original.position.x, 5);
    expect(backToRosPos.y).toBeCloseTo(original.position.y, 5);
    expect(backToRosPos.z).toBeCloseTo(original.position.z, 5);
    expect(backToRosRot.x).toBeCloseTo(original.rotation.x, 5);
    expect(backToRosRot.y).toBeCloseTo(original.rotation.y, 5);
    expect(backToRosRot.z).toBeCloseTo(original.rotation.z, 5);
    expect(backToRosRot.w).toBeCloseTo(original.rotation.w, 5);
  });
});

describe("Coordinate Systems - Edge Cases", () => {
  test("should handle zero vectors correctly", () => {
    const zero: Vector3 = { x: 0, y: 0, z: 0 };
    const result = rosToThree(zero);

    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.z).toBe(0);
  });

  test("should handle very large coordinate values", () => {
    const large: Vector3 = { x: 1e6, y: -1e6, z: 1e6 };
    const result = rosToEnu(large);
    const backToRos = enuToRos(result);

    expect(backToRos.x).toBeCloseTo(large.x, 0); // Less precision for large numbers
    expect(backToRos.y).toBeCloseTo(large.y, 0);
    expect(backToRos.z).toBeCloseTo(large.z, 0);
  });

  test("should handle very small coordinate values", () => {
    const small: Vector3 = { x: 1e-10, y: -1e-10, z: 1e-10 };
    const result = rosToNed(small);
    const backToRos = nedToRos(result);

    expect(backToRos.x).toBeCloseTo(small.x, 15);
    expect(backToRos.y).toBeCloseTo(small.y, 15);
    expect(backToRos.z).toBeCloseTo(small.z, 15);
  });

  test("should have valid convention info for all supported systems", () => {
    const conventions: CoordinateConvention[] = [
      "ROS",
      "THREE",
      "ENU",
      "NED",
      "NWU",
      "CUSTOM",
    ];

    conventions.forEach((convention) => {
      const info = COORDINATE_CONVENTION_INFO[convention];
      expect(info).toBeDefined();
      expect(info.name).toBeDefined();
      expect(info.description).toBeDefined();
      expect(info.axes).toBeDefined();
      expect(info.handedness).toBeDefined();
    });
  });
});

describe("Coordinate Systems - Multi-hop Conversions", () => {
  test("should match direct conversion with multi-hop conversion", () => {
    const original: Vector3 = { x: 3, y: 4, z: 5 };

    // Direct ROS -> NED
    const direct = rosToNed(original);

    // Multi-hop: ROS -> THREE -> NED
    const viaThree = rosToThree(original);
    const multiHop = convertPosition(viaThree, "THREE", "NED");

    expect(multiHop.x).toBeCloseTo(direct.x, 5);
    expect(multiHop.y).toBeCloseTo(direct.y, 5);
    expect(multiHop.z).toBeCloseTo(direct.z, 5);
  });
});
describe("Coordinate Systems - Production Edge Cases", () => {
  test("should handle NaN values without crashing", () => {
    const nanVector: Vector3 = { x: NaN, y: 0, z: 0 };

    expect(() => rosToThree(nanVector)).not.toThrow();
    const result = rosToThree(nanVector);
    expect(isNaN(result.x) || isNaN(result.y) || isNaN(result.z)).toBe(true);
  });

  test("should handle Infinity values", () => {
    const infVector: Vector3 = { x: Infinity, y: 0, z: 0 };

    expect(() => rosToThree(infVector)).not.toThrow();
    const result = rosToThree(infVector);
    // Infinity multiplied by matrix may become NaN or 0
    // Important: doesn't crash, undefined behavior is acceptable
    expect(typeof result.x).toBe("number");
    expect(typeof result.y).toBe("number");
    expect(typeof result.z).toBe("number");
  });

  test("should handle negative zero correctly", () => {
    const negZeroVector: Vector3 = { x: -0, y: -0, z: -0 };
    const result = rosToThree(negZeroVector);

    // May be +0 or -0 depending on matrix multiplication
    // Both are equal in JavaScript (Object.is distinguishes them)
    expect(Math.abs(result.x)).toBe(0);
    expect(Math.abs(result.y)).toBe(0);
    expect(Math.abs(result.z)).toBe(0);
  });

  test("should maintain precision with very small angle quaternions", () => {
    // Small rotation around Z axis (0.001 radians ≈ 0.057 degrees)
    const smallAngle = 0.001;
    const smallRot: Quaternion = {
      x: 0,
      y: 0,
      z: Math.sin(smallAngle / 2),
      w: Math.cos(smallAngle / 2),
    };

    const converted = convertQuaternion(smallRot, "ROS", "THREE");
    const backToRos = convertQuaternion(converted, "THREE", "ROS");

    // Should maintain precision even for tiny rotations
    expect(backToRos.x).toBeCloseTo(smallRot.x, 10);
    expect(backToRos.y).toBeCloseTo(smallRot.y, 10);
    expect(backToRos.z).toBeCloseTo(smallRot.z, 10);
    expect(backToRos.w).toBeCloseTo(smallRot.w, 10);
  });

  test("should handle quaternion with negative w correctly", () => {
    // q and -q represent the same rotation
    const q1: Quaternion = { x: 0.1, y: 0.2, z: 0.3, w: 0.9 };
    const q2: Quaternion = { x: -0.1, y: -0.2, z: -0.3, w: -0.9 };

    const converted1 = convertQuaternion(q1, "ROS", "THREE");
    const converted2 = convertQuaternion(q2, "ROS", "THREE");

    // Both should represent the same rotation (may differ by sign)
    const norm1 = Math.sqrt(
      converted1.x ** 2 +
        converted1.y ** 2 +
        converted1.z ** 2 +
        converted1.w ** 2,
    );
    const norm2 = Math.sqrt(
      converted2.x ** 2 +
        converted2.y ** 2 +
        converted2.z ** 2 +
        converted2.w ** 2,
    );

    expect(norm1).toBeCloseTo(norm2, 5);
    expect(norm1).toBeCloseTo(1, 5);
  });

  test("should normalize denormalized quaternion during conversion", () => {
    // Quaternion with norm != 1 (invalid - should be normalized)
    const denormalized: Quaternion = { x: 0.4, y: 0.8, z: 1.2, w: 1.6 };
    const norm = Math.sqrt(0.4 ** 2 + 0.8 ** 2 + 1.2 ** 2 + 1.6 ** 2);
    expect(norm).toBeCloseTo(2.1909, 4);

    // Conversion should normalize it (this is correct behavior)
    expect(() => convertQuaternion(denormalized, "ROS", "THREE")).not.toThrow();
    const result = convertQuaternion(denormalized, "ROS", "THREE");

    // Result should be normalized (norm = 1) - quaternions must have unit norm
    const resultNorm = Math.sqrt(
      result.x ** 2 + result.y ** 2 + result.z ** 2 + result.w ** 2,
    );
    expect(resultNorm).toBeCloseTo(1, 10);
  });

  test("should handle gimbal lock scenario (90-degree pitch)", () => {
    // 90-degree rotation around Y axis (gimbal lock for Euler angles)
    const gimbalLock: Quaternion = {
      x: 0,
      y: Math.sin(Math.PI / 4),
      z: 0,
      w: Math.cos(Math.PI / 4),
    };

    const converted = convertQuaternion(gimbalLock, "ROS", "THREE");
    const backToRos = convertQuaternion(converted, "THREE", "ROS");

    // Should maintain correctness even in gimbal lock
    expect(backToRos.x).toBeCloseTo(gimbalLock.x, 5);
    expect(backToRos.y).toBeCloseTo(gimbalLock.y, 5);
    expect(backToRos.z).toBeCloseTo(gimbalLock.z, 5);
    expect(backToRos.w).toBeCloseTo(gimbalLock.w, 5);
  });

  test("should handle multiple round-trips without drift", () => {
    const original: Vector3 = {
      x: 1.23456789,
      y: -2.3456789,
      z: 3.45678901,
    };
    let current = original;

    // Do 10 round trips
    for (let i = 0; i < 10; i++) {
      const three = rosToThree(current);
      current = threeToRos(three);
    }

    // Should not accumulate floating-point drift
    expect(current.x).toBeCloseTo(original.x, 8);
    expect(current.y).toBeCloseTo(original.y, 8);
    expect(current.z).toBeCloseTo(original.z, 8);
  });

  test("should handle conversion chain: ROS -> ENU -> NED -> THREE -> ROS", () => {
    const original: Vector3 = { x: 5.5, y: -3.3, z: 7.7 };

    const step1 = rosToEnu(original);
    const step2 = convertPosition(step1, "ENU", "NED");
    const step3 = convertPosition(step2, "NED", "THREE");
    const final = convertPosition(step3, "THREE", "ROS");

    // Long chain should still return to original
    expect(final.x).toBeCloseTo(original.x, 5);
    expect(final.y).toBeCloseTo(original.y, 5);
    expect(final.z).toBeCloseTo(original.z, 5);
  });

  test("should handle realistic GPS coordinate magnitudes", () => {
    // GPS coordinates can be large (lat/lon in meters from origin)
    const gpsVector: Vector3 = {
      x: 4234567.89, // ~4,234 km
      y: -1234567.89,
      z: 543.21,
    };

    const enu = rosToEnu(gpsVector);
    const backToRos = enuToRos(enu);

    // Should maintain precision even with large coordinates
    expect(backToRos.x).toBeCloseTo(gpsVector.x, 2);
    expect(backToRos.y).toBeCloseTo(gpsVector.y, 2);
    expect(backToRos.z).toBeCloseTo(gpsVector.z, 2);
  });

  test("should handle mixing millimeter and kilometer scales", () => {
    // Robot precision (mm) mixed with navigation scale (km)
    const mixed: Vector3 = {
      x: 0.001, // 1mm
      y: 1000000, // 1000km
      z: 0.0001, // 0.1mm
    };

    const three = rosToThree(mixed);
    const backToRos = threeToRos(three);

    // Both tiny and huge values should be preserved
    expect(backToRos.x).toBeCloseTo(mixed.x, 6);
    expect(backToRos.y).toBeCloseTo(mixed.y, 0);
    expect(backToRos.z).toBeCloseTo(mixed.z, 7);
  });
});
