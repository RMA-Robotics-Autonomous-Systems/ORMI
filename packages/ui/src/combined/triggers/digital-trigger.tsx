"use client";
import React, { useEffect, useState, useRef } from "react";

import { GamepadIcon, KeyboardIcon } from "lucide-react";
import { DigitalInput, getGamepadButtonName } from "./digital-trigger-input";

interface DigitalInputComponentProps {
  onActive: (value: number) => void;
  onInactive: (value: number) => void;

  digitalInput: DigitalInput;
}

const GAMEPAD_THRESHOLD = 0.1; // Threshold for considering a gamepad button/trigger pressed

export const DigitalComponent = (props: DigitalInputComponentProps) => {
  const { onActive, onInactive, digitalInput } = props;
  const [isActive, setIsActive] = useState(false);
  const data = digitalInput;
  const isActiveRef = useRef(isActive); // Use ref to access current state within interval/event listeners
  const isMouseDownRef = useRef(false); // Ref to track mouse down state
  const previousValueRef = useRef<number | null>(null); // Ref to store the last sent value

  // Update ref whenever state changes
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    const keyPressEvent = (event: KeyboardEvent) => {
      // Check data exists and matches type/key
      if (
        data?.type === "keyboard" &&
        event.key.toLowerCase() === data.key?.toLowerCase()
      ) {
        // Only trigger if not already active
        if (!isActiveRef.current) {
          setIsActive(true);
          onActive(1);
        }
      }
    };

    const keyUpEvent = (event: KeyboardEvent) => {
      // Check data exists and matches type/key
      if (
        data?.type === "keyboard" &&
        event.key.toLowerCase() === data.key?.toLowerCase()
      ) {
        // Only trigger if currently active
        if (isActiveRef.current) {
          setIsActive(false);
          onInactive(0);
        }
      }
    };

    const gamePadInterval = setInterval(() => {
      // Only run if configured for gamepad and data is valid
      if (data?.type !== "gamepad" || data.gamepadButtonIndex === undefined)
        return;
      if (isMouseDownRef.current) return; // Ignore gamepad input if mouse is down | it takes priority

      const currentFrameGamepads = navigator.getGamepads();
      // Find the specific gamepad by ID. Note: Gamepad index might not be stable, ID is better.
      const targetGamepad = Array.from(currentFrameGamepads).find(
        (gp) => gp?.id === data.gamepadId, // Matching by ID primarily
      );

      if (targetGamepad) {
        const button = targetGamepad.buttons[data.gamepadButtonIndex];
        if (button) {
          const currentValue = button.value;
          // Determine pressed state based on threshold
          const pressed = currentValue > GAMEPAD_THRESHOLD;

          if (pressed) {
            // Check if it's the first activation or the value has changed
            if (
              !isActiveRef.current ||
              currentValue !== previousValueRef.current
            ) {
              if (!isActiveRef.current) {
                setIsActive(true); // Set state only on initial transition
              }
              // Call onActive and update the stored previous value
              onActive(currentValue);
              previousValueRef.current = currentValue;
            }
          } else {
            // Transition to inactive state (only if currently active)
            if (isActiveRef.current) {
              setIsActive(false);
              onInactive(0);
              previousValueRef.current = null; // Reset previous value on becoming inactive
            }
          }
        } else {
          // Button index out of bounds? Ensure inactive if was active.
          if (isActiveRef.current) {
            setIsActive(false);
            onInactive(0);
            previousValueRef.current = null; // Reset previous value
          }
        }
      } else {
        // Gamepad disconnected? Ensure inactive if was active.
        if (isActiveRef.current) {
          setIsActive(false);
          onInactive(0);
          previousValueRef.current = null; // Reset previous value
        }
      }
    }, 50); // Check gamepad state periodically

    window.addEventListener("keydown", keyPressEvent);
    window.addEventListener("keyup", keyUpEvent);

    return () => {
      window.removeEventListener("keydown", keyPressEvent);
      window.removeEventListener("keyup", keyUpEvent);
      clearInterval(gamePadInterval);
      // Ensure inactive is called if component unmounts while active
      if (isActiveRef.current) {
        onInactive(0);
        // No need to reset previousValueRef here as the component is unmounting
      }
    };
    // Dependencies: Re-run effect if input configuration or callbacks change.
  }, [data, onActive, onInactive]);

  const handMouseDown = () => {
    onActive(1);
    isMouseDownRef.current = true; // Set mouse down state
    setIsActive(true);
  };

  const handMouseUp = () => {
    onInactive(0);
    isMouseDownRef.current = false; // Reset mouse down state
    setIsActive(false);
  };

  return (
    <div style={{ width: "10rem" }}>
      {/* Use isActive state for visual feedback */}
      <span
        data-active={isActive}
        className="bg-black/10 p-[5%] w-full rounded-[var(--radius)] border-[0.2rem] border-black/10 flex justify-center items-center select-none hover:bg-black/20 hover:scale-110 hover:cursor-pointer data-[active=true]:bg-green-600/20 data-[active=true]:scale-110 transition-all duration-100"
        onMouseDown={handMouseDown}
        onMouseUp={handMouseUp}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-evenly",
            width: "100%",
          }}
        >
          {/* Check data exists before accessing properties */}
          {data?.type === "keyboard" ? (
            <>
              <KeyboardIcon />
              {data.key?.toUpperCase()}
            </>
          ) : data?.type === "gamepad" ? (
            <>
              <GamepadIcon />
              {/* Ensure button index is defined before calling helper */}
              {data.gamepadButtonIndex !== undefined
                ? getGamepadButtonName(data.gamepadButtonIndex)
                : "N/A"}
            </>
          ) : (
            // Handle case where data might be null or type is unexpected
            "N/A"
          )}
        </div>
      </span>
    </div>
  );
};
