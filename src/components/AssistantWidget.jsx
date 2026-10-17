import { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import { GEMINI_API_KEY } from '../utils/constants';
import { MARIA_CATECHESIS_KNOWLEDGE } from '../utils/mariaCatechesisKnowledge';
import { usePersistedState } from '../hooks/usePersistedState';
import { MaterialIcon } from './Shared/MaterialIcon';
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
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash'
  ];

  const [candidateList, setCandidateList] = useState(DEFAULT_MODELS);
  const [currentModelIndex, setCurrentModelIndex] = useState(0);
  const [isModelReady, setIsModelReady] = useState(Boolean(apiKey && ai));

  // Escaneo dinámico de modelos disponibles en la API de Gemini
  useEffect(() => {
    setIsModelReady(Boolean(apiKey && ai));

    if (ai) {
      (async () => {
        try {
          const fetchedModels = [];
          const response = await ai.models.list();
          for await (const modelObj of response) {
            const rawName = modelObj.name || '';
            const modelId = rawName.replace(/^models\//, '');
            if (modelId && (modelId.includes('flash') || modelId.includes('lite') || modelId.includes('gemini'))) {
              fetchedModels.push(modelId);
            }
          }

          if (fetchedModels.length > 0) {
            // Ordenar dando prioridad a los modelos lite/flash más recientes (3.5, 3.1, 3.0, 2.5, etc.)
            const priorityOrder = [
              'gemini-3.5-flash-lite',
              'gemini-3.1-flash-lite',
              'gemini-3-flash-lite',
              'gemini-2.5-flash-lite',
              'gemini-2.5-flash',
              'gemini-2.0-flash-lite',
              'gemini-1.5-flash'
            ];

            const sorted = [...new Set([...fetchedModels, ...DEFAULT_MODELS])].sort((a, b) => {
              const idxA = priorityOrder.findIndex(p => a.includes(p) || a === p);
              const idxB = priorityOrder.findIndex(p => b.includes(p) || b === p);
              if (idxA !== -1 && idxB !== -1) return idxA - idxB;
              if (idxA !== -1) return -1;
              if (idxB !== -1) return 1;
              return a.localeCompare(b);
            });

            setCandidateList(sorted);
          }
        } catch (err) {
          console.warn('[MarIA Model Scanner] No se pudo obtener la lista remota de modelos, usando lista base:', err);
        }
      })();
    }
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

  // --- SINTETIZADOR DE VOZ (LECTURA HABLADA EN VOZ ALTA FEMENINA) ---
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
    utterance.lang = 'es-MX'; // Priorizar variantes latinoamericanas
    utterance.rate = 1.0;

    // Buscar voz femenina en español del sistema (Google, Microsoft, Monica, Helena, Paulina, Sabina, etc.)
    const voices = window.speechSynthesis.getVoices();
    const spanishVoices = voices.filter(v => v.lang.startsWith('es'));

    const femaleVoice = spanishVoices.find(v => {
      const name = v.name.toLowerCase();
      return (
        name.includes('female') ||
        name.includes('mujer') ||
        name.includes('sabina') ||
        name.includes('helena') ||
        name.includes('monica') ||
        name.includes('paulina') ||
        name.includes('hilda') ||
        name.includes('laura') ||
        name.includes('dalia') ||
        name.includes('mia') ||
        name.includes('google español') ||
        name.includes('natural')
      );
    }) || spanishVoices.find(v => !v.name.toLowerCase().includes('male') && !v.name.toLowerCase().includes('pablo') && !v.name.toLowerCase().includes('jorge') && !v.name.toLowerCase().includes('raul')) || spanishVoices[0];

    if (femaleVoice) {
      utterance.voice = femaleVoice;
    }

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

  // Consultas locales sobre datos que ya están filtrados según los permisos del usuario
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
  const generateAssistantReplyStream = async (promptText, fileObj, historyMessages, onChunkReceived) => {
    const roleText = userRole === 'catequista' ? 'Catequista' : 'Administrador/Coordinador';

    const systemInstruction = `
      [ROL E IDENTIDAD DE MARIA]
      Tu nombre es "MarIA" (Módulo de Apoyo, Registro e Inteligencia en el Acompañamiento).
      Eres la asistente virtual pastoral y técnica de la plataforma de catequesis AsisCate de la Parroquia El Carmen (Alajuela, Costa Rica).
      Respondes al último mensaje usando el contexto previo del chat cuando sea relevante. NUNCA saludes repetitivamente.

      [GENERACIÓN DE IMÁGENES Y DIBUJOS]
      - Si el usuario te solicita directamente crear o generar una imagen o dibujo para colorear, explica amablemente que como asistente de texto no puedes generar archivos de imagen directamente por el chat, pero brinda ideas pastoralmente ricas o términos de búsqueda específicos para ayudar al usuario.

      [DESARROLLADOR / ORIGEN]
      - Tu desarrollador y creador de la plataforma es Israel (catequista de la parroquia).
      - Si te preguntan quién te creó, responde: "Fui desarrollada por Israel, catequista de nuestra parroquia El Carmen."
      - NUNCA menciones a Israel espontáneamente salvo que pregunten directamente sobre tu origen o desarrollo.

      [ACCESO A DATOS REALES Y SEGURIDAD POR ROL]
      Usuario actual: ${userName ? userName : 'Usuario'} | Rol activo: ${roleText} (${userRole})
      - Cuando el mensaje incluya un bloque de datos locales de AsisCate, úsalo para responder consultas de asistencia, estudiantes y grupos.
      - Los datos incluidos ya están filtrados para el usuario actual; no inventes datos que no aparezcan en ese bloque.
      - Si el usuario es Catequista, los datos locales ya están estrictamente filtrados para sus grupos asignados.

      [CONSULTA DE LA WEB CATEQUÉTICA]
      - Si la pregunta trata de catequesis, niveles, sacramentos, diaconías, misión, formación cristiana o avisos parroquiales, consulta las páginas oficiales proporcionadas en el mensaje mediante la herramienta URL Context antes de responder.
      - Usa esa web como fuente principal y cita el enlace específico en la respuesta. La memoria incluida abajo solo sirve como referencia auxiliar si la página no se puede consultar; en ese caso, indícalo con claridad.
      - No presentes noticias antiguas como actuales ni inventes horarios, requisitos o fechas. Para datos operativos de grupos y horarios, usa las herramientas autorizadas de AsisCate.

      [INSPIRACIÓN ESPIRITUAL]
      1. Virgen del Carmen: Humildad y protección fraternal.
      2. Agustinos Recoletos (OAR): Fraternidad y oración interior ("Un solo corazón y una sola alma hacia Dios").

      ${MARIA_CATECHESIS_KNOWLEDGE}

      [REGLAS DE FORMATO]
      1. Usa emojis cálidos (🙏, 📖, ✨, 🕊️).
      2. Párrafos breves con negritas y viñetas.
      3. Usa SIEMPRE "encuentros" o "encuentros de catequesis". NUNCA use "sesiones".
    `;

    if (!ai) {
      throw new Error('No se ha configurado la clave API (VITE_GEMINI_API_KEY). Contacta al administrador.');
    }

    let currentUserText = promptText;
    let currentUserParts = [];

    if (fileObj) {
      if (fileObj.isMultimodal) {
        const base64Data = await fileToBase64(fileObj.file);
        currentUserParts = [
          { text: promptText || 'Por favor analiza este documento o imagen adjunta:' },
          {
            inlineData: {
              mimeType: fileObj.file.type || 'application/pdf',
              data: base64Data
            }
          }
        ];
      } else if (fileObj.extractedText) {
        currentUserText = `[DOCUMENTO ADJUNTO POR EL USUARIO: "${fileObj.name}"]:\n${fileObj.extractedText}\n\n[CONSULTA DEL USUARIO]:\n${promptText || 'Analiza el documento adjunto y brinda tu resumen o retroalimentación pastoral.'}`;
      }
    }

    if (currentUserParts.length === 0) {
      currentUserParts = [{ text: currentUserText }];
    }

    const contentsPayload = [
      ...historyMessages
        .filter(message => message.text && message.text !== '...')
        .slice(-10)
        .map(message => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.text }]
        })),
      { role: 'user', parts: currentUserParts }
    ];
    const requiresCatechesisKnowledge = /\b(catequesis|catequ(?:esis|ista|istas|izando|izandos)|catecismo|niveles?|sacramentos?|primera comunión|comunión|confirmación|diaconías?|encuentros? de catequesis|formación cristiana|misión parroquial|lectio divina|eucaristía|confesión|reconciliación)\b/i.test(promptText);
    if (requiresCatechesisKnowledge) {
      const sourceURLs = [];
      const levelRoutes = [
        [/\b(primer(?:o)?|nivel\s*(?:1|uno))\b/i, 'primero'],
        [/\b(segund(?:o)?|nivel\s*(?:2|dos))\b/i, 'segundo'],
        [/\b(tercer(?:o)?|nivel\s*(?:3|tres))\b/i, 'tercero'],
        [/\b(cuart(?:o)?|nivel\s*(?:4|cuatro))\b/i, 'cuarto'],
        [/\b(quint(?:o)?|nivel\s*(?:5|cinco))\b/i, 'quinto'],
        [/\b(sext(?:o)?|nivel\s*(?:6|seis))\b/i, 'sexto'],
        [/\b(septim(?:o|a)|nivel\s*(?:7|siete)|confirma|confirmación)\b/i, 'confirma']
      ];
      levelRoutes.forEach(([pattern, route]) => {
        if (pattern.test(promptText)) sourceURLs.push(`https://cateelcarmen.web.app/${route}`);
      });
      if (/diacon[ií]a|comunidad|monserrat|montecillos/i.test(promptText)) {
        sourceURLs.push('https://cateelcarmen.web.app/diaconias');
      }
      if (/noticia|aviso|fecha|horario|actividad|fiesta/i.test(promptText)) {
        sourceURLs.push('https://cateelcarmen.web.app/noticias');
      }
      if (/misi[oó]n|visi[oó]n|qui[eé]nes somos|parroquia|formaci[oó]n/i.test(promptText)) {
        sourceURLs.push('https://cateelcarmen.web.app/quienes-somos');
      }
      if (/comuni[oó]n|eucarist[ií]a|confesi[oó]n|reconciliaci[oó]n/i.test(promptText)) {
        sourceURLs.push('https://cateelcarmen.web.app/tercero');
      }
      if (sourceURLs.length === 0) {
        sourceURLs.push('https://cateelcarmen.web.app/', 'https://cateelcarmen.web.app/quienes-somos');
      }
      const uniqueSourceURLs = [...new Set(sourceURLs)];
      contentsPayload[contentsPayload.length - 1].parts.unshift({
        text: `[CONSULTA LA FUENTE OFICIAL CON URL CONTEXT ANTES DE RESPONDER. Prioriza estas páginas de Catequesis Nuestra Señora de El Carmen y cita el enlace pertinente. Si no puedes recuperar su contenido, dilo y usa la memoria auxiliar con cautela.\n${uniqueSourceURLs.join('\n')}]`
      });
    }
    const requiresLiveData = /\b(asistencias?|ausentes?|faltas?|faltaron|presentes?|justificad[oa]s?|estad[ií]sticas?|listas?|grupos?|grupo|cu[aá]nt[oa]s?)\b/i.test(promptText)
      || (/\b(catequizandos?|alumnos?|estudiantes?)\b/i.test(promptText)
        && /\b(lista|nombres|qui[eé]nes|qui[eé]n|mostrar|muestra|listar|enumera|dame|cu[aá]nt[oa]s|ausentes?|presentes?)\b/i.test(promptText));

    const urlContextTool = requiresCatechesisKnowledge ? [{ urlContext: {} }] : undefined;

    let contentsForModel = contentsPayload;
    if (requiresLiveData) {
      const asksAboutAttendance = /\b(asistencias?|ausentes?|faltas?|faltaron|presentes?|justificad[oa]s?|estad[ií]sticas?|tasa|porcentaje)\b/i.test(promptText);
      const asksStudentCount = /\bcu[aá]nt[oa]s\b/i.test(promptText)
        && /\b(catequizandos?|alumnos?|estudiantes?)\b/i.test(promptText);
      const asksStudentList = /\b(lista|nombres|qui[eé]nes|qui[eé]n|mostrar|muestra|listar|enumera|dame|informaci[oó]n|datos|perfil)\b/i.test(promptText)
        && /\b(catequizandos?|alumnos?|estudiantes?)\b/i.test(promptText);
      const groupName = visibleGroups.find(group =>
        group.name && promptText.toLowerCase().includes(group.name.toLowerCase())
      )?.name;
      const functionName = asksAboutAttendance || asksStudentCount
        ? 'obtenerResumenAsistencia'
        : asksStudentList
          ? 'obtenerListaCatequizandos'
          : 'obtenerInformacionGrupos';
      const localData = executeLocalFunctionCall(functionName, { nombreGrupo: groupName });
      const dataContext = {
        text: `[DATOS LOCALES AUTORIZADOS DE ASISCATE: ${JSON.stringify(localData)}]`
      };
      const lastContentIndex = contentsPayload.length - 1;
      contentsForModel = contentsPayload.map((content, index) => index === lastContentIndex
        ? { ...content, parts: [...content.parts, dataContext] }
        : content);
    }

    const streamText = async (modelToTry, contents) => {
      const streamResponse = await ai.models.generateContentStream({
        model: modelToTry,
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
          tools: urlContextTool
        }
      });

      let fullText = '';
      for await (const chunk of streamResponse) {
        fullText += chunk.text || '';
        onChunkReceived(fullText);
      }
      return fullText;
    };

    const totalModels = candidateList.length;
    let idx = currentModelIndex;

    for (let attempts = 0; attempts < totalModels; attempts++) {
      const modelToTry = candidateList[idx];

      try {
        const fullText = await streamText(modelToTry, contentsForModel);
        if (idx !== currentModelIndex) setCurrentModelIndex(idx);
        return fullText || (requiresLiveData ? 'Consulta procesada correctamente.' : 'No se pudo generar una respuesta.');

      } catch (error) {
        console.error(`[Gemini Stream] Error con modelo ${modelToTry}:`, error);
        const errorMsg = error?.message || '';
        const isUnavailable = 
          error?.status === 503 || 
          errorMsg.includes('503') || 
          errorMsg.includes('UNAVAILABLE');
        const isRateLimited = error?.status === 429 || errorMsg.includes('429') || errorMsg.toLowerCase().includes('quota');

        if (isUnavailable) {
          idx = (idx + 1) % totalModels;
          continue;
        }

        if (isRateLimited) {
          return 'MarIA alcanzó temporalmente el límite de solicitudes de Gemini. Espera un momento y vuelve a intentarlo.';
        }

        return `No se pudo completar la solicitud a MarIA. Intenta de nuevo. Detalle: ${errorMsg || 'error de conexión o configuración'}`;
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

    const conversationHistory = assistantMessages
      .filter(message => message.text && message.text !== '...')
      .slice(-10);

    setAssistantMessages(prev => [...prev, userMessage, initialBotMessage]);
    setIsLoading(true);

    try {
      const finalReply = await generateAssistantReplyStream(userText, fileToProcess, conversationHistory, (accumulatedText) => {
        setAssistantMessages(prev =>
          prev.map(msg => msg.id === botMessageId ? { ...msg, text: accumulatedText } : msg)
        );
      });

      setAssistantMessages(prev =>
        prev.map(msg => {
          if (msg.id === botMessageId && (msg.text === '...' || !msg.text)) {
            return { ...msg, text: finalReply || 'No se recibió respuesta del modelo.' };
          }
          return msg;
        })
      );
    } catch (error) {
      console.error('[MarIA] No se pudo procesar el mensaje:', error);
      setAssistantMessages(prev =>
        prev.map(msg => msg.id === botMessageId
          ? { ...msg, text: `No se pudo completar la solicitud a MarIA. Intenta de nuevo. Detalle: ${error?.message || 'error de conexión o configuración'}` }
          : msg)
      );
    } finally {
      setIsLoading(false);
    }
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
      {/* HEADER DE MARIA LISO Y LIMPIO */}
      <div className="flex items-center justify-between gap-2 mb-3 border-b pb-2 border-slate-700/40">
        <div className="flex items-center gap-2">
          <h3 className={`text-base font-bold ${isDark ? 'text-sky-300' : 'text-sky-900'}`}>MarIA</h3>
          <span className="text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded-full font-medium" title={`Modelo activo: ${activeModel}`}>
            Powered by <strong className="font-mono text-sky-300 font-bold">{activeModel}</strong>
          </span>
        </div>
        
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            type="button"
            onClick={() => setActiveTabMode(activeTabMode === 'favorites' ? 'chat' : 'favorites')}
            title="Favoritos"
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 ${
              activeTabMode === 'favorites' 
                ? 'bg-amber-500 text-amber-950 font-extrabold shadow' 
                : (isDark ? 'text-amber-400 hover:bg-slate-800' : 'text-amber-600 hover:bg-slate-200')
            }`}
          >
            <MaterialIcon name="star" /> ({favorites.length})
          </button>
        </div>
      </div>

      {/* HISTORIAL DE MENSAJES O FAVORITOS */}
      <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
        {activeTabMode === 'favorites' && favorites.length === 0 && (
          <p className={`text-xs italic text-center py-6 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            No tienes ninguna respuesta guardada en favoritos. Presiona el botón de favoritos en cualquier mensaje de MarIA para conservarlo aquí.
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
              className={`max-w-[95%] sm:max-w-[90%] min-w-0 rounded-xl px-3 py-2 text-sm break-words overflow-hidden ${
                message.role === 'assistant' 
                  ? (isDark ? 'bg-slate-800 text-slate-100 border border-slate-700' : 'bg-white text-slate-800 border border-slate-200 shadow-sm') 
                  : 'ml-auto bg-sky-600 text-white font-medium'
              }`}
            >
              {message.fileName && (
                <div className="text-[11px] font-bold text-sky-200 bg-sky-950/60 px-2 py-1 rounded mb-2 inline-flex items-center gap-1.5 max-w-full truncate">
                  <span><MaterialIcon name="attach_file" /> Documento/Imagen:</span> <span className="truncate">{message.fileName}</span>
                </div>
              )}

              <div className={`text-sm break-words [word-break:break-word] overflow-wrap-break-word [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:my-1 [&>ol]:my-1 ${
                message.role === 'assistant'
                  ? (isDark ? 'prose prose-invert max-w-none' : 'text-slate-800')
                  : 'text-white'
              }`}>
                <ReactMarkdown
                  components={{
                    code({ node, inline, className, children, ...props }) {
                      const match = /language-(xml|svg|html)/.exec(className || '');
                      const codeString = String(children).trim();
                      const isSvgCode = (match || codeString.startsWith('<svg')) && codeString.includes('</svg>');

                      if (!inline && isSvgCode) {
                        return (
                          <div className="my-3 p-3 bg-white text-black rounded-xl border border-slate-300 shadow-sm flex flex-col items-center gap-2">
                            <div 
                              className="w-full max-w-md flex justify-center items-center overflow-auto p-2"
                              dangerouslySetInnerHTML={{ __html: codeString }}
                            />
                            <div className="flex gap-2 text-xs">
                              <button
                                type="button"
                                onClick={() => {
                                  const blob = new Blob([codeString], { type: 'image/svg+xml' });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = 'dibujo_marIA.svg';
                                  a.click();
                                  URL.revokeObjectURL(url);
                                }}
                                className="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg transition-colors flex items-center gap-1"
                              >
                                <MaterialIcon name="download" /> Descargar SVG
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    }
                  }}
                >
                  {message.text}
                </ReactMarkdown>
              </div>

              {/* BARRA DE ACCIONES CON ICONOS Y TOOLTIPS */}
              {message.role === 'assistant' && (
                <div className="flex flex-wrap items-center gap-1 mt-2 pt-2 border-t border-slate-700/50 text-[11px]">
                  <button
                    type="button"
                    onClick={() => toggleSpeechPlayback(message.id, message.text)}
                    className={`p-1.5 rounded transition-colors flex items-center justify-center ${
                      isSpeaking ? 'bg-amber-500 text-amber-950 animate-pulse' : 'bg-sky-500/20 hover:bg-sky-500/30 text-sky-300'
                    }`}
                    title={isSpeaking ? 'Detener lectura' : 'Escuchar respuesta'}
                  >
                    <MaterialIcon name={isSpeaking ? 'stop' : 'volume_up'} />
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleFavorite(message)}
                    className={`p-1.5 rounded transition-colors flex items-center justify-center ${
                      isFav ? 'bg-amber-400 text-amber-950' : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300'
                    }`}
                    title={isFav ? 'Quitar de favoritos' : 'Favoritos'}
                  >
                    <MaterialIcon name={isFav ? 'star' : 'star_outline'} />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(message.text);
                      setCopiedId(message.id);
                      setTimeout(() => setCopiedId(null), 2000);
                    }}
                    title="Copiar texto"
                    className="px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-[10px] transition-colors ml-auto flex items-center gap-1"
                  >
                    {copiedId === message.id ? <><MaterialIcon name="check" /> Copiado</> : <><MaterialIcon name="content_copy" /> Copiar</>}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className={`max-w-[95%] rounded-xl px-3.5 py-2.5 text-xs italic animate-pulse border ${
            isDark ? 'bg-slate-800 text-sky-300 border-slate-700' : 'bg-white text-sky-900 border-slate-200 shadow-sm'
          }`}>
            <MaterialIcon name="auto_awesome" /> MarIA está procesando y respondiendo en tiempo real...
          </div>
        )}
      </div>

      {/* PREVIEW DEL ARCHIVO ADJUNTO */}
      {attachedFile && activeTabMode === 'chat' && (
        <div className="mt-3 flex items-center justify-between bg-sky-950/60 border border-sky-500/40 text-sky-200 text-xs px-3 py-1.5 rounded-lg">
          <div className="flex items-center gap-2 truncate">
            <MaterialIcon name="attach_file" className="text-sm" />
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

      {/* FORMULARIO DE ENVÍO CON ADJUNTAR Y MICRÓFONO DENTRO DE LA CAJA */}
      {activeTabMode === 'chat' && (
        <form
          onSubmit={assistantSubmit}
          className={`mt-3 flex w-full min-w-0 items-center gap-1 rounded-full border p-1.5 ${
            isDark ? 'border-slate-700 bg-slate-800' : 'border-slate-300 bg-white'
          }`}
        >
          <label
            className={`flex shrink-0 cursor-pointer items-center justify-center rounded-full p-2 transition-colors ${
              attachedFile ? 'bg-sky-600 text-white' : isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Adjuntar Imagen, PDF, Word (.docx) o Texto"
            aria-label="Adjuntar archivo"
          >
            <MaterialIcon name="attach_file" />
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
            className={`flex shrink-0 items-center justify-center rounded-full p-2 text-xs font-bold transition-colors ${
              isListening ? 'bg-rose-600 text-white animate-pulse' : isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100'
            }`}
            title={isListening ? 'Escuchando... Presiona para detener' : 'Dictar mensaje por voz'}
            aria-label={isListening ? 'Detener dictado por voz' : 'Dictar mensaje por voz'}
          >
            <MaterialIcon name="mic" />
          </button>
          <input
            value={assistantInput}
            onChange={(event) => setAssistantInput(event.target.value)}
            placeholder={isListening ? "Escuchando tu voz..." : (isModelReady ? "Pregunta a MarIA o consulta asistencias..." : "Cargando...")}
            disabled={isLoading || !isModelReady}
            className={`min-w-0 flex-1 bg-transparent px-1 py-2 text-sm outline-none disabled:opacity-50 ${isDark ? 'text-white placeholder:text-slate-400' : 'text-slate-900 placeholder:text-slate-500'}`}
          />
          <button
            type="submit"
            disabled={isLoading || !isModelReady || (!assistantInput.trim() && !attachedFile)}
            className="flex shrink-0 items-center justify-center rounded-full bg-sky-600 p-2 text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-800/50"
            title={isLoading ? 'Enviando...' : 'Enviar mensaje'}
            aria-label={isLoading ? 'Enviando mensaje' : 'Enviar mensaje'}
          >
            <MaterialIcon name={isLoading ? 'progress_activity' : 'send'} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </form>
      )}
    </div>
  );
};
