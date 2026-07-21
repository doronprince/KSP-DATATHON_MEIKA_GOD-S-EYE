"use client";

import { useState, useEffect, useRef } from 'react';

export function useKannadaVoice(onTextRecognized: (text: string) => void) {
  const [isRecording, setIsRecording] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);

  // 1. Store the latest callback in a ref so it doesn't trigger re-renders
  const onTextRecognizedRef = useRef(onTextRecognized);

  // 2. Keep the ref updated silently if the parent component re-renders
  useEffect(() => {
    onTextRecognizedRef.current = onTextRecognized;
  }, [onTextRecognized]);

  // 3. Initialize the Speech Recognition engine EXACTLY ONCE on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (SpeechRecognition) {
        const reco = new SpeechRecognition();
        reco.lang = 'kn-IN';
        reco.continuous = false;
        reco.interimResults = false;

        reco.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          // Execute the most current version of the callback function
          if (onTextRecognizedRef.current) {
            onTextRecognizedRef.current(transcript);
          }
          setIsRecording(false);
        };

        reco.onerror = () => setIsRecording(false);
        reco.onend = () => setIsRecording(false);

        setRecognition(reco);
      }
    }
  }, []); // <-- Empty dependency array completely prevents the infinite loop

  const toggleRecording = () => {
    if (isRecording) {
      recognition?.stop();
      setIsRecording(false);
    } else {
      recognition?.start();
      setIsRecording(true);
    }
  };

  return { isRecording, toggleRecording, isSupported: !!recognition };
}