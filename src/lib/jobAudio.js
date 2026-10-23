import { supabase } from '@/api/supabaseClient';

// No telephone numbers or dialer links enter the audio transport.
export async function createJobAudio(call, userId, onState, remoteAudio) {
  if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) throw new Error('Audio calls are unavailable on this device.');
  const { data, error } = await supabase.functions.invoke('call-ice', { body: { requestId: call.request_id } });
  if (error || !data?.iceServers) throw new Error('Could not prepare a secure audio call.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  let pc;
  try { pc = new RTCPeerConnection({ iceServers: data.iceServers }); }
  catch (error) { stream.getTracks().forEach(t => t.stop()); throw error; }
  let stopped = false;
  const seen = new Set();
  const pendingIce = [];
  let polling = false;
  const send = async (kind, payload) => {
    if (stopped) return;
    const { error } = await supabase.rpc('send_job_call_signal', { p_call: call.id, p_kind: kind, p_payload: payload });
    if (error) throw error;
  };
  const close = () => { if (stopped) return; stopped = true; clearInterval(timer); stream.getTracks().forEach(t => t.stop()); pc.close(); remoteAudio.srcObject = null; };
  stream.getTracks().forEach(track => pc.addTrack(track, stream));
  pc.ontrack = ({ streams }) => { remoteAudio.srcObject = streams[0]; remoteAudio.play().catch(() => onState('Tap Play audio to hear the call.')); };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') onState('Connected');
    if (['failed', 'disconnected'].includes(pc.connectionState)) onState('Connection interrupted. Try calling again.');
  };
  pc.onicecandidate = ({ candidate }) => { if (candidate) void send('ice', candidate.toJSON()).catch(() => onState('Connection interrupted.')); };
  const poll = async () => {
    if (stopped || polling) return;
    polling = true;
    try {
      const { data: signals, error } = await supabase.from('job_call_signals').select('*').eq('call_id', call.id).neq('sender_id', userId).order('created_at').order('id');
      if (error) throw error;
      for (const signal of signals || []) {
        if (stopped || seen.has(signal.id)) continue;
        if (signal.kind === 'ice') {
          if (pc.remoteDescription) await pc.addIceCandidate(signal.payload); else pendingIce.push(signal.payload);
        } else {
          await pc.setRemoteDescription(signal.payload);
          for (const candidate of pendingIce.splice(0)) await pc.addIceCandidate(candidate);
          if (signal.kind === 'offer') {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await send('answer', { type: answer.type, sdp: answer.sdp });
          }
        }
        seen.add(signal.id);
      }
    } catch { if (!stopped) onState('Waiting for connection…'); }
    finally { polling = false; }
  };
  const timer = setInterval(() => void poll(), 1000);
  try {
    if (call.caller_id === userId) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await send('offer', { type: offer.type, sdp: offer.sdp });
    }
    void poll();
    return { close, mute: value => stream.getAudioTracks().forEach(t => { t.enabled = !value; }) };
  } catch (error) { close(); throw error; }
}

export function requestJobCall(requestId) {
  window.dispatchEvent(new CustomEvent('movezw:start-call', { detail: { requestId } }));
}
