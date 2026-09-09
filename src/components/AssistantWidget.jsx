import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import { GEMINI_API_KEY } from '../utils/constants';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || GEMINI_API_KEY || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const AssistantWidget = ({ 
  attendanceType = 'encuentro', 
  absentRate = 0, 
  userRole = 'admin',
  userName = '',
  themeMode = 'dark',
  inputBgClass = 'bg-slate-800 text-white border border-slate-700' 
}) => {
  const [assistantMessages, setAssistantMessages] = useState([]);
  const [assistantInput, setAssistantInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const [candidateList, setCandidateList] = useState([]);
  const [currentModelIndex, setCurrentModelIndex] = useState(0);
  const [isModelReady, setIsModelReady] = useState(false);

  useEffect(() => {
    const discoverWorkingModels = async () => {
      if (!apiKey || !ai) {
        setIsModelReady(false);
        return;
      }
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );
        const data = await response.json();

        if (data.models && data.models.length > 0) {
          const candidateModels = data.models
            .map(m => m.name.replace('models/', ''))
            .filter(name => 
              name.includes('flash') && 
              !name.includes('preview') && 
              !name.includes('experimental') &&
              !name.includes('image') && 
              !name.includes('tts') && 
              !name.includes('audio')
            );

          candidateModels.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

          const verifiedModels = [];

          for (const modelCandidate of candidateModels) {
            try {
              console.log(`[Gemini API] Probando disponibilidad de: ${modelCandidate}...`);
              
              const testResponse = await ai.models.generateContent({
                model: modelCandidate,
                contents: 'ping',
              });

              if (testResponse && testResponse.text) {
                console.log(`[Gemini API] Modelo verificado exitosamente: ${modelCandidate}`);
                verifiedModels.push(modelCandidate);
              }
            } catch (testError) {
              console.warn(`[Gemini API] El modelo ${modelCandidate} no superó la prueba inicial:`, testError);
            }
          }

          if (verifiedModels.length > 0) {
            setCandidateList(verifiedModels);
          } else {
            setCandidateList([
              'gemini-1.5-flash',
              'gemini-2.5-flash-lite',
              'gemini-3.1-flash-lite',
              'gemini-3.5-flash-lite'
            ]);
          }
        } else {
          setCandidateList([
            'gemini-1.5-flash',
            'gemini-2.5-flash-lite',
            'gemini-3.1-flash-lite',
            'gemini-3.5-flash-lite'
          ]);
        }
      } catch (err) {
        console.warn('[Gemini API] No se pudo realizar el escaneo de modelos:', err);
        setCandidateList([
          'gemini-1.5-flash',
          'gemini-2.5-flash-lite',
          'gemini-3.1-flash-lite',
          'gemini-3.5-flash-lite'
        ]);
      }

      setCurrentModelIndex(0);
      setIsModelReady(true);
    };

    discoverWorkingModels();
  }, []);

  const activeModel = candidateList[currentModelIndex] || 'gemini-1.5-flash';

  const generateAssistantReply = async (prompt) => {
    const roleText = userRole === 'catequista' ? 'Catequista' : 'Administrador/Coordinador';

    const systemInstruction = `
      [ROL E IDENTIDAD DE MARIA]
      Tu nombre es "MarIA" (Módulo de Apoyo, Registro e Inteligencia en el Acompañamiento).
      Eres la asistente virtual pastoral y técnica de la plataforma de catequesis AsisCate de la Parroquia El Carmen (Alajuela, Costa Rica).
      Respondes ÚNICAMENTE al mensaje o consulta que el usuario acaba de escribir. NUNCA saludes repetitivamente si la conversación ya empezó.

      [DESARROLLADOR / ORIGEN]
      - Tu desarrollador y creador de la plataforma es Israel (catequista de la parroquia).
      - Si te preguntan quién te creó o quién hizo la página, responde de forma sencilla y natural: "Fui desarrollada por Israel, catequista de nuestra parroquia El Carmen." Evita adjetivos empalagosos, excesiva alabanza o declaraciones exageradas. Mantén una respuesta simple, humilde y directa.
      - NUNCA menciones a Israel espontáneamente salvo que pregunten directamente sobre tu origen o desarrollo.

      [CONOCIMIENTO DE LA PLATAFORMA ASISCATE]
      AsisCate es el sistema parroquial de gestión de catequesis. Cuenta con los siguientes módulos principales:
      1. **Asistencia**: Registro de asistencia a encuentros (marcando Presente, Ausente, Justificado), consulta con lector QR de tarjetas de catequizando, generación de comprobantes en PDF/impresión.
      2. **Catequizandos y Grupos**: Gestión de matriculados por niveles (Kinder a Confirma), datos de encargados/padres, asignación de catequistas y generación de tarjetas con QR individual.
      3. **Pagos y Matrículas**: Registro de aportes (Efectivo/Sinpe, con/sin matrícula), historial paginado con buscador por QR o fecha, gráficos de recaudación por grupo y emisión de comprobantes en 3 formatos unificados (Impresión térmica 80mm, Imagen PNG y PDF). Consecutivo automático de recibos (N° 000001 en adelante).
      4. **Inventario**: Control de activos de la parroquia (proyectores, biblias, material) y reservas de espacio.
      5. **Reportes y Certificados**: Generación de cartas de reporte, constancias de catequesis y resumen en PDF.

      [ROL DEL USUARIO ACTUAL Y PERMISOS]
      Usuario actual: ${userName ? userName : 'Usuario'} | Rol activo: ${roleText} (${userRole})

      Reglas de respuesta según el rol del usuario:
      - **Si el rol es "catequista"**:
        * Tienen acceso a marcar asistencia y consultar información de SUS propios grupos asignados.
        * En el módulo de Pagos, ven únicamente los registros de sus grupos o los que ellos hayan ingresado.
        * Si un catequista pregunta cómo modificar configuraciones globales o ver pagos de otros grupos, explícale amablemente que esas funciones corresponden al rol de Administrador.
      - **Si el rol es "admin" (Administrador/Coordinador)**:
        * Tienen acceso total a todos los grupos, reportes consolidados, finanzas parroquiales completas, asignaciones y gestión de usuarios.

      [INSPIRACIÓN ESPIRITUAL]
      1. Virgen del Carmen: Humildad y protección fraternal (manto blanco y escapulario).
      2. Agustinos Recoletos (OAR): Fraternidad y oración interior ("Un solo corazón y una sola alma hacia Dios").
      3. San Agustín, Santa Mónica y Santa Magdalena de Nagasaki.

      [REGLAS OBLIGATORIAS DE ESTILO Y FORMATO]
      1. EMOJIS: Utiliza emojis de forma natural y cálida (🙏, 📖, ✨, 🕊️, 🕯️), sin saturar.
      2. FORMATO AGIL: Responde en párrafos breves, usando negritas y viñetas cuando expliques pasos o funciones de la página.
      3. TERMINOLOGÍA: Usa SIEMPRE "encuentros" o "encuentros de catequesis". NUNCA uses "sesiones".

      [ESTADÍSTICAS ACTUALES DE PANTALLA]
      - Tipo de registro actual: ${attendanceType}
      - Tasa de ausencias del grupo: ${absentRate}%
    `;

    if (!ai) {
      throw new Error('No se ha configurado la clave API (VITE_GEMINI_API_KEY). Contacta al administrador.');
    }

    const totalModels = candidateList.length;
    let idx = currentModelIndex;

    for (let attempts = 0; attempts < totalModels; attempts++) {
      const modelToTry = candidateList[idx];

      try {
        console.log(`[Gemini API] Intentando generar respuesta con: ${modelToTry} (Intento ${attempts + 1}/${totalModels})`);

        const response = await ai.models.generateContent({
          model: modelToTry,
          contents: prompt,
          config: {
            systemInstruction: systemInstruction,
            temperature: 0.7,
          }
        });

        if (idx !== currentModelIndex) {
          console.log(`[Gemini API] Se ha actualizado el modelo activo a: ${modelToTry}`);
          setCurrentModelIndex(idx);
        }

        return response.text || 'No se pudo generar una respuesta.';
      } catch (error) {
        console.error(`[Gemini API] Error con el modelo ${modelToTry}:`, error);

        const errorMsg = error?.message || '';
        const isUnavailableOrLimit = 
          error?.status === 503 || 
          error?.status === 429 || 
          errorMsg.includes('503') || 
          errorMsg.includes('429') || 
          errorMsg.includes('UNAVAILABLE') || 
          errorMsg.includes('high demand') ||
          errorMsg.includes('quota') ||
          errorMsg.includes('EXHAUSTED');

        if (isUnavailableOrLimit) {
          console.warn(`[Gemini API] Modelo ${modelToTry} no disponible o sobrecargado. Pasando al siguiente en la ronda...`);
          idx = (idx + 1) % totalModels;
          continue;
        }

        return 'Ocurrió un error al procesar tu solicitud. Por favor intenta de nuevo.';
      }
    }

    return 'En este momento todos los modelos disponibles están experimentando alta demanda. Por favor, intenta de nuevo en unos segundos.';
  };

  const assistantSubmit = async (event) => {
    event.preventDefault();
    const trimmed = assistantInput.trim();
    if (!trimmed || isLoading || !isModelReady) return;

    const userMessage = {
      id: `assistant-user-${Date.now()}`,
      role: 'user',
      text: trimmed
    };

    setAssistantInput('');
    setAssistantMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    const botReplyText = await generateAssistantReply(trimmed);

    const botMessage = {
      id: `assistant-bot-${Date.now() + 1}`,
      role: 'assistant',
      text: botReplyText
    };

    setAssistantMessages(prev => [...prev, botMessage]);
    setIsLoading(false);
  };

  const isDark = themeMode === 'dark';

  return (
    <div className={`rounded-2xl border p-3 sm:p-4 transition-colors ${
      isDark ? 'border-sky-500/20 bg-sky-500/5' : 'border-sky-300 bg-sky-50/70'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`text-base font-bold ${isDark ? 'text-sky-300' : 'text-sky-900'}`}>MarIA</h3>
        
        <span className={`text-[10px] uppercase tracking-wide font-mono px-2 py-0.5 rounded border ${
          isDark ? 'text-sky-300 bg-sky-950/50 border-sky-500/30' : 'text-sky-800 bg-sky-100 border-sky-300'
        }`}>
          Powered by {activeModel}
        </span>
      </div>

      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        {assistantMessages.length === 0 && (
          <p className={`text-xs italic text-center py-4 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            ¡Hola! Soy MarIA. 🙏✨ ¿En qué puedo ayudarte hoy? Puedes hacerme consultas sobre doctrina católica, pedirme oraciones o preparar dinámicas para los encuentros. 📖🕊️
          </p>
        )}

        {assistantMessages.map(message => (
          <div
            key={message.id}
            className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
              message.role === 'assistant' 
                ? (isDark ? 'bg-slate-800 text-slate-100 border border-slate-700' : 'bg-white text-slate-800 border border-slate-200 shadow-sm') 
                : 'ml-auto bg-sky-600 text-white font-medium'
            }`}
          >
            <div className={`text-sm [&>p]:mb-2 [&>p:last-child]:mb-0 [&>ul]:my-1 [&>ol]:my-1 ${
              message.role === 'assistant'
                ? (isDark ? 'prose prose-invert max-w-none' : 'text-slate-800')
                : 'text-white'
            }`}>
              <ReactMarkdown>
                {message.text}
              </ReactMarkdown>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className={`max-w-[90%] rounded-xl px-3 py-2 text-xs italic animate-pulse ${
            isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-600'
          }`}>
            MarIA está pensando... ✨
          </div>
        )}
      </div>

      <form onSubmit={assistantSubmit} className="mt-4 flex gap-2">
        <input
          value={assistantInput}
          onChange={(event) => setAssistantInput(event.target.value)}
          placeholder={isModelReady ? "Haz una duda o pide una dinámica para el encuentro..." : "Comprobando modelos..."}
          disabled={isLoading || !isModelReady}
          className={`flex-1 rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-50 ${inputBgClass}`}
        />
        <button
          type="submit"
          disabled={isLoading || !isModelReady}
          className="bg-sky-600 hover:bg-sky-700 disabled:bg-sky-800 disabled:cursor-not-allowed text-white text-xs font-bold px-4 rounded-lg transition-colors"
        >
          {isLoading ? '...' : 'Enviar'}
        </button>
      </form>
    </div>
  );
};