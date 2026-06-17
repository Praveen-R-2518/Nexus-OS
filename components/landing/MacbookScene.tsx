"use client";

import { Suspense, useLayoutEffect } from "react";
import type { CSSProperties } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, PerspectiveCamera } from "@react-three/drei";
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
const CAMERA_PRODUCT = new THREE.Vector3(0, -13.15, 47);
const LOOK_AT_START = new THREE.Vector3(0, -10.6, 20);
const LOOK_AT_PRESENTATION = new THREE.Vector3(0, -10.2, 20);
const LOOK_AT_PRODUCT = new THREE.Vector3(0, -8.7, 20.8);

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
      <ambientLight intensity={0.65} />
      <directionalLight
        position={[6, 12, 14]}
        intensity={2.1}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-8, 6, -6]} intensity={0.7} color="#d8e6ff" />
      <directionalLight position={[0, 4, -10]} intensity={0.5} color="#ffffff" />
      <directionalLight
        position={[-10, 2, 12]}
        intensity={0.85}
        color="#e8edf5"
      />
      <spotLight
        position={[0, 14, 10]}
        angle={0.45}
        penumbra={0.85}
        intensity={0.9}
        castShadow
      />
      <spotLight
        position={[8, 0, 18]}
        angle={0.35}
        penumbra={0.9}
        intensity={0.55}
        color="#ffffff"
      />
      <Environment preset="city" />
      <MacbookModel progress={progress} />
      <ContactShadows
        position={[0, -13.2, 20]}
        opacity={0.55}
        scale={14}
        blur={2.2}
        far={5}
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
