/**
 * Tests for transform mathematical operations
 * Testing quaternion rotations, transform inversions, chain applications, and GPS conversions
 */

import { describe, test, expect } from "bun:test";
import {
  rotateVectorByQuaternion,
  invertTransform,
  applyTransform,
  applyTransformChain,
  localToGPS,
  gpsToLocal,
} from "../utils";
import type { Transform, Vector3, Quaternion } from "../../types";

describe("Transform Math - Quaternion Rotations", () => {
  test("should not rotate vector with identity quaternion", () => {
    const vector: Vector3 = { x: 1, y: 0, z: 0 };
    const identityQuat: Quaternion = { x: 0, y: 0, z: 0, w: 1 };

    const result = rotateVectorByQuaternion(vector, identityQuat);

    expect(result.x).toBeCloseTo(1, 5);
    expect(result.y).toBeCloseTo(0, 5);
    expect(result.z).toBeCloseTo(0, 5);
  });

  test("should rotate vector 90° around Z axis", () => {
    // Quaternion for 90° rotation around Z axis
    // q = [0, 0, sin(45°), cos(45°)] = [0, 0, 0.707, 0.707]
    const vector: Vector3 = { x: 1, y: 0, z: 0 };
    const quat: Quaternion = {
      x: 0,
      y: 0,
      z: Math.sin(Math.PI / 4),
      w: Math.cos(Math.PI / 4),
    };

    const result = rotateVectorByQuaternion(vector, quat);

    // After 90° rotation around Z: (1,0,0) -> (0,1,0)
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(1, 5);
    expect(result.z).toBeCloseTo(0, 5);
  });

  test("should rotate vector 180° around Z axis", () => {
    const vector: Vector3 = { x: 1, y: 0, z: 0 };
    const quat: Quaternion = {
      x: 0,
      y: 0,
      z: 1, // sin(90°)
      w: 0, // cos(90°)
    };

    const result = rotateVectorByQuaternion(vector, quat);

    // After 180° rotation around Z: (1,0,0) -> (-1,0,0)
    expect(result.x).toBeCloseTo(-1, 5);
    expect(result.y).toBeCloseTo(0, 5);
    expect(result.z).toBeCloseTo(0, 5);
  });

  test("should rotate vector 90° around Y axis", () => {
    const vector: Vector3 = { x: 1, y: 0, z: 0 };
    const quat: Quaternion = {
      x: 0,
      y: Math.sin(Math.PI / 4),
      z: 0,
      w: Math.cos(Math.PI / 4),
    };

    const result = rotateVectorByQuaternion(vector, quat);

    // After 90° rotation around Y: (1,0,0) -> (0,0,-1)
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(0, 5);
    expect(result.z).toBeCloseTo(-1, 5);
  });

  test("should rotate vector 90° around X axis", () => {
    const vector: Vector3 = { x: 0, y: 1, z: 0 };
    const quat: Quaternion = {
      x: Math.sin(Math.PI / 4),
      y: 0,
      z: 0,
      w: Math.cos(Math.PI / 4),
    };

    const result = rotateVectorByQuaternion(vector, quat);

    // After 90° rotation around X: (0,1,0) -> (0,0,1)
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(0, 5);
    expect(result.z).toBeCloseTo(1, 5);
  });

  test("should handle arbitrary vector rotation", () => {
    const vector: Vector3 = { x: 1, y: 1, z: 1 };
    const quat: Quaternion = {
      x: 0,
      y: 0,
      z: Math.sin(Math.PI / 4),
      w: Math.cos(Math.PI / 4),
    };

    const result = rotateVectorByQuaternion(vector, quat);

    // The magnitude should be preserved
    const originalMagnitude = Math.sqrt(1 * 1 + 1 * 1 + 1 * 1);
    const resultMagnitude = Math.sqrt(
      result.x * result.x + result.y * result.y + result.z * result.z,
    );

    expect(resultMagnitude).toBeCloseTo(originalMagnitude, 5);
  });
});

