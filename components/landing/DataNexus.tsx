"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Sphere, MeshDistortMaterial } from "@react-three/drei";
import { useTheme } from "next-themes";
import * as THREE from "three";

const MESH_LIGHT = {
  color: "#1E3667",
  opacity: 0.25,
  metalness: 0.35,
  roughness: 0.35,
} as const;

const MESH_DARK = {
  color: "#5B9FE8",
  opacity: 0.42,
  metalness: 0.55,
  roughness: 0.25,
} as const;

export default function DataNexus() {
  const meshRef = useRef<THREE.Mesh>(null);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = !mounted || resolvedTheme === "dark";
  const mat = isDark ? MESH_DARK : MESH_LIGHT;

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.getElapsedTime() * 0.1;
      meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.15;

      const targetX = (state.mouse.x * Math.PI) / 10;
      const targetY = (state.mouse.y * Math.PI) / 10;

      meshRef.current.rotation.y += 0.05 * (targetX - meshRef.current.rotation.y);
      meshRef.current.rotation.x += 0.05 * (targetY - meshRef.current.rotation.x);
    }
  });

  return (
    <Sphere ref={meshRef} args={[1.5, 64, 64]} scale={1.5}>
      <MeshDistortMaterial
        key={isDark ? "dark" : "light"}
        color={mat.color}
        attach="material"
        distort={0.4}
        speed={1.5}
        roughness={mat.roughness}
        metalness={mat.metalness}
        wireframe
        transparent
        opacity={mat.opacity}
      />
    </Sphere>
  );
}
