import * as THREE from "three";
import "./styles.css";

const canvas = document.querySelector("#scene");
const hint = document.querySelector("#hint");
const gyroButton = document.querySelector("#gyroButton");
const interactionPrompt = document.querySelector("#interactionPrompt");
const inspectButton = document.querySelector("#inspectButton");
const inspectNotice = document.querySelector("#inspectNotice");

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 0, 0);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance"
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const panoramaTexture = createGrasslandPanoramaTexture();
const panorama = new THREE.Mesh(
  new THREE.SphereGeometry(500, 96, 64),
  new THREE.MeshBasicMaterial({
    map: panoramaTexture,
    side: THREE.BackSide
  })
);
scene.add(panorama);

scene.add(new THREE.HemisphereLight("#fff5d6", "#396b38", 1.6));

const keyLight = new THREE.DirectionalLight("#ffffff", 2.2);
keyLight.position.set(-4, 7, 5);
scene.add(keyLight);

const daylilyPrism = createDaylilyPrismModel();
scene.add(daylilyPrism);

const hotspots = [
  createHotspot({
    id: "daylily",
    label: "金針花",
    parent: daylilyPrism,
    localPosition: new THREE.Vector3(0, 1.65, 0),
    radius: 0.42,
    height: 3.15,
    onInspect: inspectDaylily
  })
];
const hotspotMeshes = hotspots.map((hotspot) => hotspot.mesh);
const centerRaycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);
let activeHotspot = null;
let inspectNoticeTimer = null;

const pointerState = {
  active: false,
  id: null,
  x: 0,
  y: 0
};

const view = {
  yaw: 0,
  pitch: 0,
  targetYaw: 0,
  targetPitch: 0,
  gyroEnabled: false,
  gyroYawOffset: null,
  gyroEuler: new THREE.Euler(0, 0, 0, "YXZ"),
  gyroBase: new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)),
  screenTransform: new THREE.Quaternion(),
  targetQuaternion: new THREE.Quaternion()
};

const pitchLimit = THREE.MathUtils.degToRad(85);
const dragSpeed = 0.004;
const damping = 0.1;

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerUp);
window.addEventListener("resize", onResize);
window.addEventListener("orientationchange", updateScreenTransform);
window.addEventListener("keydown", onKeyDown);
inspectButton.addEventListener("click", triggerActiveHotspot);

setupGyroButton();
updateScreenTransform();
animate();

function onPointerDown(event) {
  pointerState.active = true;
  pointerState.id = event.pointerId;
  pointerState.x = event.clientX;
  pointerState.y = event.clientY;
  canvas.setPointerCapture(event.pointerId);
}

function onPointerMove(event) {
  if (!pointerState.active || event.pointerId !== pointerState.id) {
    return;
  }

  const deltaX = event.clientX - pointerState.x;
  const deltaY = event.clientY - pointerState.y;

  pointerState.x = event.clientX;
  pointerState.y = event.clientY;

  view.gyroEnabled = false;
  view.targetYaw -= deltaX * dragSpeed;
  view.targetPitch = THREE.MathUtils.clamp(view.targetPitch - deltaY * dragSpeed, -pitchLimit, pitchLimit);
}

function onPointerUp(event) {
  if (event.pointerId !== pointerState.id) {
    return;
  }

  pointerState.active = false;
  pointerState.id = null;

  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
}

function onKeyDown(event) {
  if (event.repeat || event.key.toLowerCase() !== "f" || !activeHotspot) {
    return;
  }

  event.preventDefault();
  triggerActiveHotspot();
}

function setupGyroButton() {
  const canUseOrientation = "DeviceOrientationEvent" in window;
  const probablyMobile = window.matchMedia("(hover: none), (pointer: coarse)").matches;

  if (!canUseOrientation || !probablyMobile) {
    return;
  }

  gyroButton.hidden = false;
  gyroButton.addEventListener("click", requestGyro);
}

async function requestGyro() {
  try {
    if (
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof DeviceOrientationEvent.requestPermission === "function"
    ) {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== "granted") {
        showTouchFallback("無法啟用陀螺儀，請使用觸控拖曳觀看四周");
        return;
      }
    }

    window.addEventListener("deviceorientation", onDeviceOrientation, true);
    view.gyroEnabled = true;
    view.gyroYawOffset = null;
    gyroButton.hidden = true;
    hint.textContent = "轉動手機或拖曳觀看四周";
  } catch {
    showTouchFallback("此瀏覽器不支援陀螺儀，請使用觸控拖曳觀看四周");
  }
}

