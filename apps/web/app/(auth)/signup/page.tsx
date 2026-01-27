"use client";

import Image from "next/image";

import { useState, useEffect } from "react";
import { RegisterForm } from "@/components/register-form";

export default function SignUpPage() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Calculate mouse position as percentage of window size
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      setMousePosition({ x, y });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  // Calculate parallax effect (subtle movement in opposite direction of mouse)
  const parallaxX = -(mousePosition.x - 0.5) * 20; // 20px max movement
  const parallaxY = -(mousePosition.y - 0.5) * 20;

  return (
    <div className="grid h-[calc(100vh-3rem)] overflow-hidden lg:grid-cols-2">
      <div className="flex flex-col p-4 md:p-8">
        <div className="flex flex-1 items-center justify-center flex-col gap-4">
          <div className="w-full max-w-xs">
            <Image
              src="/icon/ormi.svg"
              className="dark:invert"
              width={500}
              height={500}
              priority
              alt="ORMI Logo Light"
            />
          </div>
          <div className="w-full max-w-xs">
            <RegisterForm />
          </div>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-muted lg:block">
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${parallaxX}px, ${parallaxY}px)`,
            transition: "transform 0.2s ease-out",
          }}
        >
          <Image
            src="/wallpaper/air-sea-ground.jpeg"
            fill
            priority
            alt="RAS Lab Wallpaper"
            className="object-cover object-center scale-110"
            sizes="50vw"
          />
        </div>
      </div>
    </div>
  );
}
