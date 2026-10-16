const socket = io("https://video-chat-stxw.onrender.com");
const $ = (id) => document.getElementById(id);

const welcome = $("welcome");
const call = $("call");
const joinForm = $("joinForm");
const displayNameInput = $("displayName");
const roomInput = $("roomInput");
const localVideo = $("localVideo");
const videoGrid = $("videoGrid");
const messages = $("messages");
const connectionStatus = $("connectionStatus");
const connectionDot = $("connectionDot");

let localStream = null;
let currentRoom = null;
let displayName = "Guest";
let selfId = null;
let micOn = true;
let cameraOn = true;
const peers = new Map();
const remoteTiles = new Map();
const pendingIceCandidates = new Map();

const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.relay.metered.ca:80" },
    {
      urls: "turn:global.relay.metered.ca:80",
      username: "c044d3c089d9c2351f4e352f",
      credential: "AjbX5YvPCymsEBBZ",
    },
    {
      urls: "turn:global.relay.metered.ca:80?transport=tcp",
      username: "c044d3c089d9c2351f4e352f",
      credential: "AjbX5YvPCymsEBBZ",
    },
    {
      urls: "turn:global.relay.metered.ca:443",
      username: "c044d3c089d9c2351f4e352f",
      credential: "AjbX5YvPCymsEBBZ",
    },
    {
      urls: "turns:global.relay.metered.ca:443?transport=tcp",
      username: "c044d3c089d9c2351f4e352f",
      credential: "AjbX5YvPCymsEBBZ",
    },
  ],
  iceTransportPolicy: "all",
};

function makeRoomId() {
  return "room_" + crypto.randomUUID().replaceAll("-", "").slice(0, 16);
}

function showToast(text) {
  const toast = $("toast");
  toast.textContent = text;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add("hidden"), 3200);
}

function setStatus(text, connected = false) {
  connectionStatus.textContent = text;
  connectionDot.classList.toggle("good", connected);
}

function addSystemMessage(text) {
  const node = document.createElement("div");
  node.className = "message system";
  node.textContent = text;
  messages.appendChild(node);
  messages.scrollTop = messages.scrollHeight;
}

