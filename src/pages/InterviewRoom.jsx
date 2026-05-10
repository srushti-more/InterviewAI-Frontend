import { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import roomBg from './assets/image_8.png';
import logo from './assets/image_7.png';

export default function InterviewRoom() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const initialAiMessage = location.state?.aiFeedback 
    || "Hello! I have reviewed your resume. I will be your interviewer today. Let's begin with your first question.";

  const targetRole = location.state?.jobRole || "Software Engineer";

  const [isRecording, setIsRecording] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [hasStarted, setHasStarted] = useState(false); 
  const [questionCount, setQuestionCount] = useState(1);
  const MAX_QUESTIONS = 8; 
  
  const [transcript, setTranscript] = useState([
    { speaker: 'AI', text: initialAiMessage }
  ]);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const playAiVoice = (textToSpeak, onComplete = null) => {
    setIsAiSpeaking(true);
    
    if (!('speechSynthesis' in window)) {
      console.error("Browser doesn't support text-to-speech!");
      setIsAiSpeaking(false);
      if (onComplete) onComplete();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.lang.includes('en') && v.name.includes('Female')) || voices[0];
    if (preferredVoice) utterance.voice = preferredVoice;
    
    utterance.rate = 1.0; 
    utterance.pitch = 1.0;
    utterance.onend = () => { setIsAiSpeaking(false); if (onComplete) onComplete(); };
    utterance.onerror = (e) => { console.error("Speech error:", e); setIsAiSpeaking(false); if (onComplete) onComplete(); };

    window.speechSynthesis.speak(utterance);
  };

  const beginInterviewSession = () => {
    setHasStarted(true);
    playAiVoice(initialAiMessage);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');

        try {
          const token = localStorage.getItem('token');
          const response = await fetch(`${import.meta.env.VITE_API_URL}/api/process-audio`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
          });

          const data = await response.json();

          if (response.ok) {
            setTranscript(prev => {
              const updatedTranscript = [...prev];
              updatedTranscript[updatedTranscript.length - 1] = { speaker: 'Candidate', text: data.candidateTranscript };
              updatedTranscript.push({ speaker: 'AI', text: data.aiResponse });
              return updatedTranscript;
            });
            
            if (questionCount >= MAX_QUESTIONS) {
              const closingMessage = "Thank you for your time today. We have collected all your answers, and we will get back to you soon with the results.";
              setTranscript(prev => [...prev, { speaker: 'AI', text: closingMessage }]);
              playAiVoice(closingMessage, () => handleEndInterview());
            } else {
              setQuestionCount(prev => prev + 1);
              playAiVoice(data.spokenQuestion); 
            }
          } else throw new Error(data.error);
        } catch (error) {
          console.error("Error uploading audio to backend:", error);
          setTranscript(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { speaker: 'System', text: `Error: ${error.message}` };
            return updated;
          });
          setIsAiSpeaking(false);
        }
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access denied or failed:", err);
      alert("Please allow microphone access to use the interview room.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop(); 
      setIsRecording(false);
      setIsAiSpeaking(true); 
      setTranscript(prev => [...prev, { speaker: 'Candidate', text: '[Processing audio...]' }]);
    }
  };

  const toggleRecording = () => isRecording ? stopRecording() : startRecording();

  const handleEndInterview = async () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    
    setIsAiSpeaking(true); 
    setTranscript(prev => [...prev, { speaker: 'System', text: 'Compiling interview data and generating strict feedback report. Please wait...' }]);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/analyze-interview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ transcript: transcript })
      });

      const analysisData = await response.json();
      if (response.ok) navigate(`/feedback/${analysisData._id}`, { state: { analysisData } });
      else throw new Error(analysisData.error);
    } catch (error) {
      console.error("Error analyzing interview:", error);
      alert("Failed to generate feedback. See console.");
      setIsAiSpeaking(false);
    }
  };

  return (
    // FIX 1: Removed h-screen and overflow-hidden to allow native mobile scrolling.
    <div className="min-h-screen flex flex-col font-sans relative bg-slate-950 selection:bg-indigo-500/30 text-slate-50">
      
      <div 
        className={`fixed inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-40 mix-blend-luminosity transition-all duration-1000 ${hasStarted ? 'blur-sm scale-105' : 'blur-none scale-100'}`} 
        style={{ backgroundImage: `url(${roomBg})` }}
      ></div>
      <div className="fixed inset-0 z-0 bg-gradient-to-t from-slate-950/95 via-slate-900/70 to-slate-950/80 backdrop-blur-[2px] pointer-events-none"></div>

      <div className="flex flex-col sm:flex-row justify-between items-center bg-slate-900/60 backdrop-blur-xl px-4 py-3 sm:px-6 sm:py-4 border-b border-slate-800/80 z-30 relative shrink-0 shadow-lg">
        <div className="flex items-center space-x-3 w-full sm:w-auto justify-between sm:justify-start">
          <div className="flex items-center space-x-2">
            <img src={logo} alt="InterviewPro Logo" className="w-6 h-6 sm:w-8 sm:h-8 drop-shadow-md" />
            <span className="font-bold sm:hidden">InterviewPro</span>
          </div>
          
          <div className="flex items-center space-x-2 bg-slate-950/60 px-3 py-1 sm:px-4 sm:py-1.5 rounded-full border border-slate-700/80 shadow-inner">
            <div className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full shadow-[0_0_8px_currentColor] ${
              hasStarted && !isAiSpeaking && !isRecording ? 'bg-indigo-500 text-indigo-500 animate-pulse' : 
              isRecording ? 'bg-rose-500 text-rose-500 animate-pulse' : 
              isAiSpeaking ? 'bg-cyan-500 text-cyan-500' : 'bg-slate-500 text-slate-500'
            }`}></div>
            <span className="text-slate-300 font-medium text-[10px] sm:text-sm tracking-wide">
              {hasStarted ? `Q${questionCount}/${MAX_QUESTIONS}` : 'Standby'}
            </span>
          </div>
        </div>
        <div className="text-slate-400 font-medium text-xs sm:text-sm px-4 py-1.5 rounded-full bg-slate-800/40 border border-slate-700/50 hidden sm:flex items-center gap-2 max-w-[200px] sm:max-w-[350px]" title={targetRole}>
          <span className="whitespace-nowrap">Target Role:</span> 
          <strong className="text-slate-200 truncate">{targetRole}</strong>
        </div>
      </div>

      {/* FIX 2: Ensure flex-col for mobile, flex-row for lg screens */}
      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 p-4 sm:p-6 lg:p-8 flex-grow relative z-20">
        
        {/* Left Column: Video Feed */}
        <div className={`flex-1 bg-slate-900/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl sm:rounded-3xl flex flex-col items-center justify-center p-4 sm:p-10 relative shadow-xl ${hasStarted ? 'min-h-[400px] lg:min-h-0' : 'min-h-[60vh]'} lg:h-[calc(100vh-8rem)]`}>
          
          {!hasStarted && (
            <div className="absolute inset-0 z-40 bg-slate-950/80 flex flex-col items-center justify-center backdrop-blur-xl rounded-2xl sm:rounded-3xl p-6 text-center border border-slate-800/50">
              <div className="w-16 h-16 sm:w-24 sm:h-24 mb-6 sm:mb-8 bg-indigo-500/10 border border-indigo-500/20 rounded-xl sm:rounded-2xl flex items-center justify-center">
                <svg className="w-8 h-8 sm:w-12 sm:h-12 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
              </div>
              <h2 className="text-slate-50 text-xl sm:text-3xl font-bold mb-2 sm:mb-3">Audio Calibrated.</h2>
              <p className="text-slate-400 text-xs sm:text-base mb-8 max-w-sm">Ensure you are in a quiet environment before initiating the interview sequence.</p>
              <button 
                onClick={beginInterviewSession}
                className="px-6 sm:px-12 py-3 sm:py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm sm:text-lg transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)] w-full sm:w-auto"
              >
                Initialize Session
              </button>
            </div>
          )}

          {hasStarted && (
            <div className="absolute top-4 right-4 sm:top-6 sm:right-6 w-24 sm:w-48 aspect-video bg-slate-950/80 backdrop-blur-md rounded-xl sm:rounded-2xl border border-slate-700 shadow-xl flex flex-col items-center justify-center overflow-hidden z-20">
              <div className={`absolute inset-0 border-2 rounded-xl sm:rounded-2xl transition-opacity ${isRecording ? 'border-rose-500 opacity-100' : 'opacity-0'}`}></div>
              <div className="w-6 h-6 sm:w-12 sm:h-12 bg-slate-800 rounded-full flex items-center justify-center mb-1 sm:mb-2">
                <svg className="w-3 h-3 sm:w-6 sm:h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
              </div>
              <div className="absolute bottom-1 sm:bottom-3 left-2 sm:left-3 flex items-center space-x-1 sm:space-x-2 bg-slate-900/80 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded">
                <div className={`w-1 h-1 sm:w-2 sm:h-2 rounded-full ${isRecording ? 'bg-rose-500 animate-pulse' : 'bg-slate-500'}`}></div>
                <span className="text-[8px] sm:text-[10px] text-slate-200 font-medium uppercase tracking-wider">You</span>
              </div>
            </div>
          )}

          <div className="relative w-40 h-40 sm:w-72 sm:h-72 flex items-center justify-center mt-2 sm:mt-0 lg:mb-12">
            <div className={`absolute inset-0 rounded-full transition-all duration-700 ease-out blur-xl sm:blur-3xl ${
              isRecording ? 'bg-rose-500/20 scale-110' : 
              isAiSpeaking ? 'bg-cyan-500/20 scale-110 animate-pulse' : 
              'bg-indigo-500/10'
            }`}></div>
            
            <div className={`absolute inset-2 sm:inset-4 rounded-full border border-dashed transition-all duration-1000 ${
               isRecording ? 'border-rose-500/30 animate-[spin_8s_linear_infinite]' : 
               isAiSpeaking ? 'border-cyan-500/40 animate-[spin_4s_linear_infinite]' : 
               'border-slate-700/50 animate-[spin_20s_linear_infinite]'
            }`}></div>

            <div className={`relative w-24 h-24 sm:w-44 sm:h-44 rounded-full flex items-center justify-center transition-all duration-300 z-10 border bg-slate-950 shadow-xl ${
               isRecording ? 'border-rose-500/50' : 
               isAiSpeaking ? 'border-cyan-500/60' : 
               'border-slate-800'
            }`}>
              <div className={`w-12 h-12 sm:w-24 sm:h-24 rounded-full blur-lg transition-all duration-300 absolute ${
                isRecording ? 'bg-rose-500/40 animate-pulse' : 
                isAiSpeaking ? 'bg-cyan-500/40 animate-ping' : 'bg-transparent'
              }`}></div>
              <span className="text-slate-200 text-[10px] sm:text-sm font-semibold tracking-widest sm:tracking-[0.2em] relative z-20 uppercase">
                {isRecording ? 'Listening' : isAiSpeaking ? 'AI Active' : 'Standby'}
              </span>
            </div>
          </div>

          <div className="absolute bottom-4 sm:bottom-10 flex flex-row gap-2 sm:gap-4 z-30 w-full justify-center px-4 sm:px-10">
            <button 
              onClick={toggleRecording}
              disabled={isAiSpeaking || !hasStarted}
              className={`flex-1 max-w-[160px] sm:max-w-[240px] py-2.5 sm:py-4 rounded-lg sm:rounded-xl font-medium transition-all flex items-center justify-center space-x-2 sm:space-x-3 text-xs sm:text-base border ${
                isRecording 
                  ? 'bg-rose-500/10 border-rose-500/50 text-rose-300' : 
                isAiSpeaking || !hasStarted 
                  ? 'bg-slate-900/50 text-slate-600 border-slate-800 cursor-not-allowed' : 
                'bg-indigo-500/10 border-indigo-500/40 text-indigo-300'
              }`}
            >
              <div className={`w-1.5 h-1.5 sm:w-2.5 sm:h-2.5 rounded-full ${isRecording ? 'bg-rose-400 animate-pulse' : isAiSpeaking || !hasStarted ? 'bg-slate-700' : 'bg-indigo-400'}`}></div>
              <span>{isRecording ? 'Stop' : 'Speak'}</span>
            </button>
            
            <button 
              onClick={handleEndInterview}
              disabled={!hasStarted}
              className={`flex-1 max-w-[120px] sm:max-w-[240px] py-2.5 sm:py-4 rounded-lg sm:rounded-xl font-medium transition-all text-xs sm:text-base border ${
                !hasStarted 
                  ? 'bg-slate-900/50 text-slate-600 border-slate-800 cursor-not-allowed' 
                  : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              End
            </button>
          </div>
        </div>

        {/* Right Column: Diagnostics */}
        {/* FIX 3: Removed strict fixed height to allow it to push content down naturally on mobile */}
        {hasStarted && (
          <div className="w-full lg:w-[420px] bg-slate-900/60 backdrop-blur-2xl rounded-2xl sm:rounded-3xl flex flex-col shadow-xl border border-slate-700/50 lg:h-[calc(100vh-8rem)]">
            <div className="bg-slate-950/60 p-4 sm:p-5 border-b border-slate-800/80 flex items-center justify-between shrink-0">
              <h3 className="font-medium text-slate-200 flex items-center tracking-tight text-xs sm:text-sm">
                <svg className="w-3 h-3 sm:w-4 sm:h-4 mr-2 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                Diagnostics
              </h3>
              <span className="text-[8px] sm:text-[10px] uppercase tracking-widest text-slate-400 bg-slate-900 border border-slate-700 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded">Log Active</span>
            </div>
            
            {/* FIX 4: Changed to a fixed height just for the chat area on mobile so you can scroll the chat without scrolling the whole page */}
            <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-6 h-[300px] lg:h-auto">
              {transcript.map((entry, index) => (
                <div key={index} className={`flex flex-col ${entry.speaker === 'Candidate' || entry.speaker === 'System' ? 'items-end' : 'items-start'}`}>
                  
                  <span className="text-[8px] sm:text-[10px] font-semibold text-slate-400 mb-1 mx-1 uppercase tracking-wider flex items-center">
                    {entry.speaker === 'Candidate' && <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-indigo-400 mr-1.5 shadow-[0_0_4px_currentColor]"></span>}
                    {entry.speaker === 'AI' && <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-cyan-500 mr-1.5"></span>}
                    {entry.speaker}
                  </span>

                  <div className={`max-w-[95%] sm:max-w-[85%] px-4 sm:px-5 py-3 sm:py-4 whitespace-pre-wrap break-words text-xs sm:text-sm leading-relaxed border shadow-md ${
                    entry.speaker === 'Candidate' 
                      ? 'bg-indigo-600/30 text-white border-indigo-500/40 rounded-xl sm:rounded-2xl rounded-tr-sm' 
                      : entry.speaker === 'System'
                      ? 'bg-slate-900/80 text-slate-400 border-slate-800/80 rounded-xl sm:rounded-2xl rounded-tr-sm italic'
                      : 'bg-slate-800/80 border-slate-700/60 text-slate-200 rounded-xl sm:rounded-2xl rounded-tl-sm'
                  }`}>
                    {entry.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}