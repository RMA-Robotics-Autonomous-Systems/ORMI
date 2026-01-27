"use client";

import { useButtonHolder } from "./button-holder-provider";

export function ButtonHolder() {
  const { items } = useButtonHolder();

  return (
    <div className="flex flex-row space-x-2">
      {Array.from(items.values())
        .sort((a, b) => a.priority - b.priority)
        .map((item, index) => (
          <div key={index}>{item.component}</div>
        ))}
    </div>
  );
}