function addChatMessage(msg) {
  const wrapper = document.createElement("div");
  wrapper.className = "message" + (msg.id === selfId ? " mine" : "");
  const meta = document.createElement("span");
  meta.className = "meta";
  const time = msg.time ? new Date(msg.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  meta.textContent = `${msg.name || "Guest"} · ${time}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = msg.text;
  wrapper.append(meta, bubble);
  messages.appendChild(wrapper);
  messages.scrollTop = messages.scrollHeight;
}

function createRemoteTile(id, name) {
  let video = remoteTiles.get(id);
  if (video) {
    const label = video.parentElement.querySelector(".video-label");
    if (label) label.textContent = name || "Guest";
    return video;
  }
  const tile = document.createElement("div");
  tile.className = "video-tile";
  tile.dataset.peerId = id;
  video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  const label = document.createElement("div");
  label.className = "video-label";
  label.textContent = name || "Guest";
  tile.append(video, label);
  videoGrid.appendChild(tile);
  remoteTiles.set(id, video);
  return video;
}

function removePeer(id) {
  const pc = peers.get(id);
  if (pc) {
    pc.close();
    peers.delete(id);
  }
  pendingIceCandidates.delete(id);
  const video = remoteTiles.get(id);
  if (video) {
    video.srcObject = null;
    video.parentElement?.remove();
    remoteTiles.delete(id);
  }
}

function createPeerConnection(peerId, peerName, shouldOffer) {
  let pc = peers.get(peerId);
  if (pc) return pc;

  pc = new RTCPeerConnection(rtcConfig);
  peers.set(peerId, pc);
  pc.oniceconnectionstatechange = () => {
  console.log("ICE state:", peerId, pc.iceConnectionState);
};

pc.onconnectionstatechange = () => {
  console.log("Peer connection:", peerId, pc.connectionState);
};

pc.onsignalingstatechange = () => {
  console.log("Signaling state:", peerId, pc.signalingState);
};

pc.onicecandidateerror = (event) => {
  console.error("ICE candidate error:", event);
};

  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }

  pc.ontrack = async (event) => {
    console.log("REMOTE TRACK RECEIVED:", event.track.kind);
    const remoteVideo = createRemoteTile(peerId, peerName);
    if (event.streams && event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
      try {
        await remoteVideo.play();
      } catch (err) {
        console.warn("Remote video autoplay was blocked; user may need to interact with the page.", err);
      }
    }
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("webrtc-ice-candidate", { to: peerId, candidate: event.candidate });
    }
  };

  pc.onconnectionstatechange = () => {
    if (["failed", "closed"].includes(pc.connectionState)) {
      // A transient failed connection can sometimes recover; the user can rejoin if needed.
      if (pc.connectionState === "closed") removePeer(peerId);
    }
  };

  if (shouldOffer) {
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer).then(() => offer))
      .then(offer => socket.emit("webrtc-offer", { to: peerId, offer }))
      .catch(err => console.error("Could not create offer:", err));
  }
  return pc;
}

async function joinRoom(roomId, name) {
  try {
    setStatus("Requesting camera…");
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
  } catch (err) {
    const detail = err?.name === "NotAllowedError"
      ? "Camera/microphone permission was denied. Allow access and try again."
      : "Could not access your camera/microphone. Check device settings and try again.";
    showToast(detail);
    setStatus("Camera unavailable");
    return;
  }

  currentRoom = roomId;
  displayName = name;
  $("roomTitle").textContent = roomId;
  $("localLabel").textContent = `${displayName} (you)`;
  welcome.classList.add("hidden");
  call.classList.remove("hidden");
  history.replaceState(null, "", `/?room=${encodeURIComponent(roomId)}`);
  setStatus("Connecting…");

  socket.emit("join-room", { roomId, name: displayName }, async (result) => {
    if (!result?.ok) {
      showToast(result?.error || "Could not join room.");
      await cleanupCall(false);
      return;
    }
    selfId = result.selfId;
    $("roomCount").textContent = result.peers.length + 1;
    setStatus("Connected", true);
    addSystemMessage(`You joined ${roomId}. Share the invite link with friends.`);
    // Existing participants initiate offers to the newcomer, avoiding offer glare.
    result.peers.forEach(peer => createPeerConnection(peer.id, peer.name, false));
  });
}

async function cleanupCall(notifyServer = true) {
  if (notifyServer && currentRoom) socket.emit("leave-room");
  for (const id of [...peers.keys()]) removePeer(id);
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  localVideo.srcObject = null;
  currentRoom = null;
  selfId = null;
  micOn = true;
  cameraOn = true;
  $("toggleMic").innerHTML = "🎙️ <span>Mute</span>";
  $("toggleCamera").innerHTML = "📷 <span>Camera off</span>";
  $("toggleMic").classList.remove("active");
  $("toggleCamera").classList.remove("active");
  call.classList.add("hidden");
  welcome.classList.remove("hidden");
  setStatus("Not connected");
  history.replaceState(null, "", "/");
}

joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = displayNameInput.value.trim().slice(0, 32) || "Guest";
  const roomId = roomInput.value.trim() || new URLSearchParams(location.search).get("room") || makeRoomId();
  if (!/^[a-zA-Z0-9_-]{4,80}$/.test(roomId)) {
    showToast("Room code must be 4–80 letters, numbers, dashes or underscores.");
    return;
  }
  await joinRoom(roomId, name);
});

$("copyInvite").addEventListener("click", async () => {
  if (!currentRoom) return;
  const invite = `${location.origin}/?room=${encodeURIComponent(currentRoom)}`;
  try {
    await navigator.clipboard.writeText(invite);
    showToast("Invite link copied.");
  } catch {
    window.prompt("Copy this invite link:", invite);
  }
});

$("toggleMic").addEventListener("click", () => {
  if (!localStream) return;
  micOn = !micOn;
  localStream.getAudioTracks().forEach(track => track.enabled = micOn);
  $("toggleMic").innerHTML = micOn ? "🎙️ <span>Mute</span>" : "🔇 <span>Unmute</span>";
  $("toggleMic").classList.toggle("active", !micOn);
});

$("toggleCamera").addEventListener("click", () => {
  if (!localStream) return;
  cameraOn = !cameraOn;
  localStream.getVideoTracks().forEach(track => track.enabled = cameraOn);
  $("toggleCamera").innerHTML = cameraOn ? "📷 <span>Camera off</span>" : "🚫 <span>Camera on</span>";
  $("toggleCamera").classList.toggle("active", !cameraOn);
});

$("leaveCall").addEventListener("click", () => cleanupCall(true));

$("chatForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("chatInput");
  const text = input.value.trim().slice(0, 500);
  if (!text || !currentRoom) return;
  socket.emit("chat-message", { text });
  input.value = "";
});

socket.on("connect", () => {
  if (!currentRoom) setStatus("Ready to connect");
});
socket.on("disconnect", () => setStatus("Connection lost"));

socket.on("peer-joined", ({ id, name }) => {
  addSystemMessage(`${name || "A friend"} joined the room.`);
  // New arrival initiates offers to peers already in the room.
  createPeerConnection(id, name, true);
});

socket.on("peer-left", ({ id }) => {
  const name = remoteTiles.get(id)?.parentElement?.querySelector(".video-label")?.textContent || "A friend";
  removePeer(id);
  addSystemMessage(`${name} left the room.`);
});

socket.on("room-count", count => $("roomCount").textContent = count);

socket.on("webrtc-offer", async ({ from, offer }) => {
  try {
    const pc = createPeerConnection(from, "Friend", false);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    await flushPendingIceCandidates(from, pc);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("webrtc-answer", { to: from, answer });
  } catch (err) {
    console.error("Could not process offer:", err);
  }
});

socket.on("webrtc-answer", async ({ from, answer }) => {
  const pc = peers.get(from);
  if (!pc) return;
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
    await flushPendingIceCandidates(from, pc);
  } catch (err) {
    console.error("Could not process answer:", err);
  }
});

socket.on("webrtc-ice-candidate", async ({ from, candidate }) => {
  if (!candidate) return;
  const pc = peers.get(from);
  if (!pc || !pc.remoteDescription || !pc.remoteDescription.type) {
    const queued = pendingIceCandidates.get(from) || [];
    queued.push(candidate);
    pendingIceCandidates.set(from, queued);
    return;
  }
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch (err) {
    console.error("Could not add ICE candidate:", err);
  }
});

async function flushPendingIceCandidates(peerId, pc) {
  const queued = pendingIceCandidates.get(peerId) || [];
  pendingIceCandidates.delete(peerId);
  for (const candidate of queued) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error("Could not add queued ICE candidate:", err);
    }
  }
}

socket.on("chat-message", addChatMessage);

// If the page was opened with an invite link, prefill the room code.
const initialRoom = new URLSearchParams(location.search).get("room");
if (initialRoom) roomInput.value = initialRoom;
