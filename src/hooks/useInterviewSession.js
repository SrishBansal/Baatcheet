import { useState, useEffect, useRef, useCallback } from 'react';
import { InterviewController } from '../engine/interviewController.js';

export function useInterviewSession(job, options = {}) {
  const controllerRef = useRef(null);

  const [, setRerender] = useState(0);
  const forceUpdate = useCallback(() => setRerender((c) => c + 1), []);

  const [state, setState] = useState('IDLE');
  const [transcript, setTranscript] = useState([]);
  const [interimSpeech, setInterimSpeech] = useState('');
  const [speechError, setSpeechError] = useState(null);

  useEffect(() => {
    if (!job) return;

    const controller = new InterviewController({
      job,
      interviewId: options.interviewId,
      capabilities: options.capabilities,
      speechRecognizer: options.speechRecognizer,
      speechSynthesizer: options.speechSynthesizer,
      reasoner: options.reasoner,
      onStateChange: (newState) => {
        setState(newState);
        forceUpdate();
      },
      onTranscriptUpdate: (newTranscript) => {
        setTranscript(newTranscript);
        forceUpdate();
      },
      onInterimSpeech: (text) => {
        setInterimSpeech(text);
      },
      onError: (errMsg) => {
        setSpeechError(errMsg);
      },
    });

    controllerRef.current = controller;
    setState(controller.getState());

    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [job, options.interviewId, options.capabilities, options.speechRecognizer, options.speechSynthesizer, forceUpdate]);

  const controller = controllerRef.current;

  return {
    state,
    sessionRecord: controller?.getSessionRecord() || null,
    hasConsented: controller?.hasConsented || false,
    currentQuestion: controller?.getCurrentQuestion() || null,
    activePrompt: controller?.getActivePrompt() || null,
    progress: controller?.getProgress() || { total: 0, current: 0, isComplete: false },
    transcript,
    interimSpeech,
    speechError,
    inputMode: controller?.getInputMode() || 'text',
    capabilities: controller?.capabilities || null,
    reasoning: controller?.sessionRecord?.reasoning || { providerKind: 'deterministic', providerId: 'none' },

    // Actions
    grantConsent: useCallback(() => {
      controllerRef.current?.grantConsent();
      forceUpdate();
    }, [forceUpdate]),

    startInterview: useCallback(() => {
      controllerRef.current?.startInterview();
      forceUpdate();
    }, [forceUpdate]),

    submitAnswer: useCallback((text) => {
      const res = controllerRef.current?.submitAnswer(text);
      setInterimSpeech('');
      forceUpdate();
      return res;
    }, [forceUpdate]),

    skipQuestion: useCallback(() => {
      const res = controllerRef.current?.skipQuestion();
      setInterimSpeech('');
      forceUpdate();
      return res;
    }, [forceUpdate]),

    repeatQuestion: useCallback(() => {
      const res = controllerRef.current?.repeatQuestion();
      setInterimSpeech('');
      forceUpdate();
      return res;
    }, [forceUpdate]),

    clarifyQuestion: useCallback(() => {
      const res = controllerRef.current?.clarifyQuestion();
      setInterimSpeech('');
      forceUpdate();
      return res;
    }, [forceUpdate]),

    interruptQuestion: useCallback(() => {
      controllerRef.current?.interruptQuestion();
      forceUpdate();
    }, [forceUpdate]),

    pause: useCallback(() => {
      const res = controllerRef.current?.pause();
      forceUpdate();
      return res;
    }, [forceUpdate]),

    resume: useCallback(() => {
      const res = controllerRef.current?.resume();
      forceUpdate();
      return res;
    }, [forceUpdate]),

    endEarly: useCallback(() => {
      controllerRef.current?.endEarly();
      forceUpdate();
    }, [forceUpdate]),

    setInputMode: useCallback((mode) => {
      controllerRef.current?.setInputMode(mode);
      forceUpdate();
    }, [forceUpdate]),
  };
}
