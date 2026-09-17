import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import { GEMINI_API_KEY } from '../utils/constants';
import { usePersistedState } from '../hooks/usePersistedState';
import {
  fileToBase64,
  extractDocxText,
  extractPlainText,
  exportResponseToPdf,
  exportResponseToWord,
  exportResponseToImage
} from '../utils/mariaDocExporter';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || GEMINI_API_KEY || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const AssistantWidget = ({ 
  attendanceType = 'encuentro', 
  absentRate = 0, 
  userRole = 'admin',
  userName = '',
  themeMode = 'dark',
  inputBgClass = 'bg-slate-800 text-white border border-slate-700',
  visibleStudents = [],
  visibleGroups = [],
  selectedGroupId = '',
  attendanceDate = ''
}) => {
  const [assistantMessages, setAssistantMessages] = useState([]);
  const [assistantInput, setAssistantInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachedFile, setAttachedFile] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [activeTabMode, setActiveTabMode] = useState('chat'); // 'chat' | 'favorites'
  const [favorites, setFavorites] = usePersistedState('asiscate-maria-favorites', []);
  const fileInputRef = useRef(null);

  // Estados para voz y lectura
  const [isListening, setIsListening] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  const recognitionRef = useRef(null);

  const DEFAULT_MODELS = [
    'gemini-2.5-flash-lite',
    'gemini-1.5-flash',
    'gemini-2.0-flash-lite',
    'gemini-2.5-flash'
  ];

  const [candidateList] = useState(DEFAULT_MODELS);
  const [currentModelIndex, setCurrentModelIndex] = useState(0);
  const [isModelReady, setIsModelReady] = useState(Boolean(apiKey && ai));

  useEffect(() => {
    setIsModelReady(Boolean(apiKey && ai));
  }, []);

  const activeModel = candidateList[currentModelIndex] || 'gemini-2.5-flash-lite';

  // --- RECONOCIMIENTO DE VOZ (VOZ A TEXTO) ---
  useEffect(() => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'es-CR';

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setAssistantInput(transcript);
      };

      recognition.onend = () => setIsListening(false);
      recognition.onerror = (err) => {
        console.warn('Error en reconocimiento de voz:', err);
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) {
      alert('Tu navegador no soporta dictado por voz.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.warn('No se pudo iniciar el micrófono:', err);
      }
    }
  };

  // --- SINTETIZADOR DE VOZ (LECTURA HABLADA EN VOZ ALTA) ---
  const toggleSpeechPlayback = (messageId, text) => {
    if (!('speechSynthesis' in window)) {
      alert('Tu navegador no soporta lectura en voz alta.');
      return;
    }

    if (speakingMessageId === messageId) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }

    window.speechSynthesis.cancel();

    // Limpiar markdown del texto para lectura limpia
    const cleanText = text
      .replace(/[*#_~`]/g, '')
      .replace(/https?:\/\/\S+/g, 'enlace');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'es-ES';
    utterance.rate = 1.0;

    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);

    setSpeakingMessageId(messageId);
    window.speechSynthesis.speak(utterance);
  };

  // --- MANEJO DE ARCHIVOS ADJUNTOS ---
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileType = file.type || '';
    const fileName = file.name || '';
    const extension = fileName.split('.').pop()?.toLowerCase() || '';

    let isMultimodal = false;
    let extractedText = '';

    if (fileType.startsWith('image/') || fileType === 'application/pdf') {
      isMultimodal = true;
    } else if (extension === 'docx' || extension === 'doc') {
      extractedText = await extractDocxText(file);
    } else {
      extractedText = await extractPlainText(file);
    }

    setAttachedFile({
      file,
      name: fileName,
      type: fileType || extension,
      isMultimodal,
      extractedText
    });
  };

  const removeAttachedFile = () => {
    setAttachedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // --- DEFINICIÓN DE HERRAMIENTAS (FUNCTION CALLING CON SEGURIDAD POR ROL) ---
  const toolsDeclarations = [
    {
      name: 'obtenerResumenAsistencia',
      description: 'Obtiene las estadísticas de asistencia (presentes, ausentes, justificados) de los grupos visibles autorizados para el usuario actual.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          nombreGrupo: { type: Type.STRING, description: 'Nombre opcional del grupo para filtrar.' }
        }
      }
    },
    {
      name: 'obtenerListaCatequizandos',
      description: 'Consulta los catequizandos matriculados y sus datos generales dentro de los grupos autorizados para el usuario actual.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          nombreGrupo: { type: Type.STRING, description: 'Nombre opcional del grupo para filtrar.' }
        }
      }
    },
    {
      name: 'obtenerInformacionGrupos',
      description: 'Consulta la lista de grupos, niveles, horarios y salones autorizados para el usuario.',
      parameters: { type: Type.OBJECT, properties: {} }
    }
  ];

  // Ejecutores locales de Function Calling respetando los permisos
  const executeLocalFunctionCall = (functionName, args) => {
    const { nombreGrupo } = args || {};

    if (functionName === 'obtenerResumenAsistencia') {
      const filteredStudents = visibleStudents.filter(student => {
        if (!nombreGrupo) return true;
        const group = visibleGroups.find(g => g.id === student.groupId);
        return group && group.name.toLowerCase().includes(nombreGrupo.toLowerCase());
      });

      const total = filteredStudents.length;
      let presentCount = 0;
      let absentCount = 0;
      let justifiedCount = 0;

      filteredStudents.forEach(st => {
        const records = st.attendance || [];
        const lastRecord = records.find(r => !attendanceDate || r.date === attendanceDate) || records[records.length - 1];
        if (lastRecord) {
          if (lastRecord.status === 'present') presentCount++;
          else if (lastRecord.status === 'absent') absentCount++;
          else if (lastRecord.status === 'justified') justifiedCount++;
        }
      });

      return {
        totalCatequizandos: total,
        presentes: presentCount,
        ausentes: absentCount,
        justificados: justifiedCount,
        tasaAusencia: total > 0 ? Math.round((absentCount / total) * 100) : 0,
        fechaConsulta: attendanceDate || 'Última registrada'
      };
    }

    if (functionName === 'obtenerListaCatequizandos') {
      const filtered = visibleStudents.filter(student => {
        if (!nombreGrupo) return true;
        const group = visibleGroups.find(g => g.id === student.groupId);
        return group && group.name.toLowerCase().includes(nombreGrupo.toLowerCase());
      });

      return {
        totalEncontrados: filtered.length,
        estudiantes: filtered.slice(0, 15).map(st => ({
          nombre: st.name || st.fullName || 'Catequizando',
          grupo: visibleGroups.find(g => g.id === st.groupId)?.name || 'Sin grupo',
          nivel: st.level || 'Sin nivel'
        }))
      };
    }

    if (functionName === 'obtenerInformacionGrupos') {
      return {
        totalGrupos: visibleGroups.length,
        grupos: visibleGroups.map(g => ({
          nombre: g.name,
          nivel: g.level,
          horario: `${g.day || ''} ${g.time || ''}`.trim() || 'Por definir',
          salon: g.room || 'Por definir'
        }))
      };
    }

    return { error: 'Función no reconocida' };
  };

  // --- GENERACIÓN CON STREAMING Y FUNCTION CALLING ---
  const generateAssistantReplyStream = async (promptText, fileObj, onChunkReceived) => {
    const roleText = userRole === 'catequista' ? 'Catequista' : 'Administrador/Coordinador';

    const systemInstruction = `
      [ROL E IDENTIDAD DE MARIA]
      Tu nombre es "MarIA" (Módulo de Apoyo, Registro e Inteligencia en el Acompañamiento).
      Eres la asistente virtual pastoral y técnica de la plataforma de catequesis AsisCate de la Parroquia El Carmen (Alajuela, Costa Rica).
      Respondes ÚNICAMENTE al mensaje o consulta que el usuario acaba de escribir. NUNCA saludes repetitivamente.

      [DESARROLLADOR / ORIGEN]
      - Tu desarrollador y creador de la plataforma es Israel (catequista de la parroquia).
      - Si te preguntan quién te creó, responde: "Fui desarrollada por Israel, catequista de nuestra parroquia El Carmen."
      - NUNCA menciones a Israel espontáneamente salvo que pregunten directamente sobre tu origen o desarrollo.

      [ACCESO A DATOS REALES Y SEGURIDAD POR ROL]
      Usuario actual: ${userName ? userName : 'Usuario'} | Rol activo: ${roleText} (${userRole})
      - Tienes herramientas (*tools*) disponibles para consultar asistencias, estudiantes y grupos autorizados para este usuario.
      - Utiliza tus herramientas cuando te pregunten por listas de alumnos, ausencias o estadísticas de grupos.
      - Si el usuario es Catequista, la información devuelta por las herramientas ya está estrictamente filtrada para sus grupos asignados.

      [INSPIRACIÓN ESPIRITUAL]
      1. Virgen del Carmen: Humildad y protección fraternal.
      2. Agustinos Recoletos (OAR): Fraternidad y oración interior ("Un solo corazón y una sola alma hacia Dios").

      [REGLAS DE FORMATO]
      1. Usa emojis cálidos (🙏, 📖, ✨, 🕊️).
      2. Párrafos breves con negritas y viñetas.
      3. Usa SIEMPRE "encuentros" o "encuentros de catequesis". NUNCA use "sesiones".
    `;

    if (!ai) {
      throw new Error('No se ha configurado la clave API (VITE_GEMINI_API_KEY). Contacta al administrador.');
    }

    let contentsPayload = promptText;

    if (fileObj) {
      if (fileObj.isMultimodal) {
        const base64Data = await fileToBase64(fileObj.file);
        contentsPayload = [
          promptText || 'Por favor analiza este documento o imagen adjunta:',
          {
            inlineData: {
              mimeType: fileObj.file.type || 'application/pdf',
              data: base64Data
            }
          }
        ];
      } else if (fileObj.extractedText) {
        contentsPayload = `[DOCUMENTO ADJUNTO POR EL USUARIO: "${fileObj.name}"]:\n${fileObj.extractedText}\n\n[CONSULTA DEL USUARIO]:\n${promptText || 'Analiza el documento adjunto y brinda tu resumen o retroalimentación pastoral.'}`;
      }
    }

    const totalModels = candidateList.length;
    let idx = currentModelIndex;

    for (let attempts = 0; attempts < totalModels; attempts++) {
      const modelToTry = candidateList[idx];

      try {
        // Primera verificación con Function Calling
        const firstCheck = await ai.models.generateContent({
          model: modelToTry,
          contents: contentsPayload,
          config: {
            systemInstruction: systemInstruction,
            temperature: 0.7,
            tools: [{ functionDeclarations: toolsDeclarations }]
          }
        });

        // Comprobar si Gemini quiere llamar a alguna función
        const functionCalls = firstCheck.functionCalls;
        if (functionCalls && functionCalls.length > 0) {
          const call = functionCalls[0];
          const localResult = executeLocalFunctionCall(call.name, call.args);

          const toolResponsePayload = [
            ...(Array.isArray(contentsPayload) ? contentsPayload : [contentsPayload]),
            {
              functionResponse: {
                name: call.name,
                response: localResult
              }
            }
          ];

          // Generación final en Streaming con el resultado de la función
          const streamResponse = await ai.models.generateContentStream({
            model: modelToTry,
            contents: toolResponsePayload,
            config: {
              systemInstruction: systemInstruction,
              temperature: 0.7
            }
          });

          let fullText = '';
          for await (const chunk of streamResponse) {
            const textChunk = chunk.text || '';
            fullText += textChunk;
            onChunkReceived(fullText);
          }

          if (idx !== currentModelIndex) setCurrentModelIndex(idx);
          return fullText || 'Consulta procesada correctamente.';
        }

        // Si no requirió funciones, hacemos la respuesta directa en STREAMING
        const streamResponse = await ai.models.generateContentStream({
          model: modelToTry,
          contents: contentsPayload,
          config: {
            systemInstruction: systemInstruction,
            temperature: 0.7
          }
        });

        let fullText = '';
        for await (const chunk of streamResponse) {
          const textChunk = chunk.text || '';
          fullText += textChunk;
          onChunkReceived(fullText);
        }

        if (idx !== currentModelIndex) setCurrentModelIndex(idx);
        return fullText || 'No se pudo generar una respuesta.';

      } catch (error) {
        console.error(`[Gemini Stream] Error con modelo ${modelToTry}:`, error);
        const errorMsg = error?.message || '';
        const isUnavailable = 
          error?.status === 503 || 
          error?.status === 429 || 
          errorMsg.includes('503') || 
          errorMsg.includes('429') || 
          errorMsg.includes('UNAVAILABLE') || 
          errorMsg.includes('quota');

        if (isUnavailable) {
          idx = (idx + 1) % totalModels;
          continue;
        }

        return 'Ocurrió un error al procesar tu solicitud. Por favor intenta de nuevo.';
      }
    }

    return 'En este momento los modelos están experimentando alta demanda. Intenta de nuevo en unos segundos.';
  };

  const assistantSubmit = async (event) => {
    event.preventDefault();
    const trimmed = assistantInput.trim();
    if ((!trimmed && !attachedFile) || isLoading || !isModelReady) return;

    const userText = trimmed || (attachedFile ? `[Adjunto: ${attachedFile.name}]` : '');

    const userMessage = {
      id: `assistant-user-${Date.now()}`,
      role: 'user',
      text: userText,
      fileName: attachedFile?.name
    };

    const fileToProcess = attachedFile;
    removeAttachedFile();
    setAssistantInput('');

    const botMessageId = `assistant-bot-${Date.now() + 1}`;
    const initialBotMessage = {
      id: botMessageId,
      role: 'assistant',
      text: '...'
    };

    setAssistantMessages(prev => [...prev, userMessage, initialBotMessage]);
    setIsLoading(true);

    await generateAssistantReplyStream(userText, fileToProcess, (accumulatedText) => {
      setAssistantMessages(prev =>
        prev.map(msg => msg.id === botMessageId ? { ...msg, text: accumulatedText } : msg)
      );
    });

    setIsLoading(false);
  };

  // --- FAVORITOS ---
  const toggleFavorite = (message) => {
    setFavorites(prev => {
      const exists = prev.some(fav => fav.id === message.id);
      if (exists) {
        return prev.filter(fav => fav.id !== message.id);
      } else {
        return [...prev, { ...message, savedAt: new Date().toISOString() }];
      }
    });
  };

  const isDark = themeMode === 'dark';
  const displayedMessages = activeTabMode === 'favorites' ? favorites : assistantMessages;

  return (
    <div className={`rounded-2xl border p-3 sm:p-4 transition-colors ${
      isDark ? 'border-sky-500/20 bg-sky-500/5' : 'border-sky-300 bg-sky-50/70'
    }`}>
      {/* HEADER DE MARIA CON PESTAÑAS */}
      <div className="flex items-center justify-between mb-3 border-b pb-2 border-slate-700/40">
        <div className="flex items-center gap-2">
          <h3 className={`text-base font-bold ${isDark ? 'text-sky-300' : 'text-sky-900'}`}>MarIA</h3>
          <span className="text-[10px] bg-sky-500/20 text-sky-400 px-2 py-0.5 rounded-full font-bold">Voz & Streaming</span>
        </div>
        
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTabMode('chat')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
              activeTabMode === 'chat' 
                ? 'bg-sky-600 text-white' 
                : (isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-200')
            }`}
          >
            💬 Chat
          </button>
          <button
            type="button"
            onClick={() => setActiveTabMode('favorites')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 ${
              activeTabMode === 'favorites' 
                ? 'bg-amber-500 text-amber-950 font-extrabold' 
                : (isDark ? 'text-amber-400 hover:bg-slate-800' : 'text-amber-600 hover:bg-slate-200')
            }`}
          >
            ⭐ Favoritos ({favorites.length})
          </button>
        </div>
      </div>

      {/* HISTORIAL DE MENSAJES O FAVORITOS */}
      <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
        {activeTabMode === 'favorites' && favorites.length === 0 && (
          <p className={`text-xs italic text-center py-6 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            No tienes ninguna respuesta guardada en favoritos. Presiona el botón ⭐ en cualquier mensaje de MarIA para conservarlo aquí.
          </p>
        )}

        {activeTabMode === 'chat' && assistantMessages.length === 0 && (
          <p className={`text-xs italic text-center py-4 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            ¡Hola! Soy MarIA. 🙏✨ Puedo consultar datos de asistencias en tiempo real, procesar archivos PDF/Word/imágenes y responder tus dudas pastorales. 📖📄🎙️
          </p>
        )}

        {displayedMessages.map((message) => {
          const isFav = favorites.some(f => f.id === message.id);
          const isSpeaking = speakingMessageId === message.id;

          return (
            <div
              key={message.id}
              id={`maria-card-${message.id}`}
              className={`max-w-[95%] rounded-xl px-3 py-2 text-sm ${
                message.role === 'assistant' 
                  ? (isDark ? 'bg-slate-800 text-slate-100 border border-slate-700' : 'bg-white text-slate-800 border border-slate-200 shadow-sm') 
                  : 'ml-auto bg-sky-600 text-white font-medium'
              }`}
            >
              {message.fileName && (
                <div className="text-[11px] font-bold text-sky-200 bg-sky-950/60 px-2 py-1 rounded mb-2 inline-flex items-center gap-1.5">
                  <span>📎 Documento/Imagen:</span> {message.fileName}
                </div>
              )}

              <div className={`text-sm [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:my-1 [&>ol]:my-1 ${
                message.role === 'assistant'
                  ? (isDark ? 'prose prose-invert max-w-none' : 'text-slate-800')
                  : 'text-white'
              }`}>
                <ReactMarkdown>
                  {message.text}
                </ReactMarkdown>
              </div>

              {/* BARRA DE ACCIONES: PDF, WORD, IMAGEN, REPRODUCIR VOZ, FAVORITOS Y COPIAR */}
              {message.role === 'assistant' && (
                <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-2 border-t border-slate-700/50 text-[11px]">
                  <button
                    type="button"
                    onClick={() => toggleSpeechPlayback(message.id, message.text)}
                    className={`px-2.5 py-1 rounded font-bold transition-colors flex items-center gap-1 ${
                      isSpeaking ? 'bg-amber-500 text-amber-950 animate-pulse' : 'bg-sky-500/20 hover:bg-sky-500/30 text-sky-300'
                    }`}
                    title={isSpeaking ? 'Detener lectura' : 'Escuchar respuesta en voz alta'}
                  >
                    {isSpeaking ? '⏹️ Detener' : '🔊 Escuchar'}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleFavorite(message)}
                    className={`px-2.5 py-1 rounded font-bold transition-colors flex items-center gap-1 ${
                      isFav ? 'bg-amber-400 text-amber-950' : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300'
                    }`}
                    title={isFav ? 'Quitar de favoritos' : 'Guardar respuesta en favoritos'}
                  >
                    {isFav ? '★ Guardado' : '⭐ Favorito'}
                  </button>

                  <button
                    type="button"
                    onClick={() => exportResponseToPdf(`Respuesta_MarIA_${message.id}`, message.text)}
                    className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold transition-colors flex items-center gap-1"
                    title="Descargar en PDF"
                  >
                    📄 PDF
                  </button>

                  <button
                    type="button"
                    onClick={() => exportResponseToWord(`Respuesta_MarIA_${message.id}`, message.text)}
                    className="px-2.5 py-1 rounded bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 font-bold transition-colors flex items-center gap-1"
                    title="Descargar en Word"
                  >
                    📝 Word
                  </button>

                  <button
                    type="button"
                    onClick={() => exportResponseToImage(`maria-card-${message.id}`, `Respuesta_MarIA_${message.id}`)}
                    className="px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold transition-colors flex items-center gap-1"
                    title="Descargar en Imagen PNG"
                  >
                    🖼️ PNG
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(message.text);
                      setCopiedId(message.id);
                      setTimeout(() => setCopiedId(null), 2000);
                    }}
                    className="px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold transition-colors ml-auto flex items-center gap-1"
                  >
                    {copiedId === message.id ? '✓ Copiado' : '📋 Copiar'}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className={`max-w-[90%] rounded-xl px-3 py-2 text-xs italic animate-pulse ${
            isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-600'
          }`}>
            MarIA está procesando y respondiendo en tiempo real... ✨
          </div>
        )}
      </div>

      {/* PREVIEW DEL ARCHIVO ADJUNTO */}
      {attachedFile && activeTabMode === 'chat' && (
        <div className="mt-3 flex items-center justify-between bg-sky-950/60 border border-sky-500/40 text-sky-200 text-xs px-3 py-1.5 rounded-lg">
          <div className="flex items-center gap-2 truncate">
            <span className="text-sm">📎</span>
            <span className="font-bold truncate">{attachedFile.name}</span>
            <span className="text-[10px] text-sky-400 uppercase">({attachedFile.isMultimodal ? 'Nativo' : 'Texto/Word'})</span>
          </div>
          <button
            type="button"
            onClick={removeAttachedFile}
            className="text-rose-400 hover:text-rose-300 font-bold px-1.5 text-sm"
            title="Quitar archivo adjunto"
          >
            ✕
          </button>
        </div>
      )}

      {/* FORMULARIO DE ENVÍO CON ADJUNTAR Y MICRÓFONO */}
      {activeTabMode === 'chat' && (
        <form onSubmit={assistantSubmit} className="mt-3 flex gap-2 items-center">
          <label
            className={`cursor-pointer px-2.5 py-2 rounded-lg border text-xs font-bold transition-colors flex items-center gap-1 ${
              attachedFile ? 'bg-sky-600 text-white border-sky-500' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title="Adjuntar Imagen, PDF, Word (.docx) o Texto"
          >
            <span>📎</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.docx,.doc,.txt,.md,.json,.csv"
              onChange={handleFileSelect}
              className="hidden"
              disabled={isLoading || !isModelReady}
            />
          </label>

          <button
            type="button"
            onClick={toggleVoiceInput}
            className={`px-3 py-2 rounded-lg border text-xs font-bold transition-colors flex items-center gap-1 ${
              isListening ? 'bg-rose-600 text-white border-rose-500 animate-pulse' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title={isListening ? 'Escuchando... Presiona para detener' : 'Dictar mensaje por voz'}
          >
            <span>🎤</span>
          </button>

          <input
            value={assistantInput}
            onChange={(event) => setAssistantInput(event.target.value)}
            placeholder={isListening ? "Escuchando tu voz..." : (isModelReady ? "Pregunta a MarIA o consulta asistencias..." : "Cargando...")}
            disabled={isLoading || !isModelReady}
            className={`flex-1 rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-50 ${inputBgClass}`}
          />

          <button
            type="submit"
            disabled={isLoading || !isModelReady || (!assistantInput.trim() && !attachedFile)}
            className="bg-sky-600 hover:bg-sky-700 disabled:bg-sky-800/50 disabled:cursor-not-allowed text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            {isLoading ? '...' : 'Enviar'}
          </button>
        </form>
      )}
    </div>
  );
};
