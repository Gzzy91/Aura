import { useState, useMemo } from 'react';
import { Lightbulb, Target, ArrowRight, Brain, Dumbbell, BookOpen, Shield, Activity, Moon, Dna } from 'lucide-react';
import { SkillType } from '@/types';
import { cn } from '@/lib/utils';

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

const DEEP_TRAINings = [
  {
    id: 'neuro',
    title: 'Die Psychologie der Gewohnheiten',
    category: 'Disziplin & Fokus',
    icon: Brain,
    content: `
      ### Der Habit-Loop
      Als Psychologe sehe ich täglich, wie Menschen gegen ihre eigene Biologie ankämpfen. Willenskraft ist eine endliche Ressource – sie verbraucht sich über den Tag. Die Lösung liegt in der "**Neuroplastizität**" und dem Habit-Loop (Auslöser -> Routine -> Belohnung).
      
      **1. Der Auslöser (Trigger)**
      Mache den Auslöser deiner gewünschten Gewohnheit offensichtlich. Willst du mehr lesen? Lege das Buch auf dein Kopfkissen. Willst du joggen? Stelle die Laufschuhe direkt vor die Tür. 
      
      **2. Die Routine (Verhalten)**
      Mache die Aktion lächerlich einfach. Die 2-Minuten-Regel besagt: Skaliere jede neue Gewohnheit auf 2 Minuten herunter. "Ich lese ein Kapitel" wird zu "Ich lese eine Seite". Es geht darum, die Identität aufzubauen, nicht sofort die Leistung zu erbringen.
      
      **3. Die Belohnung**
      Dein Gehirn lernt durch Dopamin. Belohne dich sofort nach der Ausführung. Ein einfaches Abstreichen auf einer Checkliste (wie in dieser App!) schüttet bereits Dopamin aus und signalisiert dem Gehirn: "Das war gut, lass uns das wiederholen."
      
      **Reflexionsaufgabe:** Welchen Trigger in deinem Alltag kannst du mit einer neuen Verhaltensweise koppeln? (z.B. "Nachdem ich mir den Kaffee einschenke, mache ich 10 Kniebeugen.")
    `
  },
  {
    id: 'hypertrophy',
    title: 'Progressive Overload & ZNS-Regeneration',
    category: 'Fitness',
    icon: Dumbbell,
    content: `
      ### Das Stress-Anpassungs-Modell
      Muskulatur baut sich nicht im Training auf, sondern in der Erholungsphase. Dein Körper adaptiert sich an einen Reiz, der ihn überfordert hat.
      
      **1. Progressive Overload (Progressive Überlastung)**
      Wenn du in jedem Training das exakt gleiche Gewicht für die gleiche Wiederholungszahl bewegst, hat dein Körper keinen Grund, Muskeln aufzubauen. Du musst versuchen, dich systematisch in kleinen Schritten zu steigern (mehr Gewicht, eine Wiederholung mehr, saubereres Tempo, kürzere Pausen).
      
      **2. Die Rolle des zentralen Nervensystems (ZNS)**
      Heavy Lifting ermüdet nicht nur den Muskel, sondern dein ZNS. Ständige Erschöpfung (Ausbrennen) führt zu Leistungsabfall und Lethargie. Lerne Intuitiv zu trainieren oder implementiere Deload-Wochen alle 4-8 Wochen, in denen du Volumen und Intensität drosselst.
      
      **3. Ernährung als Baumaterial**
      Ohne ausreichend Protein (Baustoff) und Energie (Kalorienüberschuss oder -erhalt) nützt der beste Trainingsreiz nichts. Arbeite mit 1.6g bis 2.2g Protein pro Kilogramm Körpergewicht.
      
      **Dein Coaching-Auftrag:** Tracke nicht nur dein Training, sondern auch deine Schlafqualität und Energielevels. Sie sind die besten Indikatoren für deine Regeneration.
    `
  },
  {
    id: 'stoicism',
    title: 'Emotionale Resilienz & Stoizismus',
    category: 'Soziales & Wissen',
    icon: Shield,
    content: `
      ### Die Dichotomie der Kontrolle
      Eines der mächtigsten psychologischen Konzepte zur Stressreduktion stammt aus der antiken Stoa: Die Dichotomie der Kontrolle. 
      
      Wir leiden fast ausschließlich, weil wir versuchen, Dinge zu kontrollieren, die außerhalb unserer Macht liegen (die Meinung anderer, das Wetter, das Verhalten unserer Kollegen, die Vergangenheit).
      
      **1. Was du kontrollieren kannst:**
      Deine Reaktion, deine Bemühungen, deine Werte, deine Entscheidungen.
      
      **2. Das Prinzip der "Amor Fati" (Liebe das Schicksal)**
      Akzeptiere nicht nur, was passiert, sondern umarme es als Gelegenheit zum Wachstum. Wenn dir ein Hindernis in den Weg gelegt wird, ist das Hindernis der Weg. Hast du eine Beförderung nicht bekommen? Dies ist deine Möglichkeit, Demut, Geduld und harte Arbeit zu kultivieren.
      
      **3. Negative Visualisierung (Premeditatio Malorum)**
      Stelle dir gelegentlich vor, Dinge zu verlieren, die du liebst. Das klingt makaber, aber es impft dich gegen Enttäuschungen und erzeugt vor allem eines: Tiefe Dankbarkeit für den jetzigen Moment.
      
      **Dein Coaching-Auftrag:** Wenn du das nächste Mal wütend oder gestresst bist, frage dich: "Ist das in meiner direkten Kontrolle?" Wenn nein, atme tief ein und lass es geistig los.
    `
  },
  {
    id: 'bodylanguage',
    title: 'Embodied Cognition & Körpersprache',
    category: 'Soziales & Fokus',
    icon: Activity,
    content: `
      ### Die Neurowissenschaft der Haltung
      Die Forschung zur "Embodied Cognition" beweist: Unser Gehirn ist nicht isoliert, sondern denkt mit dem gesamten Körper. Wie wir uns bewegen und stehen, verändert nicht nur, wie andere uns sehen, sondern direkt unsere eigene Gehirnchemie.
      
      **1. Das propriozeptive Feedback-System**
      Dein Gehirn liest ständig die Spannung deiner Muskeln ab, um auf deinen emotionalen Zustand zu schließen. Eine eingesunkene Haltung mit hängenden Schultern signalisiert dem Gehirn "Niederlage" oder "Bedrohung", was die Ausschüttung von Cortisol (Stresshormon) begünstigt. 
      
      **2. Offene Expansion (Power Poses)**
      Auch wenn die frühe Forschung von Amy Cuddy debattiert wurde, zeigen neuere Meta-Analysen: Eine offene, expansive Körperhaltung über nur 2 Minuten (Brust raus, Schultern zurück, Blick nach vorne) senkt die subjektive Stresswahrnehmung und erhöht die Risikobereitschaft und das Gefühl von Handlungsfähigkeit (Agency).
      
      **3. Der Vagus-Nerv und Mikro-Expressions**
      Der Vagusnerv verbindet Gehirn, Herz und Darm. Eine ruhige, tiefe Bauchatmung und offene Gesichtsmimik (Entspannung der Kiefer- und Augenmuskulatur) aktivieren den ventralen Vaguskomplex (Social Engagement System). Du strahlst Sicherheit aus, weil dein Nervensystem buchstäblich im "Sicherheits-Modus" ist – was über Spiegelneuronen sofort dein Gegenüber beruhigt.
      
      **Dein Coaching-Auftrag:** Achte heute bewusst auf deinen Nacken und deine Schultern, wenn du am Handy bist ("Tech-Neck"). Richte dich auf, atme dreimal tief in den Bauch und spüre, wie sich dein mentaler Zustand allein durch die biomechanische Anpassung verändert.
    `
  },
  {
    id: 'sleep',
    title: 'Zirkadianer Rhythmus & Schlafarchitektur',
    category: 'Fitness & Disziplin',
    icon: Moon,
    content: `
      ### Die Basis jeglicher Leistung
      Nach dem aktuellsten Stand der Schlafforschung (z.B. Dr. Matthew Walker, Stanford's Andrew Huberman) ist Schlaf keine Ruhepause, sondern ein hochaktiver neurologischer und metabolischer Prozess. Ohne optimierten Schlaf ist jegliches Mentaltraining wirkungslos.
      
      **1. Die Cortisol-Melatonin-Wippe**
      Dein Wach-Schlaf-Rhythmus wird durch Licht gesteuert. Morgendliches Sonnenlicht in den Augen (innerhalb von 30-60 Minuten nach dem Aufwachen) setzt einen Timer für die Melatoninausschüttung 14-16 Stunden später und gibt den evolutionären Startschuss für gesundes Cortisol (Wachheit/Fokus). Verpasst du dieses Signal, verschiebt sich deine innere Uhr.
      
      **2. Das glymphatische System**
      Nur im Tiefschlaf (Slow-Wave-Sleep) öffnet sich das glymphatische System in deinem Gehirn und wäscht neurotoxische Abfallprodukte aus. Ein Mangel an Tiefschlaf (oft durch abendlichen Alkohol oder zu spätes Essen) blockiert diese Gehirnwäsche.
      
      **3. REM-Schlaf als emotionale Therapie**
      Während der REM-Phase (Traumschlaf) verarbeitet das Gehirn emotionale Erlebnisse in einer noradrenalin-freien (stressfreien) Umgebung. Es ist eine nächtliche Therapie-Sitzung. Da REM-Schlaf stark in der zweiten Nachthälfte kumuliert, verlierst du bei Verknappung von 8 auf 6 Stunden Schlaf nicht 25% deines Schlafs, sondern bis zu 60-70% deiner REM-Phasen!
      
      **Dein Coaching-Auftrag:** Trinke kein Koffein mehr nach 14 Uhr (Halbwertszeit von Koffein bindet Adenosin-Rezeptoren zu lange) und gehe 3 Tage lang exakt zur gleichen Zeit ins Bett.
    `
  },
  {
    id: 'gutbrain',
    title: 'Darm-Hirn-Achse (Psychobiom)',
    category: 'Wissen & Fitness',
    icon: Dna,
    content: `
      ### Ernährungspsychiatrie der Zukunft
      Die Trennung zwischen Körper und Geist ist in der modernen Forschung obsolet. Das Epizentrum deiner mentalen Gesundheit und Resilienz liegt nicht nur im Kopf, sondern zu einem Großteil in deinem Darm.
      
      **1. Das Mikrobiom als Neurotransmitter-Fabrik**
      Über 90% des Serotonins (Glückshormon) und 50% des Dopamins in deinem Körper werden im Darmtrakt gebildet – gesteuert durch Billionen von Darmbakterien. Ein dysbiotisches Mikrobiom (durch hochverarbeitete Lebensmittel, Zucker und Stress) sendet über den Vagusnerv Alarmsignale, was sich unmittelbar als "Brain Fog", innere Unruhe oder mangelnder Antrieb äußert.
      
      **2. Neuroinflammation (Die Stille Zündung)**
      Modernste Psychiatriestudien zeigen: Depressive Verstimmungen und chronische Müdigkeit sind stark mit Entzündungsprozessen verknüpft. Eine Ernährung reich an Omega-3-Fettsäuren (Fisch, Alken), Polyphenolen (Beeren, Olivenöl) und Ballaststoffen senkt Entzündungsmarker (wie Zytokine) messbar ab und schützt das Gehirn.
      
      **3. Blutzucker und der Kognitive Crash**
      Extreme Glukose-Spitzen (z.B. durch Croissants oder Smoothies auf nüchternen Magen) und die daraus folgenden Abstürze ruinieren deinen Fokus. Eine Stabilisierung deines Blutzuckers durch herzhafte, proteinreiche erste Mahlzeiten ist der effektivste Hebel für konstante mentale Energie und um "Heißhunger-Entscheidungen" vorzubeugen.
      
      **Dein Coaching-Auftrag:** Integriere heute bewusst prä- oder probiotische Lebensmittel (z.B. Kefir, Kimchi oder reichlich pflanzliche Ballaststoffe) und starte den Tag proteinreich (ca. 30g), um den Blutzucker für die ersten Arbeitsstunden wie auf Schienen fahren zu lassen.
    `
  }
];

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

