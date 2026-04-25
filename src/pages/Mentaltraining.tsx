import { useState, useMemo } from 'react';
import { Lightbulb, Target, ArrowRight } from 'lucide-react';
import { SkillType } from '@/types';

const DAILY_TIPS: Record<SkillType, { quote: string, tip: string, exercise: string }[]> = {
  Fitness: [
    {
      quote: "Der Körper ist der wahre Tempel.",
      tip: "Wechsle zwischen intensiven Phasen und aktiver Erholung. Dein Körper wächst in den Ruhephasen.",
      exercise: "Mache heute 5 Minuten Gelenkmobilitätsübungen (Armkreisen, Hüftrotation), bevor du den Tag startest."
    },
    {
      quote: "Was gemessen wird, wird gemanagt.",
      tip: "Achte nicht nur auf das Training, sondern auf mindestens 2 Liter Wasser pro Tag. Hydration ist 50% der Ausdauer.",
      exercise: "Trinke direkt nach dem Aufstehen ein großes Glas Wasser. Baue 20 Kniebeugen zwischendurch ein."
    },
    {
      quote: "Ein starker Körper trägt einen starken Geist.",
      tip: "Ersetze den Fahrstuhl heute durch die Treppe und schöpfe frische Luft in deiner Mittagspause.",
      exercise: "Versuche einen 15-minütigen Spaziergang ohne Musik oder Podcasts zu machen. Fokussiere dich auf deinen Körper."
    }
  ],
  Fokus: [
    {
      quote: "Konzentration ist ein Muskel.",
      tip: "Multitasking ist ein Mythos, der dich 40% deiner Produktivität kostet. Arbeite in 25-Minuten Sprints (Pomodoro).",
      exercise: "Wähle heute EINE Aufgabe aus. Schalte das Handy für 25 Minuten in den Flugmodus und arbeite nur daran."
    },
    {
      quote: "Wo die Aufmerksamkeit hingeht, fließt die Energie.",
      tip: "Dein Gehirn braucht Dopamin-Pausen. Schau nicht direkt nach der Arbeit auf dein Handy.",
      exercise: "Mache heute eine 10-minütige analoge Pause. Kein Bildschirm, nur aus dem Fenster schauen."
    },
    {
      quote: "Klarheit kommt von Reduktion.",
      tip: "Eine aufgeräumte Umgebung führt zu einem aufgeräumten Geist. Räume deinen Schreibtisch auf.",
      exercise: "Räume deinen direkten Arbeitsbereich für 5 Minuten auf, bevor du in den Fokus-Modus gehst."
    }
  ],
  Disziplin: [
    {
      quote: "Motivation lässt dich starten, Disziplin lässt dich weitermachen.",
      tip: "Verlasse dich nicht auf Willenskraft. Baue dir Systeme und Routinen auf, die gutes Verhalten automatisch machen.",
      exercise: "Bereite heute Abend schon alles vor, was du morgen früh brauchst (Kleidung, Sporttasche)."
    },
    {
      quote: "Wer den weichen Weg wählt, hat ein hartes Leben.",
      tip: "Mach das Unbequeme zuerst. 'Eat the Frog' - erledige die wichtigste Aufgabe gleich morgens.",
      exercise: "Welche Aufgabe schiebst du vor dir her? Mache sie heute für exakt 5 Minuten. Oft reicht der Startschuss."
    },
    {
      quote: "Konsistenz schlägt Intensität.",
      tip: "Es ist besser, jeden Tag 1% besser zu werden, als einmal 50% und dann wieder aufzugeben.",
      exercise: "Wähle eine winzige Gewohnheit (z.B. ein Glas Wasser trinken) und klebe sie an ein bestehendes Ritual (z.B. Zähneputzen)."
    }
  ],
  Wissen: [
    {
      quote: "Investitionen in Wissen bringen die besten Zinsen.",
      tip: "Lese nicht nur, sondern wende an. Die wahre Meisterschaft liegt in der Ausführung des Gelernten.",
      exercise: "Nimm das letzte Buch oder den letzten Podcast auf und schreibe 3 konkrete To-Dos auf, die du umsetzen willst."
    },
    {
      quote: "Ein Anfängergeist sieht viele Möglichkeiten.",
      tip: "Geh mit der Einstellung in den Tag, dass du von jedem Menschen etwas Neues lernen kannst.",
      exercise: "Erkläre heute ein Konzept, das du neu gelernt hast, einer anderen Person so einfach wie möglich."
    },
    {
      quote: "Wissen ist nur potentielle Macht.",
      tip: "Verbinde neue Fakten mit Dingen, die du bereits weißt. Dies stärkt neuroplastische Verbindungen.",
      exercise: "Widme heute Abend 10 Minuten dem Journaling: Was ist das Wichtigste, das du heute gelernt hast?"
    }
  ],
  Soziales: [
    {
      quote: "Die Qualität deines Lebens hängt von der Qualität deiner Beziehungen ab.",
      tip: "Sei interessiert, nicht interessant. Stelle mehr Fragen und höre aktiv zu, ohne deine eigene Antwort zu planen.",
      exercise: "Melde dich heute proaktiv bei einer Person, mit der du schon länger nicht mehr gesprochen hast."
    },
    {
      quote: "Wir sind der Durchschnitt der 5 Menschen um uns herum.",
      tip: "Umgib dich mit Leuten, die dich hochziehen und die ähnliche Visionen haben wie du.",
      exercise: "Mache jemandem heute ein völlig unerwartetes, ehrliches Kompliment."
    },
    {
      quote: "Verletzlichkeit ist keine Schwäche, sondern Mut.",
      tip: "Tiefe Verbindungen entstehen, wenn man die Fassade fallen lässt. Trau dich auch mal 'Ich weiß nicht' zu sagen.",
      exercise: "Teile heute beim Abendessen oder in einem Meeting eine kleine Herausforderung, mit der du aktuell kämpfst."
    }
  ]
};