function onDeviceOrientation(event) {
  if (!view.gyroEnabled || event.alpha === null || event.beta === null || event.gamma === null) {
    return;
  }

  const alpha = THREE.MathUtils.degToRad(event.alpha);
  const beta = THREE.MathUtils.degToRad(event.beta);
  const gamma = THREE.MathUtils.degToRad(event.gamma);

  view.gyroEuler.set(beta, alpha, -gamma, "YXZ");
  view.targetQuaternion.setFromEuler(view.gyroEuler);
  view.targetQuaternion.multiply(view.gyroBase);
  view.targetQuaternion.multiply(view.screenTransform);

  const gyroDirection = new THREE.Euler().setFromQuaternion(view.targetQuaternion, "YXZ");
  if (view.gyroYawOffset === null) {
    view.gyroYawOffset = view.yaw - gyroDirection.y;
  }

  view.targetYaw = gyroDirection.y + view.gyroYawOffset;
  view.targetPitch = THREE.MathUtils.clamp(gyroDirection.x, -pitchLimit, pitchLimit);
}

function showTouchFallback(message) {
  view.gyroEnabled = false;
  hint.textContent = message;
  gyroButton.hidden = true;
}

function updateScreenTransform() {
  const orientation = THREE.MathUtils.degToRad(window.screen.orientation?.angle ?? window.orientation ?? 0);
  view.screenTransform.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -orientation);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  view.yaw += shortestAngleDelta(view.yaw, view.targetYaw) * damping;
  view.pitch += (view.targetPitch - view.pitch) * damping;

  camera.rotation.order = "YXZ";
  camera.rotation.y = view.yaw;
  camera.rotation.x = view.pitch;
  camera.rotation.z = 0;

  updateHotspotTarget();
  renderer.render(scene, camera);
}

function shortestAngleDelta(current, target) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

function createHotspot({ id, label, parent, localPosition, radius, height, onInspect }) {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, 18);
  const material = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.copy(localPosition);
  mesh.userData.hotspotId = id;
  mesh.userData.hotspotLabel = label;
  parent.add(mesh);

  return {
    id,
    label,
    mesh,
    onInspect
  };
}

function updateHotspotTarget() {
  centerRaycaster.setFromCamera(screenCenter, camera);
  centerRaycaster.near = 0.1;
  centerRaycaster.far = 14;

  const hit = centerRaycaster.intersectObjects(hotspotMeshes, false)[0];
  const nextHotspot = hit ? hotspots.find((hotspot) => hotspot.mesh === hit.object) : null;

  if (activeHotspot === nextHotspot) {
    return;
  }

  activeHotspot = nextHotspot;
  interactionPrompt.hidden = !activeHotspot;
}

function triggerActiveHotspot() {
  if (!activeHotspot) {
    return;
  }

  activeHotspot.onInspect(activeHotspot);
}

function inspectDaylily(hotspot) {
  console.log(`檢視${hotspot.label}`);
  showInspectNotice(`已觸發：檢視${hotspot.label}`);
}

function showInspectNotice(message) {
  inspectNotice.textContent = message;
  inspectNotice.hidden = false;

  window.clearTimeout(inspectNoticeTimer);
  inspectNoticeTimer = window.setTimeout(() => {
    inspectNotice.hidden = true;
  }, 1800);
}

function createDaylilyPrismModel() {
  const flowerLength = 3.6;
  const flowerWidth = 0.32;
  const flowerDepth = 0.26;
  const geometry = new THREE.BoxGeometry(flowerWidth, flowerLength, flowerDepth);
  geometry.translate(0, flowerLength / 2, 0);

  const material = new THREE.MeshStandardMaterial({
    color: "#f4a51c",
    roughness: 0.72,
    metalness: 0.02
  });

  const prism = new THREE.Mesh(geometry, material);
  prism.castShadow = false;
  prism.receiveShadow = false;

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({
      color: "#704210",
      transparent: true,
      opacity: 0.72
    })
  );

  const model = new THREE.Group();
  model.add(prism);
  model.add(edges);
  model.position.set(0.12, -1.62, -7.2);
  model.rotation.set(THREE.MathUtils.degToRad(4), 0, THREE.MathUtils.degToRad(-10));

  return model;
}