// Markdown-ähnliches Rendering für einfache Strings
function renderMarkdown(text: string) {
  return text.split('\n').map((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('### ')) {
      return <h3 key={index} className="text-xl font-bold text-white mt-6 mb-3">{trimmed.replace('### ', '')}</h3>;
    }
    if (trimmed.startsWith('**') && trimmed.endsWith('**') && !trimmed.slice(2, -2).includes('**')) {
      return <p key={index} className="font-bold text-amber-500 mt-4 mb-2">{trimmed.slice(2, -2)}</p>;
    }
    
    // Inline bold formatting
    let parsedLine = trimmed;
    const parts = [];
    let boldMatch;
    let keyCounter = 0;
    
    while ((boldMatch = /\*\*(.*?)\*\*/.exec(parsedLine)) !== null) {
      if (boldMatch.index > 0) {
        parts.push(<span key={`text-${keyCounter++}`}>{parsedLine.slice(0, boldMatch.index)}</span>);
      }
      parts.push(<strong key={`bold-${keyCounter++}`} className="text-amber-500">{boldMatch[1]}</strong>);
      parsedLine = parsedLine.slice(boldMatch.index + boldMatch[0].length);
    }
    if (parsedLine.length > 0) {
      parts.push(<span key={`text-${keyCounter++}`}>{parsedLine}</span>);
    }
    
    return trimmed ? <p key={index} className="text-neutral-300 mb-2 leading-relaxed">{parts}</p> : <br key={index} />;
  });
}

