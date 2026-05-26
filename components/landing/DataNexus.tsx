"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useTheme } from "next-themes";

/** Thin-line 3D wireframe contour “coin” — stacked horizontal slices + meridians. */
export default function DataNexus() {
  const groupRef = useRef<THREE.Group>(null);
  const { resolvedTheme } = useTheme();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const isDark = resolvedTheme === "dark";
  const lineColor = isDark ? "#9eb6cc" : "#0f2336";
  const opacity = isDark ? 0.45 : 0.72;

  const wireframe = useMemo(() => {
    const mat = new THREE.LineBasicMaterial({
      color: lineColor,
      transparent: true,
      opacity,
    });

    const objects: THREE.Line[] = [];
    const layers = 52;
    const ringSegments = 88;
    const yScale = 0.82;
    const rScale = 1.32;

    for (let i = 0; i <= layers; i++) {
      const t = i / layers;
      const y = (t - 0.5) * 2 * yScale;
      const r = Math.sqrt(Math.max(0, 1 - (y / yScale) ** 2)) * rScale;
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j <= ringSegments; j++) {
        const a = (j / ringSegments) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      objects.push(new THREE.LineLoop(geo, mat));
    }

    return objects;
  }, [lineColor, opacity]);

  useFrame((state) => {
    if (!groupRef.current || reduceMotion) return;
    const t = state.clock.getElapsedTime();
    groupRef.current.rotation.y = t * 0.12;
    groupRef.current.rotation.x = Math.sin(t * 0.08) * 0.08;
    const mx = state.mouse.x * 0.35;
    const my = state.mouse.y * 0.22;
    groupRef.current.rotation.y += 0.04 * (mx - groupRef.current.rotation.y * 0.25);
    groupRef.current.rotation.x += 0.04 * (my * 0.15 - groupRef.current.rotation.x);
  });

  return (
    <group ref={groupRef}>
      {wireframe.map((obj, i) => (
        <primitive key={i} object={obj} />
      ))}
    </group>
  );
}
