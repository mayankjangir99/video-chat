# FriendRoom — Friends Video Chat Starter

A small browser-based video chat starter for friends. It uses:
- **Express** to serve the website
- **Socket.IO** for room membership, chat, and WebRTC signaling
- **WebRTC** for peer-to-peer audio/video
- No accounts or database

## Requirements
- Node.js 20 or newer
- A modern browser (Chrome, Firefox, Edge, Safari)
- Camera/microphone
- HTTPS for any deployed website; `localhost` is allowed for local testing

## Run locally
1. Extract the ZIP.
2. Open a terminal in the `friends-video-chat` folder.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the server:
   ```bash
   npm start
   ```
5. Open `http://localhost:3000`.
6. Enter a display name and click **Join / Create room**.
7. Click **Copy invite link** and send the link to a friend. For local testing, both people must be able to reach the same server; `localhost` on another person's device points to their own device, not yours.

## Deploy
Deploy this Node app to a host that supports persistent Node.js processes and WebSocket/Socket.IO connections (for example, a Node-capable app host). Set the start command to `npm start`, and use the host's HTTPS URL. Do not deploy this as a static-only site.

After deploying:
1. Open the HTTPS URL.
2. Create a room and share its invite link.
3. If the host requires an allowed origin, set `ALLOWED_ORIGIN` to your exact website origin (for example `https://chat.example.com`). Do not use `*` in production.
4. Set `MAX_ROOM_SIZE` if needed (default 6).

## Important networking note
This starter uses Google's public STUN server for connection discovery. STUN alone does not guarantee calls will connect on every network. For reliability, configure a TURN server from a reputable provider and add its `urls`, `username`, and `credential` to `rtcConfig` in `public/app.js`. Keep TURN credentials private and rotate them if exposed.

This is a small mesh WebRTC demo: each participant connects directly to every other participant. Bandwidth and CPU usage grow quickly with group size, so it is intended for small rooms, not large meetings. For larger rooms, use an SFU service such as LiveKit, mediasoup, or a managed video provider.

## Privacy and safety
- No user accounts, database, or persistent chat history are included.
- Room links are bearer links: anyone who gets a link may join until the room is full. Share privately.
- Camera and microphone are requested only after the user presses Join.
- Use the Leave room button to close local media tracks.
- Chat messages are relayed live to people in the room; they are not saved by this starter.
- Do not share personal, financial, or sensitive information in room chat.
- This starter does not include moderation, reporting, age verification, abuse prevention, or end-to-end encrypted chat. Add these before making it public.
- Add rate limiting, origin validation, secure deployment settings, abuse reporting, and clear privacy/terms pages before public launch.
- WebRTC media is encrypted in transit by the WebRTC protocol, but the signaling server coordinates connections and this app does not implement a full independent end-to-end security audit.

## Known limitations
- The room is not password-protected.
- No account or friend list.
- No screen sharing or recording.
- The default public STUN server may not work behind every firewall/NAT.
- The maximum room size defaults to 6 and mesh performance may degrade before that depending on devices/network.
