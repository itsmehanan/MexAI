// Shared by the sandboxed island and the main chat. Audio stays in memory.
(() => {
  const MAX_BYTES = 4 * 1024 * 1024;
  function createVoiceRecorder({ transcribe, onState, onResult, onError }) {
    let phase = 'idle', stream, recorder, timer, chunks = [], bytes = 0, tooLarge = false, generation = 0, controller;
    function setState(next) { phase = next; onState(next); }
    function release() { clearTimeout(timer); if (stream) stream.getTracks().forEach(track => track.stop()); stream = undefined; }
    function fail(message) { release(); setState('idle'); onError(message); }
    async function start() {
      if (phase !== 'idle') return;
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { onError('Microphone recording is not available.'); return; }
      const token = ++generation;
      setState('requesting');
      try {
        const acquired = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (token !== generation) { acquired.getTracks().forEach(track => track.stop()); return; }
        stream = acquired;
        const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        chunks = []; bytes = 0; tooLarge = false;
        recorder.ondataavailable = event => {
          if (token !== generation || !event.data?.size) return;
          bytes += event.data.size;
          if (bytes > MAX_BYTES) { tooLarge = true; if (recorder.state !== 'inactive') recorder.stop(); }
          else chunks.push(event.data);
        };
        recorder.onerror = () => { if (token === generation) { generation++; if (recorder.state !== 'inactive') recorder.stop(); fail('Microphone recording failed.'); } };
        recorder.onstop = async () => {
          if (token !== generation) return;
          release();
          if (tooLarge) { fail('Recording exceeded the 4 MB limit.'); return; }
          const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
          chunks = [];
          if (!blob.size) { fail('No audio was recorded.'); return; }
          controller = new AbortController();
          setState('transcribing');
          try {
            const text = await transcribe(blob, controller.signal);
            if (token !== generation) return;
            if (!text?.trim()) throw new Error('No speech was detected.');
            setState('idle'); onResult(text.trim());
          } catch (error) { if (token === generation) fail(error?.message || 'Transcription failed.'); }
        };
        recorder.start(1000);
        setState('recording');
        timer = setTimeout(() => { if (token === generation && recorder.state !== 'inactive') recorder.stop(); }, 60_000);
      } catch (error) {
        if (token === generation) fail(error?.name === 'NotAllowedError' ? 'Microphone permission was denied.' : 'Could not start microphone recording.');
      }
    }
    function stop() { if (phase === 'recording' && recorder?.state !== 'inactive') recorder.stop(); }
    function dispose() {
      generation++; controller?.abort();
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      release(); chunks = []; phase = 'idle';
    }
    return { start, stop, dispose, getState: () => phase };
  }
  globalThis.MexVoice = { createVoiceRecorder };
})();
