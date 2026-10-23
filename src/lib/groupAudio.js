import { supabase } from '@/api/supabaseClient';

// Small, admin-hosted audio rooms. Each participant consents once and uses
// one microphone stream across deterministic, audio-only peer connections.
export async function createGroupAudio(room, userId, onState) {
  if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error('Audio is unavailable on this device.');
  const ice = await supabase.functions.invoke('call-ice', { body: { roomId: room.id } });
  if (ice.error || !ice.data?.iceServers) throw new Error('Could not authorize group audio.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  const peers = new Map();
  const seen = new Set();
  let stopped = false;
  let running = false;
  const send = async (recipient, kind, payload) => {
    if (stopped) return;
    const { error } = await supabase.rpc('send_admin_group_signal', { p_room: room.id, p_recipient: recipient, p_kind: kind, p_payload: payload });
    if (error) throw error;
  };
  const removePeer = id => {
    const peer = peers.get(id);
    if (!peer) return;
    peer.pc.close(); peer.audio.srcObject = null; peer.audio.remove(); peers.delete(id);
  };
  const addPeer = async id => {
    const pc = new RTCPeerConnection({ iceServers: ice.data.iceServers });
    const audio = document.createElement('audio');
    audio.autoplay = true; audio.hidden = true; document.body.appendChild(audio);
    const peer = { pc, audio, pending: [] };
    peers.set(id, peer);
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    pc.ontrack = event => { audio.srcObject = event.streams[0]; audio.play().catch(() => onState('Tap Play audio to hear all participants.')); };
    pc.onicecandidate = event => { if (event.candidate) void send(id, 'ice', event.candidate.toJSON()).catch(() => onState('Connection interrupted.')); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'connected') onState('Group audio connected'); if (pc.connectionState === 'failed') onState('A participant could not connect. A TURN relay may be needed.'); };
    if (userId < id) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await send(id, 'offer', { type: offer.type, sdp: offer.sdp });
    }
    return peer;
  };
  const poll = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const members = await supabase.from('admin_call_members').select('user_id,state').eq('room_id', room.id);
      if (members.error) throw members.error;
      const joined = (members.data || []).filter(m => m.state === 'joined').map(m => m.user_id);
      if (!joined.includes(userId) || !joined.includes(room.host_id)) return;
      for (const id of peers.keys()) if (!joined.includes(id)) removePeer(id);
      for (const id of joined) {
        if (stopped) return;
        if (id !== userId && !peers.has(id)) await addPeer(id);
      }
      const signals = await supabase.from('admin_call_signals').select('*').eq('room_id', room.id).eq('recipient_id', userId).order('created_at').order('id');
      if (signals.error) throw signals.error;
      for (const signal of signals.data || []) {
        if (stopped || seen.has(signal.id)) continue;
        const peer = peers.get(signal.sender_id);
        if (!peer) continue;
        if (signal.kind === 'ice') {
          if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(signal.payload); else peer.pending.push(signal.payload);
        } else {
          await peer.pc.setRemoteDescription(signal.payload);
          for (const candidate of peer.pending.splice(0)) await peer.pc.addIceCandidate(candidate);
          if (signal.kind === 'offer') {
            const answer = await peer.pc.createAnswer();
            await peer.pc.setLocalDescription(answer);
            await send(signal.sender_id, 'answer', { type: answer.type, sdp: answer.sdp });
          }
        }
        seen.add(signal.id);
      }
    } catch { if (!stopped) onState('Waiting for group audio connection…'); }
    finally { running = false; }
  };
  const timer = setInterval(() => void poll(), 1000);
  void poll();
  return {
    close() { if (stopped) return; stopped = true; clearInterval(timer); stream.getTracks().forEach(track => track.stop()); for (const id of peers.keys()) removePeer(id); },
    mute(value) { stream.getAudioTracks().forEach(track => { track.enabled = !value; }); },
    play() { for (const peer of peers.values()) void peer.audio.play().catch(() => onState('Audio playback is blocked on this device.')); },
  };
}
