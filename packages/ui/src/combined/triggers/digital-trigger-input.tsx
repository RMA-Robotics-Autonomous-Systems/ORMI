"use client";
import React, { useEffect, useState } from "react";

import { GamepadIcon, KeyboardIcon } from "lucide-react";

interface DigitalInputComponentProps {
  onChange: (data: DigitalInput) => void;
  data: DigitalInput | null;
}

// keyboard key or gamepad button
export interface DigitalInput {
  type: "keyboard" | "gamepad";
  key?: string;
  gamepadButton?: typeof StandardGamepadButtonNames; // Use the derived type
  gamepadButtonIndex?: number;
  gamepadId?: string;
}

// Standard Gamepad Button Mapping (adjust names as needed)
const StandardGamepadButtonNames: { [key: number]: string } = {
  0: "A / Cross",
  1: "B / Circle",
  2: "X / Square",
  3: "Y / Triangle",
  4: "LB",
  5: "RB",
  6: "LT",
  7: "RT",
  8: "Back / Select",
  9: "Start",
  10: "L Stick",
  11: "R Stick",
  12: "Up",
  13: "Down",
  14: "Left",
  15: "Right",
  16: "Home / Guide",
  // Add more if needed for specific controllers
};

export function getGamepadButtonName(index: number | undefined): string {
  if (index === undefined) {
    return "?";
  }
  // You could potentially add logic here to check gamepadId and use different mappings
  // For now, we'll use the standard mapping or fallback to the index
  return StandardGamepadButtonNames[index] || `Button ${index}`;
}

export const DigitalInputComponent = (props: DigitalInputComponentProps) => {
  const { onChange, data: initialData } = props;
  const [isSelecting, setIsSelecting] = useState(false);
  const [isKeyDown, setIsKeyDown] = useState(false);

  const [data, setData] = useState<DigitalInput | null>(initialData);
  const [gamepads, setGamepads] = useState<Gamepad[] | null>(null);

  useEffect(() => {
    const gamepadHandler = (event: GamepadEvent) => {
      if (event.type === "gamepadconnected") {
        setGamepads((prev) => [...(prev || []), event.gamepad]);
      } else {
        setGamepads(
          (prev) =>
            prev?.filter((gamepad) => gamepad.index !== event.gamepad.index) ||
            null,
        );
      }
    };
    window.addEventListener("gamepadconnected", gamepadHandler);
    window.addEventListener("gamepaddisconnected", gamepadHandler);

    return () => {
      window.removeEventListener("gamepadconnected", gamepadHandler);
      window.removeEventListener("gamepaddisconnected", gamepadHandler);
    };
  }, []);

  useEffect(() => {
    const keyPressEvent = (event: KeyboardEvent) => {
      if (
        data &&
        data.type === "keyboard" &&
        event.key.toLowerCase() === data.key?.toLowerCase()
      ) {
        setIsKeyDown(true);
      }

      if (isSelecting) {
        setData({
          type: "keyboard",
          key: event.key,
        });
        setIsSelecting(false);
        onChange({
          type: "keyboard",
          key: event.key,
        });
      }
    };

    const keyUpEvent = (event: KeyboardEvent) => {
      if (
        data &&
        data.type === "keyboard" &&
        event.key.toLowerCase() === data.key?.toLowerCase()
      ) {
        setIsKeyDown(false);
      }
    };

    const gamePadInterval = setInterval(() => {
      // Get the current state of all gamepads
      const currentFrameGamepads = navigator.getGamepads();

      // Filter out null entries and iterate
      Array.from(currentFrameGamepads)
        .filter((gp) => gp !== null)
        .forEach((gamepad) => {
          if (!gamepad) return; // Should be filtered, but belts and suspenders

          gamepad.buttons.forEach((button, index) => {
            if (button.pressed) {
              if (
                data &&
                data.type === "gamepad" &&
                gamepad.id === data.gamepadId &&
                index === data.gamepadButtonIndex
              ) {
                setIsKeyDown(true);
              }

              if (isSelecting) {
                setData({
                  type: "gamepad",
                  gamepadButton: getGamepadButtonName(index),
                  gamepadButtonIndex: index,
                  gamepadId: gamepad.id,
                });
                onChange({
                  type: "gamepad",
                  gamepadButton: getGamepadButtonName(index),
                  gamepadButtonIndex: index,
                  gamepadId: gamepad.id,
                });
                setIsSelecting(false);
              }
            } else {
              // Check for button release explicitly
              if (
                data &&
                data.type === "gamepad" &&
                gamepad.id === data.gamepadId &&
                index === data.gamepadButtonIndex
              ) {
                setIsKeyDown(false);
              }
            }
          });
        });
    }, 50); // Reduced interval to 50ms for better responsiveness

    window.addEventListener("keydown", keyPressEvent);
    window.addEventListener("keyup", keyUpEvent);

    return () => {
      window.removeEventListener("keydown", keyPressEvent);
      window.removeEventListener("keyup", keyUpEvent);
      clearInterval(gamePadInterval);
    };
  }, [isSelecting, gamepads, data, onChange]);

  const handleSelecting = () => {
    setIsSelecting(true);
  };

  return (
    <div style={{ width: "10rem" }}>
      <span
        data-active={isKeyDown}
        className="bg-black/10 p-[5%] w-full rounded-[var(--radius)] border-[0.2rem] border-black/10 flex justify-center items-center select-none hover:bg-black/20 hover:scale-110 hover:cursor-pointer data-[active=true]:bg-green-600/20 data-[active=true]:scale-110 transition-all duration-100"
        onClick={handleSelecting}
      >
        {isSelecting ? (
          "press"
        ) : data ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-evenly",
              width: "100%",
            }}
          >
            {data.type === "keyboard" ? (
              <>
                <KeyboardIcon />
                {data.key?.toUpperCase()} {/* Display key in uppercase */}
              </>
            ) : (
              <>
                <GamepadIcon />
                {getGamepadButtonName(data.gamepadButtonIndex)}{" "}
                {/* Use the helper function */}
              </>
            )}
          </div>
        ) : (
          "<input>"
        )}
      </span>
    </div>
  );
};
