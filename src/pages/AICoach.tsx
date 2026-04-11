import { useState } from 'react';
import { useStore } from '@/store/useStore';
import { Sparkles, Send, Loader2 } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import ReactMarkdown from 'react-markdown';

export function AICoach() {
  const { stats, quests, addQuest } = useStore();
  const [messages, setMessages] = useState<{role: 'user' | 'coach', content: string}[]>([
    { role: 'coach', content: "Sei gegrüßt, Held. Ich bin dein KI-Coach. Ich habe deine Statistiken analysiert. Wie kann ich dir heute auf deiner Reise helfen?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const systemPrompt = `You are an AI Coach in a Self-Improvement RPG app. 
The user is a "Hero" leveling up their life.
Current Stats:
Level: ${stats.level}
XP: ${stats.xp}/${stats.xpToNextLevel}
Skills: ${JSON.stringify(stats.skills)}
Active Quests: ${JSON.stringify(quests.filter(q => !q.completed).map(q => q.title))}

Provide concise, motivating, and actionable advice. Speak like a wise mentor or RPG guide. Suggest specific quests if appropriate.
IMPORTANT: Respond in GERMAN. Use "Du" to address the user.
You have the ability to create quests for the user using the createQuest tool. Use it when the user explicitly asks you to create a quest, or when they agree to a quest you suggested.`;

      const createQuestDeclaration = {
        name: "createQuest",
        description: "Erstellt eine neue Quest für den Benutzer. Verwende dies, wenn der Benutzer dich bittet, eine Quest zu erstellen, oder wenn du eine vorschlägst und er zustimmt.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: "Der Titel der Quest (kurz und prägnant)."
            },
            description: {
              type: Type.STRING,
              description: "Eine detaillierte Beschreibung der Quest."
            },
            skill: {
              type: Type.STRING,
              description: "Der Skill, der trainiert wird. Muss einer dieser Werte sein: Fitness, Fokus, Disziplin, Wissen, Soziales.",
              enum: ["Fitness", "Fokus", "Disziplin", "Wissen", "Soziales"]
            },
            xpReward: {
              type: Type.INTEGER,
              description: "Die EP-Belohnung (z.B. 10 für einfach, 20 für normal, 50 für schwer)."
            },
            type: {
              type: Type.STRING,
              description: "Der Typ der Quest. 'daily' für einmalige oder tägliche Aufgaben, 'habit' für Gewohnheiten.",
              enum: ["daily", "habit"]
            }
          },
          required: ["title", "description", "skill", "xpReward", "type"]
        }
      };

      const history: any[] = messages.map(msg => ({
        role: msg.role === 'coach' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));
      history.push({ role: 'user', parts: [{ text: userMsg }] });

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: history,
        config: {
          systemInstruction: systemPrompt,
          tools: [{ functionDeclarations: [createQuestDeclaration] }]
        }
      });

      if (response.functionCalls && response.functionCalls.length > 0) {
        const call = response.functionCalls[0];
        if (call.name === 'createQuest') {
          const args = call.args as any;
          addQuest({
            title: args.title,
            description: args.description,
            skill: args.skill,
            xpReward: args.xpReward,
            type: args.type,
            ...(args.type === 'habit' ? { habitDirection: 'positive' } : {})
          });
          
          const followUpResponse = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [
              ...history,
              { role: 'model', parts: [{ functionCall: call }] },
              { role: 'user', parts: [{ functionResponse: { name: 'createQuest', response: { success: true } } }] }
            ],
            config: {
              systemInstruction: systemPrompt,
              tools: [{ functionDeclarations: [createQuestDeclaration] }]
            }
          });
          
          setMessages(prev => [...prev, { role: 'coach', content: followUpResponse.text || "Die Quest wurde erfolgreich erstellt!" }]);
        }
      } else {
        setMessages(prev => [...prev, { role: 'coach', content: response.text || "Ich denke über deinen Pfad nach..." }]);
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'coach', content: "Die Verbindung zum Orakel wurde unterbrochen. Bitte überprüfe deinen API-Key und versuche es erneut." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-4rem)]">
      <header className="mb-6 flex-shrink-0">
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Sparkles className="w-8 h-8 text-amber-500" />
          Orakel-Coach
        </h2>
        <p className="text-neutral-400">Suche Rat für deine Reise</p>
      </header>

      <div className="flex-1 bg-neutral-900 border border-neutral-800 rounded-2xl flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl p-4 ${
                msg.role === 'user' 
                  ? 'bg-amber-500 text-neutral-950 rounded-tr-sm' 
                  : 'bg-neutral-800 text-neutral-100 rounded-tl-sm'
              }`}>
                {msg.role === 'coach' ? (
                  <div className="markdown-body prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p>{msg.content}</p>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-neutral-800 text-neutral-100 rounded-2xl rounded-tl-sm p-4 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm text-neutral-400">Das Orakel wird befragt...</span>
              </div>
            </div>
          )}
        </div>
        
        <form onSubmit={handleSend} className="p-4 bg-neutral-950 border-t border-neutral-800 flex gap-2">
          <input 
            type="text" 
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Frage nach Rat oder einer neuen Quest..."
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-amber-500"
          />
          <button 
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-amber-500 text-neutral-950 p-3 rounded-xl font-bold hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
