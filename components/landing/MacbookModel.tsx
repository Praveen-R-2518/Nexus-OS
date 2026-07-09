"use client";

import { useEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Group, Mesh, Object3D } from "three";
import {
  computeDashboardReveal,
  computeLidOpen,
  computeMacbookRotationX,
  computeMacbookRotationY,
  computeMacbookScale,
  computeMacbookY,
  computeMacbookZ,
  computeProductView,
} from "@/lib/landing/scrollPhases";
import { drawDashboardTexture } from "@/lib/landing/drawDashboardTexture";

// "MacBook Pro 14-inch M5" (sketchfab.com/3d-models/652a992f4f244122ae251f9cbb81da1e),
// Sketchfab Standard license — see public/models/ATTRIBUTION.md.
export const MACBOOK_MODEL_PATH = "/models/macbook-m5.glb";

useGLTF.preload(MACBOOK_MODEL_PATH);

// Node names inside the GLB are Sketchfab-obfuscated but stable.
// Identified via scene-graph inspection (scripts kept out of repo):
const LID_NODE = "RcexTyyhpuJYATQ"; // whole display assembly, modeled open ~113°
// The display panel material is the only one with an emissive texture —
// matched structurally rather than by obfuscated name.

// Hinge line in the model scene's own coordinates (meters, +z = front).
// y sits at deck-top + half lid thickness so the closed lid rests ON the
// deck instead of rotating into the body.
const HINGE_POINT = new THREE.Vector3(0, 0.0055, -0.1075);
// Rotating the lid pivot +x by this closes the modeled-open lid flat.
const LID_CLOSED_RAD = 1.97;
// The GLB's baked pose leans the lid ~22.7° past vertical; this pivot angle
// brings the screen to exactly 90° against the deck.
const LID_OPEN_RAD = 0.397;

// The GLB is authored in real-world meters (~0.31 m wide); the scroll
// choreography and camera were tuned for a ~31-unit-wide model.
const MODEL_SCALE = 100;

const SCREEN_OFF = new THREE.Color("#0a0a0c");
const SCREEN_ON = new THREE.Color("#ffffff");

type MacbookModelProps = {
  progress: number;
};

/** Space Black finish: darken bright (silver) surfaces to charcoal while
 *  keeping every baked PBR map; dark parts (keys, bezel) stay untouched.
 *  Reads as metal through rim reflections, boosted via envMapIntensity. */
function toSpaceBlack(material: THREE.MeshStandardMaterial) {
  material.envMapIntensity = 1.4;
  if (material.transparent) return; // glass overlays keep their look
  const hsl = { h: 0, s: 0, l: 0 };
  material.color.getHSL(hsl);
  if (hsl.l > 0.28) {
    material.color.setHSL(hsl.h, Math.min(hsl.s, 0.04), 0.17);
  }
}

export function MacbookModel({ progress }: MacbookModelProps) {
  const groupRef = useRef<Group>(null);
  const lidPivotRef = useRef<Group | null>(null);
  const screenMaterialsRef = useRef<THREE.MeshBasicMaterial[]>([]);
  const { scene } = useGLTF(MACBOOK_MODEL_PATH);

  const modelScene = useMemo(() => scene.clone(true), [scene]);
  const dashboardTexture = useMemo(() => {
    const texture = new THREE.CanvasTexture(drawDashboardTexture());
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    // glTF UV convention: image top at v=0, so no flip on replacement maps.
    texture.flipY = false;
    texture.needsUpdate = true;
    return texture;
  }, []);

  useEffect(() => {
    screenMaterialsRef.current = [];
    lidPivotRef.current = null;

    modelScene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mesh = child as Mesh;
      const mat = mesh.material;

      const materialsList = (Array.isArray(mat) ? mat : [mat]).map((material) => {
        if (!(material instanceof THREE.MeshStandardMaterial)) return material;

        if (material.emissiveMap) {
          // The display: unlit, tone-mapping off, driven by the canvas UI.
          const screen = new THREE.MeshBasicMaterial({
            map: dashboardTexture,
            toneMapped: false,
          });
          screen.color.copy(SCREEN_OFF);
          screenMaterialsRef.current.push(screen);
          return screen;
        }

        const cloned = material.clone();
        toSpaceBlack(cloned);
        return cloned;
      });

      mesh.material = Array.isArray(mat)
        ? materialsList
        : (materialsList[0] as THREE.Material);
    });

    // Rig the lid: the GLB has all transforms baked (identity nodes), so
    // insert a pivot group on the hinge line and re-parent the lid to it.
    const lid = modelScene.getObjectByName(LID_NODE);
    if (lid?.parent) {
      // HINGE_POINT is in modelScene coordinates; convert it to the lid
      // parent's local space using only the chain inside the model (the
      // model also sits inside scaled/translated wrapper groups, so
      // worldToLocal() would resolve against the wrong frame).
      const parentMatrix = new THREE.Matrix4();
      const chain: Object3D[] = [];
      for (let n: Object3D | null = lid.parent; n && n !== modelScene; n = n.parent) {
        chain.unshift(n);
      }
      for (const node of chain) {
        node.updateMatrix();
        parentMatrix.multiply(node.matrix);
      }
      const pivot = new THREE.Group();
      pivot.name = "lid-pivot";
      pivot.position.copy(
        HINGE_POINT.clone().applyMatrix4(parentMatrix.invert()),
      );
      lid.parent.add(pivot);
      pivot.attach(lid);
      pivot.rotation.x = LID_CLOSED_RAD;
      lidPivotRef.current = pivot;
    }
  }, [dashboardTexture, modelScene]);

  const rotationY = computeMacbookRotationY(progress);
  const rotationX = computeMacbookRotationX(progress);
  const scale = computeMacbookScale(progress);
  const y = computeMacbookY(progress);
  const z = computeMacbookZ(progress);
  const lidOpen = computeLidOpen(progress);
  const dashboardReveal = computeDashboardReveal(progress);
  const productView = computeProductView(progress);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.position.set(0, y, z);
      groupRef.current.scale.setScalar(scale);
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y,
        rotationY,
        Math.min(1, delta * 4),
      );
      groupRef.current.rotation.x = THREE.MathUtils.lerp(
        groupRef.current.rotation.x,
        rotationX,
        Math.min(1, delta * 4),
      );
    }

    if (lidPivotRef.current) {
      // Opens slightly shy of vertical, then settles to exactly 90°.
      const openX = THREE.MathUtils.lerp(0.47, LID_OPEN_RAD, productView);
      lidPivotRef.current.rotation.x = THREE.MathUtils.lerp(
        lidPivotRef.current.rotation.x,
        THREE.MathUtils.lerp(LID_CLOSED_RAD, openX, lidOpen),
        Math.min(1, delta * 5),
      );
    }

    for (const material of screenMaterialsRef.current) {
      material.color.lerpColors(SCREEN_OFF, SCREEN_ON, dashboardReveal);
    }
  });

  return (
    <group ref={groupRef} position={[0, -28, 20]}>
      <group scale={MODEL_SCALE}>
        <primitive object={modelScene} />
      </group>
    </group>
  );
}
