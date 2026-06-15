import * as THREE from "three";
import "./styles.css";

const dormRoomPanoramaUrl = new URL("./assets/dorm-room-panorama.png", import.meta.url).href;

const canvas = document.querySelector("#scene");
const hint = document.querySelector("#hint");
const gyroButton = document.querySelector("#gyroButton");
const interactionPrompt = document.querySelector("#interactionPrompt");
const keyboardPromptAction = document.querySelector("#keyboardPromptAction");
const inspectButton = document.querySelector("#inspectButton");
const dialogueBox = document.querySelector("#dialogueBox");
const dialogueSpeaker = document.querySelector("#dialogueSpeaker");
const dialogueText = document.querySelector("#dialogueText");
const dialogueNextButton = document.querySelector("#dialogueNextButton");
const dialogueCloseButton = document.querySelector("#dialogueCloseButton");

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

const panoramaTexture = createDormRoomPanoramaTexture();
const panorama = new THREE.Mesh(
  new THREE.SphereGeometry(500, 96, 64),
  new THREE.MeshBasicMaterial({
    map: panoramaTexture,
    side: THREE.BackSide
  })
);
scene.add(panorama);

const hotspots = [
  createSphericalHotspot({
    id: "whitePillow",
    label: "白色枕頭",
    scriptId: "pillow",
    seenKey: "pillow",
    yawDeg: 123,
    pitchDeg: -34,
    distance: 8,
    radius: 0.85,
    onInspect: inspectHotspot
  }),
  createSphericalHotspot({
    id: "darkPillow",
    label: "深色枕頭",
    scriptId: "pillow",
    seenKey: "pillow",
    yawDeg: 130,
    pitchDeg: -17,
    distance: 8,
    radius: 0.75,
    onInspect: inspectHotspot
  })
];
const hotspotMeshes = hotspots.map((hotspot) => hotspot.mesh);
const centerRaycaster = new THREE.Raycaster();
const screenCenter = new THREE.Vector2(0, 0);
let activeHotspot = null;
const seenTopics = new Set();

const dialogueScripts = {
  pillow: {
    speaker: "宿舍導覽",
    lines: [
      "這是床頭的枕頭區。",
      "這段對話用來測試 360 場景中的物件檢視功能。",
      "按下一句可以前進，按完成會關閉對話。"
    ]
  }
};

const dialogueState = {
  scriptId: null,
  seenKey: null,
  lineIndex: 0,
  open: false
};

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
dialogueNextButton.addEventListener("click", advanceDialogue);
dialogueCloseButton.addEventListener("click", closeDialogue);

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
  if (event.repeat) {
    return;
  }

  if (event.key === "Escape" && dialogueState.open) {
    event.preventDefault();
    closeDialogue();
    return;
  }

  if (dialogueState.open) {
    return;
  }

  if (event.key.toLowerCase() === "f" && activeHotspot) {
    event.preventDefault();
    triggerActiveHotspot();
  }
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

function createSphericalHotspot({ id, label, scriptId, seenKey, yawDeg, pitchDeg, distance, radius, onInspect }) {
  const geometry = new THREE.SphereGeometry(radius, 24, 16);
  const material = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  const yaw = THREE.MathUtils.degToRad(yawDeg);
  const pitch = THREE.MathUtils.degToRad(pitchDeg);
  const position = new THREE.Vector3(0, 0, -distance);

  position.applyEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
  mesh.position.copy(position);
  mesh.userData.hotspotId = id;
  mesh.userData.hotspotLabel = label;
  scene.add(mesh);

  return {
    id,
    label,
    scriptId,
    seenKey,
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
  updateInteractionPrompt();
}

function triggerActiveHotspot() {
  if (!activeHotspot) {
    return;
  }

  activeHotspot.onInspect(activeHotspot);
}

function inspectHotspot(hotspot) {
  console.log(`檢視${hotspot.label}`);
  openDialogue(hotspot.scriptId, hotspot.seenKey);
}

function openDialogue(scriptId, seenKey = null) {
  if (!dialogueScripts[scriptId]) {
    return;
  }

  dialogueState.scriptId = scriptId;
  dialogueState.seenKey = seenKey;
  dialogueState.lineIndex = 0;
  dialogueState.open = true;
  renderDialogue();
  dialogueNextButton.focus({ preventScroll: true });
}

function advanceDialogue() {
  const script = dialogueScripts[dialogueState.scriptId];

  if (!dialogueState.open || !script) {
    return;
  }

  if (dialogueState.lineIndex >= script.lines.length - 1) {
    if (dialogueState.seenKey) {
      seenTopics.add(dialogueState.seenKey);
      updateInteractionPrompt();
    }

    closeDialogue();
    return;
  }

  dialogueState.lineIndex += 1;
  renderDialogue();
}

function closeDialogue() {
  dialogueState.scriptId = null;
  dialogueState.seenKey = null;
  dialogueState.lineIndex = 0;
  dialogueState.open = false;
  dialogueBox.hidden = true;
}

function renderDialogue() {
  const script = dialogueScripts[dialogueState.scriptId];

  if (!dialogueState.open || !script) {
    closeDialogue();
    return;
  }

  dialogueSpeaker.textContent = script.speaker;
  dialogueText.textContent = script.lines[dialogueState.lineIndex];
  dialogueNextButton.textContent = dialogueState.lineIndex === script.lines.length - 1 ? "完成" : "下一句";
  dialogueBox.hidden = false;
}

function updateInteractionPrompt() {
  interactionPrompt.hidden = !activeHotspot;

  if (!activeHotspot) {
    return;
  }

  const action = activeHotspot.seenKey && seenTopics.has(activeHotspot.seenKey) ? "再次檢視" : "檢視";

  keyboardPromptAction.textContent = action;
  inspectButton.textContent = action;
}

function createDormRoomPanoramaTexture() {
  const texture = new THREE.TextureLoader().load(dormRoomPanoramaUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);

  return texture;
}