describe("Transform Math - Transform Inversion", () => {
  test("should invert identity transform", () => {
    const identity: Transform = {
      position: { x: 0, y: 0, z: 0, w: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      convention: "ROS",
    };

    const inverted = invertTransform(identity);

    expect(inverted.position.x).toBeCloseTo(0, 5);
    expect(inverted.position.y).toBeCloseTo(0, 5);
    expect(inverted.position.z).toBeCloseTo(0, 5);
    expect(inverted.rotation.x).toBeCloseTo(0, 5);
    expect(inverted.rotation.y).toBeCloseTo(0, 5);
    expect(inverted.rotation.z).toBeCloseTo(0, 5);
    expect(inverted.rotation.w).toBeCloseTo(1, 5);
  });

  test("should invert pure translation", () => {
    const transform: Transform = {
      position: { x: 1, y: 2, z: 3, w: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      convention: "ROS",
    };

    const inverted = invertTransform(transform);

    expect(inverted.position.x).toBeCloseTo(-1, 5);
    expect(inverted.position.y).toBeCloseTo(-2, 5);
    expect(inverted.position.z).toBeCloseTo(-3, 5);
    expect(inverted.rotation.w).toBeCloseTo(1, 5);
  });

  test("should invert pure rotation", () => {
    const transform: Transform = {
      position: { x: 0, y: 0, z: 0, w: 0 },
      rotation: {
        x: 0,
        y: 0,
        z: Math.sin(Math.PI / 4),
        w: Math.cos(Math.PI / 4),
      }, // 90° around Z
      convention: "ROS",
    };

    const inverted = invertTransform(transform);

    // Inverted rotation should be -90° around Z
    expect(inverted.rotation.x).toBeCloseTo(0, 5);
    expect(inverted.rotation.y).toBeCloseTo(0, 5);
    expect(inverted.rotation.z).toBeCloseTo(-Math.sin(Math.PI / 4), 5);
    expect(inverted.rotation.w).toBeCloseTo(Math.cos(Math.PI / 4), 5);
  });

  test("should invert combined rotation and translation", () => {
    const transform: Transform = {
      position: { x: 1, y: 0, z: 0, w: 0 },
      rotation: {
        x: 0,
        y: 0,
        z: Math.sin(Math.PI / 4),
        w: Math.cos(Math.PI / 4),
      }, // 90° around Z
      convention: "ROS",
    };

    const inverted = invertTransform(transform);

    // Apply transform then inverse should return to origin
    const point: Vector3 = { x: 1, y: 1, z: 0 };
    const transformed = applyTransform(point, transform);
    const backToOriginal = applyTransform(transformed, inverted);

    expect(backToOriginal.x).toBeCloseTo(point.x, 5);
    expect(backToOriginal.y).toBeCloseTo(point.y, 5);
    expect(backToOriginal.z).toBeCloseTo(point.z, 5);
  });

  test("should satisfy T * T^-1 = Identity property", () => {
    const transform: Transform = {
      position: { x: 2, y: 3, z: 1, w: 0 },
      rotation: {
        x: 0.1,
        y: 0.2,
        z: 0.3,
        w: Math.sqrt(1 - 0.1 * 0.1 - 0.2 * 0.2 - 0.3 * 0.3),
      },
      convention: "ROS",
    };

    const inverted = invertTransform(transform);
    const testPoint: Vector3 = { x: 5, y: 7, z: 2 };

    // Forward then backward
    const forward = applyTransform(testPoint, transform);
    const backward = applyTransform(forward, inverted);

    expect(backward.x).toBeCloseTo(testPoint.x, 4);
    expect(backward.y).toBeCloseTo(testPoint.y, 4);
    expect(backward.z).toBeCloseTo(testPoint.z, 4);
  });
});

describe("Transform Math - Apply Transform", () => {
  test("should apply identity transform", () => {
    const point: Vector3 = { x: 1, y: 2, z: 3 };
    const identity: Transform = {
      position: { x: 0, y: 0, z: 0, w: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      convention: "ROS",
    };

    const result = applyTransform(point, identity);

    expect(result.x).toBeCloseTo(1, 5);
    expect(result.y).toBeCloseTo(2, 5);
    expect(result.z).toBeCloseTo(3, 5);
  });

  test("should apply pure translation", () => {
    const point: Vector3 = { x: 1, y: 2, z: 3 };
    const transform: Transform = {
      position: { x: 10, y: 20, z: 30, w: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      convention: "ROS",
    };

    const result = applyTransform(point, transform);

    expect(result.x).toBeCloseTo(11, 5);
    expect(result.y).toBeCloseTo(22, 5);
    expect(result.z).toBeCloseTo(33, 5);
  });

  test("should apply pure rotation", () => {
    const point: Vector3 = { x: 1, y: 0, z: 0 };
    const transform: Transform = {
      position: { x: 0, y: 0, z: 0, w: 0 },
      rotation: {
        x: 0,
        y: 0,
        z: Math.sin(Math.PI / 4),
        w: Math.cos(Math.PI / 4),
      }, // 90° around Z
      convention: "ROS",
    };

    const result = applyTransform(point, transform);

    // Point (1,0,0) rotated 90° around Z becomes (0,1,0)
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(1, 5);
    expect(result.z).toBeCloseTo(0, 5);
  });

  test("should apply rotation then translation", () => {
    const point: Vector3 = { x: 1, y: 0, z: 0 };
    const transform: Transform = {
      position: { x: 5, y: 5, z: 0, w: 0 },
      rotation: {
        x: 0,
        y: 0,
        z: Math.sin(Math.PI / 4),
        w: Math.cos(Math.PI / 4),
      }, // 90° around Z
      convention: "ROS",
    };

    const result = applyTransform(point, transform);

    // Rotate (1,0,0) -> (0,1,0), then translate +5,+5
    expect(result.x).toBeCloseTo(5, 5);
    expect(result.y).toBeCloseTo(6, 5);
    expect(result.z).toBeCloseTo(0, 5);
  });
});

describe("Transform Math - Transform Chains", () => {
  test("should apply empty chain (identity)", () => {
    const point: Vector3 = { x: 1, y: 2, z: 3 };
    const chain: Transform[] = [];

    const result = applyTransformChain(point, chain);

    expect(result.x).toBeCloseTo(1, 5);
    expect(result.y).toBeCloseTo(2, 5);
    expect(result.z).toBeCloseTo(3, 5);
  });

  test("should apply single transform in chain", () => {
    const point: Vector3 = { x: 1, y: 0, z: 0 };
    const chain: Transform[] = [
      {
        position: { x: 10, y: 0, z: 0, w: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        convention: "ROS",
      },
    ];

    const result = applyTransformChain(point, chain);

    expect(result.x).toBeCloseTo(11, 5);
    expect(result.y).toBeCloseTo(0, 5);
    expect(result.z).toBeCloseTo(0, 5);
  });

  test("should apply multiple translations in sequence", () => {
    const point: Vector3 = { x: 0, y: 0, z: 0 };
    const chain: Transform[] = [
      {
        position: { x: 1, y: 0, z: 0, w: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        convention: "ROS",
      },
      {
        position: { x: 0, y: 2, z: 0, w: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        convention: "ROS",
      },
      {
        position: { x: 0, y: 0, z: 3, w: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        convention: "ROS",
      },
    ];

    const result = applyTransformChain(point, chain);

    expect(result.x).toBeCloseTo(1, 5);
    expect(result.y).toBeCloseTo(2, 5);
    expect(result.z).toBeCloseTo(3, 5);
  });

  test("should apply rotation chain (compound rotations)", () => {
    const point: Vector3 = { x: 1, y: 0, z: 0 };

    // Two 90° rotations around Z = 180° total
    const quat90Z: Quaternion = {
      x: 0,
      y: 0,
      z: Math.sin(Math.PI / 4),
      w: Math.cos(Math.PI / 4),
    };

    const chain: Transform[] = [
      {
        position: { x: 0, y: 0, z: 0, w: 0 },
        rotation: quat90Z,
        convention: "ROS",
      },
      {
        position: { x: 0, y: 0, z: 0, w: 0 },
        rotation: quat90Z,
        convention: "ROS",
      },
    ];

    const result = applyTransformChain(point, chain);

    // (1,0,0) -> 90° -> (0,1,0) -> 90° -> (-1,0,0)
    expect(result.x).toBeCloseTo(-1, 4);
    expect(result.y).toBeCloseTo(0, 4);
    expect(result.z).toBeCloseTo(0, 4);
  });

  test("should handle complex transform chain (map->odom->base_link)", () => {
    // Simulate map -> odom -> base_link hierarchy
    const point: Vector3 = { x: 0, y: 0, z: 0 }; // Point in base_link frame

    const chain: Transform[] = [
      // base_link to odom (child to parent)
      {
        position: { x: 2, y: 1, z: 0, w: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        convention: "ROS",
      },
      // odom to map (child to parent)
      {
        position: { x: 10, y: 5, z: 0, w: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        convention: "ROS",
      },
    ];

    const result = applyTransformChain(point, chain);

    // Origin in base_link -> (2,1,0) in odom -> (12,6,0) in map
    expect(result.x).toBeCloseTo(12, 5);
    expect(result.y).toBeCloseTo(6, 5);
    expect(result.z).toBeCloseTo(0, 5);
  });
});

describe("Transform Math - GPS Conversions", () => {
  test("should convert zero offset to same GPS coordinates", () => {
    const localPoint: Vector3 = { x: 0, y: 0, z: 0 };
    const origin = { latitude: 45.0, longitude: -122.0, altitude: 100 };

    const gps = localToGPS(localPoint, origin);

    expect(gps.latitude).toBeCloseTo(45.0, 5);
    expect(gps.longitude).toBeCloseTo(-122.0, 5);
    expect(gps.altitude).toBeCloseTo(100, 5);
  });

  test("should convert 1000m East to longitude offset", () => {
    const localPoint: Vector3 = { x: 1000, y: 0, z: 0 }; // 1km East
    const origin = { latitude: 45.0, longitude: 0.0, altitude: 0 };

    const gps = localToGPS(localPoint, origin);

    expect(gps.latitude).toBeCloseTo(45.0, 5);
    expect(gps.longitude).toBeGreaterThan(0.0);
    // At 45° latitude, 1km East ≈ 0.0127° longitude
    expect(gps.longitude).toBeCloseTo(0.0127, 3);
  });

  test("should convert 1000m North to latitude offset", () => {
    const localPoint: Vector3 = { x: 0, y: 1000, z: 0 }; // 1km North
    const origin = { latitude: 0.0, longitude: 0.0, altitude: 0 };

    const gps = localToGPS(localPoint, origin);

    expect(gps.longitude).toBeCloseTo(0.0, 5);
    expect(gps.latitude).toBeGreaterThan(0.0);
    // 1km North ≈ 0.009° latitude
    expect(gps.latitude).toBeCloseTo(0.009, 3);
  });

  test("should convert altitude changes correctly", () => {
    const localPoint: Vector3 = { x: 0, y: 0, z: 50 }; // 50m Up
    const origin = { latitude: 45.0, longitude: -122.0, altitude: 100 };

    const gps = localToGPS(localPoint, origin);

    expect(gps.latitude).toBeCloseTo(45.0, 5);
    expect(gps.longitude).toBeCloseTo(-122.0, 5);
    expect(gps.altitude).toBeCloseTo(150, 5);
  });

  test("should perform round-trip GPS conversion", () => {
    const origin = {
      latitude: 47.6062,
      longitude: -122.3321,
      altitude: 50,
    };
    const testGPS = { latitude: 47.61, longitude: -122.33, altitude: 75 };

    // GPS -> Local -> GPS
    const local = gpsToLocal(testGPS, origin);
    const backToGPS = localToGPS(local, origin);

    expect(backToGPS.latitude).toBeCloseTo(testGPS.latitude, 4);
    expect(backToGPS.longitude).toBeCloseTo(testGPS.longitude, 4);
    expect(backToGPS.altitude).toBeCloseTo(testGPS.altitude, 4);
  });

  test("should convert GPS differences to local correctly", () => {
    const origin = { latitude: 45.0, longitude: 0.0, altitude: 0 };
    const gps = { latitude: 45.009, longitude: 0.0127, altitude: 100 };

    const local = gpsToLocal(gps, origin);

    // Should be approximately 1km East and North, 100m Up
    // The longitude to meters conversion accounts for latitude
    expect(local.x).toBeCloseTo(1000, -1); // Within ~50m (varies with latitude)
    expect(local.y).toBeCloseTo(1000, -2); // Within 100m
    expect(local.z).toBeCloseTo(100, 2);
  });

  test("should handle negative offsets (South and West)", () => {
    const localPoint: Vector3 = { x: -1000, y: -1000, z: -50 };
    const origin = { latitude: 45.0, longitude: -122.0, altitude: 100 };

    const gps = localToGPS(localPoint, origin);

    expect(gps.latitude).toBeLessThan(45.0); // South
    expect(gps.longitude).toBeLessThan(-122.0); // West
    expect(gps.altitude).toBeCloseTo(50, 5); // Lower altitude
  });
});

describe("Transform Math - Edge Cases", () => {
  test("should handle zero-magnitude quaternion rotation", () => {
    const vector: Vector3 = { x: 1, y: 0, z: 0 };
    const zeroQuat: Quaternion = { x: 0, y: 0, z: 0, w: 0 };

    // This is technically invalid, but should not crash
    const result = rotateVectorByQuaternion(vector, zeroQuat);

    expect(result.x).toBeDefined();
    expect(result.y).toBeDefined();
    expect(result.z).toBeDefined();
  });

  test("should preserve point on rotation axis", () => {
    const point: Vector3 = { x: 0, y: 0, z: 5 }; // On Z axis
    const quat: Quaternion = {
      x: 0,
      y: 0,
      z: Math.sin(Math.PI / 4),
      w: Math.cos(Math.PI / 4),
    }; // 90° around Z

    const result = rotateVectorByQuaternion(point, quat);

    // Point on axis of rotation should not move
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(0, 5);
    expect(result.z).toBeCloseTo(5, 5);
  });

  test("should handle very small translations", () => {
    const point: Vector3 = { x: 0, y: 0, z: 0 };
    const transform: Transform = {
      position: { x: 1e-10, y: 1e-10, z: 1e-10, w: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      convention: "ROS",
    };

    const result = applyTransform(point, transform);

    expect(result.x).toBeCloseTo(1e-10, 15);
    expect(result.y).toBeCloseTo(1e-10, 15);
    expect(result.z).toBeCloseTo(1e-10, 15);
  });

  test("should handle large translation values", () => {
    const point: Vector3 = { x: 0, y: 0, z: 0 };
    const transform: Transform = {
      position: { x: 1e6, y: 1e6, z: 1e6, w: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      convention: "ROS",
    };

    const result = applyTransform(point, transform);

    expect(result.x).toBeCloseTo(1e6, 0);
    expect(result.y).toBeCloseTo(1e6, 0);
    expect(result.z).toBeCloseTo(1e6, 0);
  });
});

describe("Transform Math - Numerical Stability", () => {
  test("should maintain quaternion unit norm property after inversion", () => {
    const transform: Transform = {
      position: { x: 1, y: 2, z: 3, w: 0 },
      rotation: {
        x: 0.1,
        y: 0.2,
        z: 0.3,
        w: Math.sqrt(1 - 0.1 * 0.1 - 0.2 * 0.2 - 0.3 * 0.3),
      },
      convention: "ROS",
    };

    const inverted = invertTransform(transform);

    // Check quaternion is still unit length
    const norm = Math.sqrt(
      inverted.rotation.x * inverted.rotation.x +
        inverted.rotation.y * inverted.rotation.y +
        inverted.rotation.z * inverted.rotation.z +
        inverted.rotation.w * inverted.rotation.w,
    );

    expect(norm).toBeCloseTo(1.0, 10);
  });

  test("should maintain distance after rotation", () => {
    const point: Vector3 = { x: 3, y: 4, z: 5 };
    const originalDistance = Math.sqrt(
      point.x * point.x + point.y * point.y + point.z * point.z,
    );

    const quat: Quaternion = {
      x: 0.1,
      y: 0.2,
      z: 0.3,
      w: Math.sqrt(1 - 0.1 * 0.1 - 0.2 * 0.2 - 0.3 * 0.3),
    };

    const rotated = rotateVectorByQuaternion(point, quat);
    const rotatedDistance = Math.sqrt(
      rotated.x * rotated.x + rotated.y * rotated.y + rotated.z * rotated.z,
    );

    expect(rotatedDistance).toBeCloseTo(originalDistance, 10);
  });

  test("should handle multiple inversions without accumulating error", () => {
    const transform: Transform = {
      position: { x: 1, y: 2, z: 3, w: 0 },
      rotation: {
        x: 0.1,
        y: 0.2,
        z: 0.3,
        w: Math.sqrt(1 - 0.1 * 0.1 - 0.2 * 0.2 - 0.3 * 0.3),
      },
      convention: "ROS",
    };

    // Invert 10 times
    let current = transform;
    for (let i = 0; i < 10; i++) {
      current = invertTransform(current);
    }

    // After even number of inversions, should be close to original
    // (floating point errors will accumulate slightly)
    expect(current.position.x).toBeCloseTo(transform.position.x, 3);
    expect(current.position.y).toBeCloseTo(transform.position.y, 3);
    expect(current.position.z).toBeCloseTo(transform.position.z, 3);
  });
});
