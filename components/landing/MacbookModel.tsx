"use client";

import { useEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Group, Mesh, Object3D } from "three";
import {
  computeDashboardReveal,
  computeLidOpen,
  computeMacbookRise,
  computeMacbookRotationY,
  computeMacbookVisibility,
} from "@/lib/landing/scrollPhases";
import { drawDashboardTexture } from "@/lib/landing/drawDashboardTexture";

export const MACBOOK_MODEL_PATH = "/models/mac-draco.glb";

useGLTF.preload(MACBOOK_MODEL_PATH);

type MacbookModelProps = {
  progress: number;
};

function tintAluminum(material: THREE.Material) {
  if (!(material instanceof THREE.MeshStandardMaterial)) return;
  material.color.set("#3a3a3c");
  material.metalness = 0.88;
  material.roughness = 0.32;
}

export function MacbookModel({ progress }: MacbookModelProps) {
  const groupRef = useRef<Group>(null);
  const screenRef = useRef<Object3D | null>(null);
  const allMaterialsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const screenMaterialsRef = useRef<THREE.MeshStandardMaterial[]>([]);
  const { scene } = useGLTF(MACBOOK_MODEL_PATH);

  const modelScene = useMemo(() => scene.clone(true), [scene]);
  const dashboardTexture = useMemo(() => {
    const texture = new THREE.CanvasTexture(drawDashboardTexture());
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.flipY = true;
    texture.needsUpdate = true;
    return texture;
  }, []);

  useEffect(() => {
    const meshes: Record<string, Object3D> = {};
    allMaterialsRef.current = [];
    screenMaterialsRef.current = [];

    modelScene.traverse((child) => {
      if (child.name) meshes[child.name] = child;
    });

    screenRef.current = meshes.screen ?? null;

    if (meshes.screen) {
      meshes.screen.rotation.x = THREE.MathUtils.degToRad(180);
    }

    modelScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mesh = child as Mesh;
      const mat = mesh.material;
      const materialsList = (Array.isArray(mat) ? mat : [mat]).map((material) =>
        material instanceof THREE.MeshStandardMaterial ? material.clone() : material,
      );

      mesh.material = Array.isArray(mat)
        ? materialsList
        : (materialsList[0] as THREE.Material);

      for (const material of materialsList) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        allMaterialsRef.current.push(material);
        material.transparent = true;
        material.opacity = 0;

        if (material.name === "matte") {
          material.color.set("#ffffff");
          material.metalness = 0;
          material.roughness = 0.28;
          material.map = dashboardTexture;
          material.side = THREE.DoubleSide;
          material.emissive.set("#ffffff");
          material.emissiveMap = dashboardTexture;
          material.emissiveIntensity = 0;
          screenMaterialsRef.current.push(material);
        } else if (material.name === "blackmatte") {
          material.color.set("#050506");
          material.metalness = 0.65;
          material.roughness = 0.5;
          material.emissiveIntensity = 0;
        } else {
          tintAluminum(material);
        }
      }
    });
  }, [dashboardTexture, modelScene]);

  const rise = computeMacbookRise(progress);
  const rotationY = computeMacbookRotationY(progress);
  const visibility = computeMacbookVisibility(progress);
  const lidOpen = computeLidOpen(progress);
  const dashboardReveal = computeDashboardReveal(progress);

  useFrame((_, delta) => {
    if (groupRef.current) {
      const settledScale = THREE.MathUtils.lerp(0.34, 0.43, rise);
      const scale = THREE.MathUtils.lerp(settledScale, 0.34, lidOpen);
      const settledY = THREE.MathUtils.lerp(-28, -13.1, rise);
      const y = THREE.MathUtils.lerp(settledY, -12.2, lidOpen);
      const z = THREE.MathUtils.lerp(18, 20, rise);

      groupRef.current.position.set(0, y, z);
      groupRef.current.scale.setScalar(scale);
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y,
        rotationY,
        Math.min(1, delta * 4),
      );
      groupRef.current.rotation.x = THREE.MathUtils.lerp(
        groupRef.current.rotation.x,
        0,
        Math.min(1, delta * 3),
      );
    }

    if (screenRef.current) {
      const closedX = THREE.MathUtils.degToRad(180);
      const openX = THREE.MathUtils.degToRad(82);
      screenRef.current.rotation.x = THREE.MathUtils.lerp(
        screenRef.current.rotation.x,
        THREE.MathUtils.lerp(closedX, openX, lidOpen),
        Math.min(1, delta * 5),
      );
    }

    for (const material of allMaterialsRef.current) {
      material.opacity = THREE.MathUtils.lerp(
        material.opacity,
        visibility,
        Math.min(1, delta * 6),
      );
    }

    for (const material of screenMaterialsRef.current) {
      material.emissiveIntensity = THREE.MathUtils.lerp(
        material.emissiveIntensity,
        dashboardReveal * 0.9,
        Math.min(1, delta * 5),
      );
      material.color.lerpColors(
        new THREE.Color("#111114"),
        new THREE.Color("#ffffff"),
        dashboardReveal,
      );
    }
  });

  return (
    <group ref={groupRef} position={[0, -28, 20]}>
      <primitive object={modelScene} />
    </group>
  );
}