// Seeded random number generator
function sfc32(a: number, b: number, c: number, d: number) {
  return function() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; 
    let t = (a + b) | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = (c << 21 | c >>> 11);
    d = d + 1 | 0;
    t = t + d | 0;
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  }
}

function getDailyIndices(seed: number) {
  const rand = sfc32(seed, seed * 2, seed * 3, seed * 4);
  return {
    Fitness: Math.floor(rand() * DAILY_TIPS.Fitness.length),
    Fokus: Math.floor(rand() * DAILY_TIPS.Fokus.length),
    Disziplin: Math.floor(rand() * DAILY_TIPS.Disziplin.length),
    Wissen: Math.floor(rand() * DAILY_TIPS.Wissen.length),
    Soziales: Math.floor(rand() * DAILY_TIPS.Soziales.length),
  };
}

export function Mentaltraining({ setActiveTab }: { setActiveTab: (tab: string) => void }) {
  const [currentDate] = useState(() => new Date());

  const dailyIndices = useMemo(() => {
    // Generate a unique seed for the current day (E.g. 20260423)
    const seed = currentDate.getFullYear() * 10000 + (currentDate.getMonth() + 1) * 100 + currentDate.getDate();
    return getDailyIndices(seed);
  }, [currentDate]);

  const skillKeys: SkillType[] = ['Fitness', 'Fokus', 'Disziplin', 'Wissen', 'Soziales'];

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-8">
        <h2 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <Lightbulb className="w-8 h-8 text-amber-400" />
          Mentaltraining
        </h2>
        <p className="text-neutral-400 leading-relaxed">
          Tägliche Impulse für deinen Geist. Hier findest du jeden Tag neue Beratungen, Zitate und konkrete 
          Übungsvorschläge für jede deiner Skill-Kategorien. Setze sie um, um schneller aufzusteigen.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {skillKeys.map((skill) => {
          const index = dailyIndices[skill];
          const tipData = DAILY_TIPS[skill][index];
          
          return (
            <div key={skill} className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 relative overflow-hidden group hover:border-amber-500/30 transition-colors">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full">
                  {skill}
                </span>
              </div>
              
              <blockquote className="text-lg font-medium text-white mb-4 italic">
                "{tipData.quote}"
              </blockquote>
              
              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-neutral-400 mb-1 flex items-center gap-2">
                    <Target className="w-4 h-4" /> Insight
                  </h4>
                  <p className="text-neutral-300 text-sm leading-relaxed">
                    {tipData.tip}
                  </p>
                </div>
                
                <div className="bg-amber-500/5 block border border-amber-500/20 rounded-2xl p-4">
                  <h4 className="text-sm font-semibold text-amber-500 mb-1">🔥 Übung des Tages</h4>
                  <p className="text-neutral-200 text-sm">
                    {tipData.exercise}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-3xl p-6 text-center mt-12 flex flex-col items-center">
        <h3 className="text-xl font-bold text-white mb-2">Bereit für die Umsetzung?</h3>
        <p className="text-neutral-400 text-sm max-w-md mx-auto mb-6">
          Nutze diese Impulse, um direkt in Aktion zu treten. Erstelle eine neue Quest oder arbeite an deinen bestehenden Lebenszielen.
        </p>
        <button 
          onClick={() => setActiveTab('quests')}
          className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
        >
          Zu den Quests <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
