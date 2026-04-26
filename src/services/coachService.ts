import { GoogleGenAI, Type } from '@google/genai';
import { DeepTraining } from '../types';

export async function generateDailyTraining(existingTitles: string[]): Promise<Omit<DeepTraining, 'id' | 'createdAt'>> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const systemPrompt = `You are a High-Performance AI Coach in a Self-Improvement RPG app called "LifeQuest".
Your task is to generate one new "Deep Training" module for the Coach Library.
It should cover advanced psychological, anatomical, or cognitive concepts.
It MUST be different from the following existing titles: ${existingTitles.join(", ")}.

Return your result using the "createDeepTraining" function.
The "category" must be one of: "Fitness", "Fokus", "Disziplin", "Wissen", "Soziales" or a combination (e.g., "Fokus & Disziplin").
The "iconName" must be one of: "Brain", "Dumbbell", "Shield", "Activity", "Moon", "Dna", "BookOpen".
The "content" should use markdown formatting with sections, bold text, and a final "Dein Coaching-Auftrag:" actionable task.
Write in GERMAN. Address the user as "Du".`;

  const createDeclaration = {
    name: "createDeepTraining",
    description: "Erstellt ein neues Training für die Coach-Bibliothek.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        category: { type: Type.STRING },
        iconName: { type: Type.STRING },
        content: { type: Type.STRING }
      },
      required: ["title", "category", "iconName", "content"]
    }
  };

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: "Erstelle ein neues Training.",
    config: {
      systemInstruction: systemPrompt,
      tools: [{ functionDeclarations: [createDeclaration] }]
    }
  });

  if (response.functionCalls && response.functionCalls.length > 0) {
    const args = response.functionCalls[0].args as any;
    return {
      title: args.title || "Erweiterte Fokus-Strategie",
      category: args.category || "Fokus",
      iconName: args.iconName || "Brain",
      content: args.content || "Hier ist dein neues Training."
    };
  }

  throw new Error("Fehler bei der Generierung des Trainings");
}
