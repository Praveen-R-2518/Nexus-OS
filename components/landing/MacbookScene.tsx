"use client";

import { Suspense, useLayoutEffect } from "react";
import type { CSSProperties } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Lightformer,
  PerspectiveCamera,
} from "@react-three/drei";
import {
  MacbookModel,
  MACBOOK_MODEL_PATH,
} from "@/components/landing/MacbookModel";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import {
  computeMacbookPresentation,
  computeProductViewCamera,
} from "@/lib/landing/scrollPhases";

useGLTF.preload(MACBOOK_MODEL_PATH);

const CAMERA_START = new THREE.Vector3(0, 1.2, 38);
const CAMERA_PRESENTATION = new THREE.Vector3(0, 2.2, 36);
// Product shot: camera and look-at share the same y (screen-center height)
// so the view ray is horizontal and perpendicular to the 90°-open screen —
// the display renders as a true parallel rectangle, no keystone.
const CAMERA_PRODUCT = new THREE.Vector3(0, -8.3, 47);
const LOOK_AT_START = new THREE.Vector3(0, -10.6, 20);
const LOOK_AT_PRESENTATION = new THREE.Vector3(0, -10.2, 20);
const LOOK_AT_PRODUCT = new THREE.Vector3(0, -8.3, 19.4);

type MacbookSceneProps = {
  progress: number;
  className?: string;
  style?: CSSProperties;
};

function CameraRig({ progress }: { progress: number }) {
  const camera = useThree((state) => state.camera);

  useLayoutEffect(() => {
    camera.position.copy(CAMERA_START);
    camera.lookAt(LOOK_AT_START);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = 34;
      camera.updateProjectionMatrix();
    }
  }, [camera]);

  useFrame((_, delta) => {
    const presentation = computeMacbookPresentation(progress);
    const productView = computeProductViewCamera(progress);
    const position = CAMERA_START.clone()
      .lerp(CAMERA_PRESENTATION, presentation)
      .lerp(CAMERA_PRODUCT, productView);
    const lookAt = LOOK_AT_START.clone()
      .lerp(LOOK_AT_PRESENTATION, presentation)
      .lerp(LOOK_AT_PRODUCT, productView);
    camera.position.lerp(position, Math.min(1, delta * 4));
    camera.lookAt(lookAt);
    if (camera instanceof THREE.PerspectiveCamera) {
      const targetFov = THREE.MathUtils.lerp(
        34,
        28.5,
        productView,
      );
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, Math.min(1, delta * 4));
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

function SceneContent({ progress }: { progress: number }) {
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 1.2, 38]} fov={34} />
      <CameraRig progress={progress} />
      {/* Product-studio rig: one coherent softbox environment instead of
          stacked point sources. Space Black aluminum reads as metal only via
          the long bright rim reflections from the side strips. */}
      <Environment resolution={256}>
        <Lightformer
          intensity={4}
          rotation-x={Math.PI / 2}
          position={[0, 6, 0]}
          scale={[10, 10, 1]}
        />
        <Lightformer
          intensity={3}
          rotation-y={Math.PI / 2}
          position={[-6, 1, 0]}
          scale={[16, 0.8, 1]}
        />
        <Lightformer
          intensity={3}
          rotation-y={-Math.PI / 2}
          position={[6, 1, 0]}
          scale={[16, 0.8, 1]}
        />
        <Lightformer
          color="#dfe8ff"
          intensity={1.2}
          rotation-y={Math.PI}
          position={[0, 2, 9]}
          scale={[12, 5, 1]}
        />
      </Environment>
      <directionalLight
        position={[4, 10, 6]}
        intensity={0.7}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <MacbookModel progress={progress} />
      <ContactShadows
        position={[0, -13.2, 20]}
        opacity={0.4}
        scale={16}
        blur={2.8}
        far={6}
      />
    </>
  );
}

export function MacbookScene({ progress, className, style }: MacbookSceneProps) {
  return (
    <div className={className} style={style}>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent", width: "100%", height: "100%" }}
      >
        <Suspense fallback={null}>
          <SceneContent progress={progress} />
        </Suspense>
      </Canvas>
    </div>
  );
}