function createGrasslandPanoramaTexture() {
  const width = 2048;
  const height = 1024;
  const horizon = height * 0.54;
  const canvasTexture = document.createElement("canvas");
  const context = canvasTexture.getContext("2d");

  canvasTexture.width = width;
  canvasTexture.height = height;

  drawSky(context, width, height, horizon);
  drawClouds(context, width, horizon);
  drawDistantHills(context, width, height, horizon);
  drawGrass(context, width, height, horizon);

  const texture = new THREE.CanvasTexture(canvasTexture);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  texture.needsUpdate = true;

  return texture;
}

function drawSky(context, width, height, horizon) {
  const sky = context.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#69aeea");
  sky.addColorStop(0.46, "#9fd2f4");
  sky.addColorStop(1, "#d8f0ff");
  context.fillStyle = sky;
  context.fillRect(0, 0, width, horizon);
}

function drawClouds(context, width, horizon) {
  const clouds = [
    { x: 160, y: 170, scale: 1.1 },
    { x: 550, y: 125, scale: 0.82 },
    { x: 980, y: 220, scale: 1.25 },
    { x: 1390, y: 150, scale: 0.9 },
    { x: 1790, y: 245, scale: 1.05 },
    { x: -120, y: 245, scale: 1.05 }
  ];

  context.save();
  context.globalAlpha = 0.78;

  for (const cloud of clouds) {
    const radius = 48 * cloud.scale;
    const y = Math.min(cloud.y, horizon - 120);

    context.fillStyle = "rgba(255, 255, 255, 0.88)";
    drawCloudBlob(context, cloud.x, y, radius);

    if (cloud.x < 0) {
      drawCloudBlob(context, cloud.x + width, y, radius);
    }
  }

  context.restore();
}

function drawCloudBlob(context, x, y, radius) {
  context.beginPath();
  context.ellipse(x, y + radius * 0.15, radius * 1.7, radius * 0.62, 0, 0, Math.PI * 2);
  context.ellipse(x - radius * 0.72, y + radius * 0.2, radius * 0.95, radius * 0.48, 0, 0, Math.PI * 2);
  context.ellipse(x + radius * 0.78, y + radius * 0.16, radius, radius * 0.5, 0, 0, Math.PI * 2);
  context.ellipse(x - radius * 0.18, y - radius * 0.16, radius * 0.88, radius * 0.68, 0, 0, Math.PI * 2);
  context.fill();
}

function drawDistantHills(context, width, height, horizon) {
  const hill = context.createLinearGradient(0, horizon - 72, 0, horizon + 82);
  hill.addColorStop(0, "#81b86c");
  hill.addColorStop(1, "#4d8a4a");

  context.fillStyle = hill;
  context.beginPath();
  context.moveTo(0, height);

  for (let x = 0; x <= width; x += 16) {
    const angle = (x / width) * Math.PI * 2;
    const wave = Math.sin(angle * 2) * 34 + Math.sin(angle * 5 + 1.2) * 20;
    context.lineTo(x, horizon - 36 + wave);
  }

  context.lineTo(width, height);
  context.closePath();
  context.fill();
}

function drawGrass(context, width, height, horizon) {
  const grass = context.createLinearGradient(0, horizon, 0, height);
  grass.addColorStop(0, "#63a957");
  grass.addColorStop(0.48, "#3f8b40");
  grass.addColorStop(1, "#1f5f2d");
  context.fillStyle = grass;
  context.fillRect(0, horizon, width, height - horizon);

  context.save();
  context.globalAlpha = 0.28;

  for (let i = 0; i < 900; i += 1) {
    const x = seededRandom(i) * width;
    const depth = seededRandom(i + 17);
    const y = horizon + depth * depth * (height - horizon);
    const bladeHeight = 5 + depth * 24;
    const sway = (seededRandom(i + 31) - 0.5) * 8;

    context.strokeStyle = depth > 0.65 ? "#9fd06a" : "#4f9d47";
    context.lineWidth = depth > 0.72 ? 1.6 : 1;
    context.beginPath();
    context.moveTo(x, y);
    context.quadraticCurveTo(x + sway, y - bladeHeight * 0.6, x + sway * 0.42, y - bladeHeight);
    context.stroke();
  }

  context.restore();
}

function seededRandom(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}