export function Mentaltraining({ setActiveTab }: { setActiveTab: (tab: string) => void }) {
  const [currentDate] = useState(() => new Date());
  const [activeSubTab, setActiveSubTab] = useState<'impulse' | 'tiefentraining'>('impulse');
  const [expandedTraining, setExpandedTraining] = useState<string | null>(null);

  const dailyIndices = useMemo(() => {
    // Generate a unique seed for the current day (E.g. 20260423)
    const seed = currentDate.getFullYear() * 10000 + (currentDate.getMonth() + 1) * 100 + currentDate.getDate();
    return getDailyIndices(seed);
  }, [currentDate]);

  const skillKeys: SkillType[] = ['Fitness', 'Fokus', 'Disziplin', 'Wissen', 'Soziales'];

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="mb-6">
        <h2 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
          <Lightbulb className="w-8 h-8 text-amber-400" />
          Mentaltraining
        </h2>
        <p className="text-neutral-400 leading-relaxed">
          Tägliche Impulse für deinen Geist und detaillierte psychologische Konzepte für langfristiges Wachstum. 
          Dein persönlicher Coach für Mindset und Performance.
        </p>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-neutral-900 rounded-xl max-w-sm mb-6 border border-neutral-800">
        <button
          onClick={() => setActiveSubTab('impulse')}
          className={cn(
            "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
            activeSubTab === 'impulse' 
              ? "bg-amber-500 text-black shadow-md shadow-amber-500/20" 
              : "text-neutral-400 hover:text-white"
          )}
        >
          Daily Impulse
        </button>
        <button
          onClick={() => setActiveSubTab('tiefentraining')}
          className={cn(
            "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
            activeSubTab === 'tiefentraining' 
              ? "bg-amber-500 text-black shadow-md shadow-amber-500/20" 
              : "text-neutral-400 hover:text-white"
          )}
        >
          Tiefentraining
        </button>
      </div>

      {activeSubTab === 'impulse' && (
        <div className="animate-in fade-in duration-300">
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
      )}

      {activeSubTab === 'tiefentraining' && (
        <div className="animate-in fade-in duration-300 space-y-6">
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6">
             <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
               <BookOpen className="w-6 h-6 text-blue-400" />
               Die Coach-Bibliothek
             </h3>
             <p className="text-neutral-400 text-sm leading-relaxed mb-6">
               Als dein mentaler und physischer High-Performance Coach habe ich hier die wichtigsten psychologischen, anatomischen und kognitiven Fundamente zusammengetragen. Diese Konzepte sind nicht nur Theorien, sondern mächtige Werkzeuge zur Transformation deiner Realität.
             </p>

             <div className="space-y-4">
               {DEEP_TRAINings.map(training => {
                 const isExpanded = expandedTraining === training.id;
                 const Icon = training.icon;
                 return (
                   <div key={training.id} className="border border-neutral-700 bg-neutral-950 rounded-2xl overflow-hidden transition-all duration-300">
                     <button 
                       onClick={() => setExpandedTraining(isExpanded ? null : training.id)}
                       className="w-full text-left p-5 flex items-center justify-between hover:bg-neutral-900/50 transition-colors"
                     >
                       <div className="flex items-center gap-4">
                         <div className="bg-neutral-800 p-3 rounded-xl">
                           <Icon className="w-6 h-6 text-amber-500" />
                         </div>
                         <div>
                           <div className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">{training.category}</div>
                           <h4 className="text-lg font-bold text-white">{training.title}</h4>
                         </div>
                       </div>
                       <div className={cn("text-neutral-400 transition-transform duration-300 transform", isExpanded ? "rotate-180" : "")}>
                         ▼
                       </div>
                     </button>
                     
                     {isExpanded && (
                       <div className="p-6 pt-2 border-t border-neutral-800 bg-neutral-900/30">
                         <div className="prose prose-invert max-w-none prose-p:text-neutral-300 prose-headings:text-white">
                           {renderMarkdown(training.content)}
                         </div>
                       </div>
                     )}
                   </div>
                 );
               })}
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
