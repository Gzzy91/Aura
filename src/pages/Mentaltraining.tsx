import { useState, useMemo, useEffect } from 'react';
import { Lightbulb, Target, ArrowRight, Brain, Dumbbell, BookOpen, Shield, Activity, Moon, Dna, History, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { SkillType } from '@/types';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import { generateDailyTraining } from '@/services/coachService';

const ICON_MAP: Record<string, React.ElementType> = {
  Brain, Dumbbell, Shield, Activity, Moon, Dna, BookOpen
};

const DAILY_TIPS: Record<SkillType, { quote: string, tip: string, exercise: string }[]> = {
  Fitness: [
    {
      quote: "Der Körper ist der wahre Tempel.",
      tip: "Wechsle zwischen intensiven Phasen und aktiver Erholung. Dein Körper wächst nicht während der Belastung, sondern in den darauffolgenden Ruhephasen durch Superkompensation. Achte auf Anzeichen von Übertraining wie Schlafstörungen oder erhöhten Ruhepuls.",
      exercise: "Mache heute 5-10 Minuten Gelenkmobilitätsübungen (Armkreisen, Hüftrotation, Katze-Kuh). Gehe dabei bis an die Grenze deiner Beweglichkeit, ohne Schmerz zu verursachen. Atme tief in die Dehnung hinein."
    },
    {
      quote: "Was gemessen wird, wird gemanagt.",
      tip: "Hydration ist die Basis zellulärer Energie. Schon 2% Flüssigkeitsverlust senken deine kognitive und physische Leistung massiv. Trinke mindestens 35ml Wasser pro Kilogramm Körpergewicht über den Tag verteilt.",
      exercise: "Trinke direkt nach dem Aufstehen 500ml lauwarmes Wasser mit einer Prise Meersalz (Elektrolyte). Baue über den Tag verteilt 3 Sätze à 15 Kniebeugen ein, um den Lymphfluss anzuregen."
    },
    {
      quote: "Ein starker Körper trägt einen starken Geist.",
      tip: "Kleine Bewegungsreize summieren sich (NEAT - Non-Exercise Activity Thermogenesis). Vertikale Bewegung (Treppen) aktiviert die großen Muskelgruppen deiner Beine und verbessert sofort die Durchblutung deines Gehirns.",
      exercise: "Ersetze heute JEDEN Fahrstuhl durch die Treppe. Mache in der Mittagspause einen 15-minütigen 'Silent Walk' ohne Handy. Achte dabei bewusst auf das Abrollen deiner Füße und die Spannung in deiner Körpermitte."
    }
  ],
  Fokus: [
    {
      quote: "Konzentration ist ein Muskel.",
      tip: "Multitasking ist ein kognitiver Kostentreiber. Dein Gehirn braucht bis zu 23 Minuten, um nach einer Ablenkung wieder die volle Tiefe (Flow) zu erreichen. Nutze die Time-Blocking-Methode für ununterbrochene Arbeitsphasen.",
      exercise: "Wähle eine komplexe Aufgabe. Schalte alle Benachrichtigungen aus, deponiere dein Handy in einem anderen Raum und stelle einen Timer auf 50 Minuten Deep Work. Mache danach 10 Minuten Pause OHNE Bildschirm."
    },
    {
      quote: "Wo die Aufmerksamkeit hingeht, fließt die Energie.",
      tip: "Dopamin-Detoxing ist essentiell für langanhaltenden Fokus. Reize wie Social Media oder ständige Nachrichten fluten deine Synapsen und machen dich blind für subtile, aber wichtige Aufgaben. Schütze die ersten 60 Minuten deines Tages vor digitalem Rauschen.",
      exercise: "Definiere heute eine 'Smartphone-freie Zone' (z.B. der Esstisch oder das Schlafzimmer). Verpflichte dich, in dieser Zone kein digitales Gerät zu nutzen und beobachte, wie dein Geist zur Ruhe kommt."
    },
    {
      quote: "Klarheit kommt von Reduktion.",
      tip: "Externe Ordnung schafft internen Fokus. Ein chaotischer Schreibtisch sendet ständig visuelle Alarmsignale an deine Amygdala. Minimalismus im Arbeitsbereich ist kein Lifestyle, sondern eine Performance-Strategie.",
      exercise: "Führe einen 'Desktop-Reset' durch: Entferne alles von deinem Schreibtisch außer dem, was du für die aktuelle Aufgabe brauchst. Räume auch deinen digitalen Desktop auf und schließe alle unnötigen Browser-Tabs."
    }
  ],
  Disziplin: [
    {
      quote: "Motivation lässt dich starten, Disziplin lässt dich weitermachen.",
      tip: "Wille ist wie ein Akku – er entlädt sich durch Entscheidungen (Decision Fatigue). Die besten Performer minimieren Entscheidungen durch starre Abend- und Morgenrituale. Deine Umgebung sollte die richtige Entscheidung zur einfachsten Entscheidung machen.",
      exercise: "Wende das 'Identity Shifting' an: Sage nicht 'Ich versuche Sport zu machen', sondern 'Ich BIN ein Sportler'. Bereite heute Abend deine Sportkleidung direkt neben dem Bett vor, damit der Start morgen reibungslos verläuft."
    },
    {
      quote: "Wer den weichen Weg wählt, hat ein hartes Leben.",
      tip: "Das Belohnungszentrum deines Gehirns springt auf sofortige Befriedigung an. Disziplin bedeutet, den 'Prefrontalen Cortex' zu stärken, der langfristige Ziele priorisiert. Nutze die 5-Sekunden-Regel: Sobald du einen Impuls hast, zähle 5-4-3-2-1 und HANDLE.",
      exercise: "Identifiziere deine unangenehmste Aufgabe ('Eat the Frog'). Verpflichte dich, diese HEUTE als allererstes zu erledigen. Wenn sie zu groß wirkt, nimm dir nur 10 Minuten vor – der Widerstand schwindet meist nach den ersten Minuten."
    },
    {
      quote: "Konsistenz schlägt Intensität.",
      tip: "Kleine, tägliche Siege bauen ein massives Selbstvertrauen auf. Erfolg ist die Summe aus banalen, aber korrekt ausgeführten Gewohnheiten über einen langen Zeitraum. Die Macht des Zinseszinstums gilt auch für deine persönliche Entwicklung.",
      exercise: "Wähle eine 'Non-Negotiable' Gewohnheit (z.B. 10 Seiten lesen oder 5 Minuten Meditation). Egal wie stressig der Tag ist, diese Aufgabe wird ausgeführt. Markiere den Erfolg sofort in deinem Quest-Log, um das Erfolgserlebnis zu verankern."
    }
  ],
  Wissen: [
    {
      quote: "Investitionen in Wissen bringen die besten Zinsen.",
      tip: "Passives Lernen ist oft eine Illusion von Kompetenz. Um Wissen wirklich zu verankern, musst du es rekonstruieren (Active Recall). Nutze die Feynman-Methode: Kannst du das Konzept einem 8-jährigen Kind erklären?",
      exercise: "Schreibe nach dem Lesen eines Artikels oder Hören eines Podcasts die 3 wichtigsten Kernaussagen aus dem Gedächtnis auf (ohne nachzusehen). Überlege dir für jede Aussage eine konkrete Anwendung in deinem Leben."
    },
    {
      quote: "Ein Anfängergeist sieht viele Möglichkeiten.",
      tip: "Bestätigungsfehler (Confirmation Bias) hindert uns am Wachstum. Suche aktiv nach Informationen, die deinen aktuellen Überzeugungen widersprechen. Wahre Intelligenz ist die Fähigkeit, zwei gegensätzliche Gedanken gleichzeitig im Kopf zu halten.",
      exercise: "Lies heute etwas über ein Thema, das dich normalerweise abschreckt oder dem du kritisch gegenüberstehst. Versuche, die Argumente der Gegenseite objektiv nachzuvollziehen, ohne sie sofort zu bewerten."
    },
    {
      quote: "Wissen ist nur potentielle Macht.",
      tip: "Gelerntes muss mit bestehenden neuronalen Pfaden verknüpft werden (Elaboration). Je öfter du neue Informationen mit persönlichen Erfahrungen verbindest, desto schneller wandern sie vom Kurzzeit- ins Langzeitgedächtnis.",
      exercise: "Erstelle eine 'Mind-Map' oder eine kurze Notiz für das heutige Lernthema. Verknüpfe es mit einer Metapher oder einer Geschichte aus deiner eigenen Vergangenheit. Erkläre es heute Abend jemandem beim Essen."
    }
  ],
  Soziales: [
    {
      quote: "Die Qualität deines Lebens hängt von der Qualität deiner Beziehungen ab.",
      tip: "Emotionale Intelligenz beginnt mit radikaler Präsenz. In einer Welt voller Ablenkungen ist ungeteilte Aufmerksamkeit das kostbarste Geschenk. Höre auf die Zwischentöne: Was sagt die Person zwischen den Worten?",
      exercise: "Führe heute ein Gespräch ohne dein Handy in Reichweite. Übe das 'Deep Listening': Wiederhole am Ende eines Satzes kurz, was du verstanden hast ('Habe ich dich richtig verstanden, dass...'), bevor du antwortest."
    },
    {
      quote: "Wir sind der Durchschnitt der 5 Menschen um uns herum.",
      tip: "Spiegelneuronen sorgen dafür, dass wir uns unbewusst an unsere Umgebung anpassen. Suche dir Mentoren und Freunde, die bereits dort sind, wo du hinwillst. Achte aber auch darauf, wem DU ein Mentor sein kannst.",
      exercise: "Verteile heute ehrliches, spezifisches Lob. Sage nicht nur 'Gut gemacht', sondern 'Mir hat gefallen, wie du das Problem X gelöst hast, weil...'. Beobachte die Reaktion deines Gegenübers auf diese Wertschätzung."
    },
    {
      quote: "Verletzlichkeit ist keine Schwäche, sondern Mut.",
      tip: "Psychologische Sicherheit ist der Schlüssel zu großartigen Teams und tiefen Partnerschaften. Wenn du den ersten Schritt machst und eine Schwäche eingestehst, gibst du anderen die Erlaubnis, dasselbe zu tun. Authentizität schafft Vertrauen.",
      exercise: "Sei heute radikal ehrlich zu dir selbst und anderen. Wenn du dich bei einem Fehler ertappst, entschuldige dich aufrichtig, ohne Ausreden zu suchen. Teile eine kleine Unsicherheit in einem sicheren Umfeld und spüre die Erleichterung."
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
      Als Psychologe sehe ich täglich, wie Menschen gegen ihre eigene Biologie ankämpfen. Willenskraft ist eine endliche Ressource – sie verbraucht sich über den Tag durch Entscheidungen und Stress. Die Lösung liegt in der "**Neuroplastizität**" und dem Verständnis des Habit-Loops (Auslöser -> Routine -> Belohnung).

      **1. Der Auslöser (Trigger)**
      Ein Gewohnheits-Trigger kann ein Ort, eine Zeit, ein emotionaler Zustand oder eine vorangehende Aktion sein. Um eine neue Gewohnheit zu etablieren, musst du den Auslöser unübersehbar machen. Willst du mehr lesen? Lege das Buch auf dein Kopfkissen. Willst du joggen? Stelle die Laufschuhe direkt vor die Tür. Wenn der Trigger fehlt, wird die Routine nie gestartet.

      **2. Die Routine (Verhalten)**
      Mache die Aktion lächerlich einfach (The Friction Rule). Die 2-Minuten-Regel von James Clear besagt: Skaliere jede neue Gewohnheit auf 2 Minuten herunter. "Ich lese ein Kapitel" wird zu "Ich lese eine Seite". Es geht darum, die Identität aufzubauen (ich bin jemand, der liest), nicht sofort die maximale Leistung zu erbringen. Wenn der Widerstand gering ist, ist die Ausführung garantiert.

      **3. Die Belohnung**
      Dein Gehirn ist eine Dopamin-Maschine. Wenn du dich nicht sofort nach der Aktion belohnst, wird das Gehirn das Verhalten nicht als wiederholenswert abspeichern. Ein einfaches Abstreichen auf einer Checkliste (wie in dieser App!) schüttet bereits Dopamin aus. Du kannst auch "Habit Stacking" nutzen: Verbinde eine ungeliebte Aufgabe mit einer Belohnung (z.B. "Ich darf meinen Lieblings-Podcast NUR beim Putzen hören").

      **Reflexionsaufgabe:** Welchen Trigger in deinem Alltag kannst du mit einer neuen Verhaltensweise koppeln? Definiere einen konkreten Satz: "Nachdem ich [Bestehende Gewohnheit], werde ich [Neue 2-Minuten-Gewohnheit]".
    `
  },
  {
    id: 'hypertrophy',
    title: 'Progressive Overload & ZNS-Regeneration',
    category: 'Fitness',
    icon: Dumbbell,
    content: `
      ### Das Stress-Anpassungs-Modell
      Muskulatur baut sich nicht im Training auf, sondern während der Erholungsphase. Das Training liefert lediglich den destruktiven Reiz (Mikrotraumata), der dem Körper signalisiert: "Du warst zu schwach für diese Last, bau vor für das nächste Mal."

      **1. Progressive Overload (Progressive Überlastung)**
      Der Körper ist ein Meister der Effizienz. Wenn du in jedem Training das exakt gleiche Gewicht für die gleiche Wiederholungszahl bewegst, adaptiert er sich einmal und verharrt dann auf dem Status Quo. Du musst versuchen, dich systematisch in kleinen Schritten zu steigern. Das bedeutet nicht immer mehr Gewicht: Es kann auch eine kontrolliertere Ausführung, eine langsamere exzentrische Phase (Time under Tension) oder eine kürzere Satzpause sein.

      **2. Die Rolle des zentralen Nervensystems (ZNS)**
      Heavy Lifting ermüdet nicht nur den Muskel, sondern dein gesamtes Nervensystem. Während sich Muskeln oft nach 48 Stunden erholen, braucht das ZNS bis zu 72 Stunden oder länger. Ständige Erschöpfung (Übertraining) äußert sich durch Leistungsabfall, schlechte Laune und Infektanfälligkeit. Implementiere alle 4-8 Wochen 'Deload-Wochen', in denen du das Gewicht um 50% reduzierst, um deinem System Zeit für eine vollständige systemische Heilung zu geben.

      **3. Ernährung als Baumaterial**
      Training ohne Protein ist wie der Versuch, ein Haus ohne Steine zu bauen. Du brauchst 1.6g bis 2.2g Protein pro Kilogramm Körpergewicht. Zudem ist ein leichter Kalorienüberschuss für maximalen Aufbau förderlich, während ein Defizit hormonelle Ressourcen für die Regeneration einschränkt. Unterschätze niemals die Rolle von Mikronährstoffen (Magnesium, Zink) für die Muskelfunktion.

      **Dein Coaching-Auftrag:** Beginne ein Trainingstagebuch. Schreibe bei jeder Übung Gewicht, Sätze und Wiederholungen auf. Dein Ziel für das nächste Mal: Nur EIN kleiner Fortschritt in EINEM dieser Werte bei EINER Übung. Achte zudem auf 8 Stunden Schlaf – dort findet der eigentliche Muskelaufbau statt.
    `
  },
  {
    id: 'stoicism',
    title: 'Emotionale Resilienz & Stoizismus',
    category: 'Soziales & Wissen',
    icon: Shield,
    content: `
      ### Die Dichotomie der Kontrolle
      Eines der mächtigsten psychologischen Konzepte zur Stressreduktion stammt aus der antiken Stoa. Der Kern ist einfach: Wir leiden fast ausschließlich, weil wir versuchen, Dinge zu kontrollieren, die außerhalb unserer Macht liegen.

      **1. Das Internale vs. Externale**
      Stoische Praxis bedeutet, eine scharfe Trennlinie zu ziehen. Was andere über dich denken, das Wetter, die politische Lage oder die Fehler der Vergangenheit sind "Externale". Deine eigene Vorbereitung, deine Integrität und deine unmittelbare Reaktion auf Ereignisse sind "Internale". Wenn du deine Energie nur auf das fokussierst, was du kontrollieren kannst, wirst du unbesiegbar für äußeren Stress.

      **2. Das Prinzip der "Amor Fati" (Liebe das Schicksal)**
      Nietzsche und die Stoiker gingen über bloße Akzeptanz hinaus. Amor Fati bedeutet, alles, was passiert – auch Schmerz und Verlust – als absolut notwendig und gut für deine Entwicklung zu betrachten. Das Hindernis wird zum Treibstoff. Ein Fehler im Job ist keine Katastrophe, sondern ein hocheffizienter Lehrmeister für Prozessoptimierung.

      **3. Premeditatio Malorum (Vorwegnahme des Übels)**
      Das Gehirn hasst böse Überraschungen. Wenn du dir morgens kurz vorstellst, was heute alles schiefgehen könnte (ein unfreundlicher Kunde, ein Stau, ein technischer Defekt), impfst du dein Nervensystem. Wenn es dann passiert, hast du es mental bereits durchgespielt und bleibst ruhig, während andere in Panik verfallen. Dies ist keine Pessimismus, sondern strategische Ruhe.

      **Dein Coaching-Auftrag:** Identifiziere heute eine Situation, die dich normalerweise stresst. Frage dich sofort: "Habe ich 100% Kontrolle über das Ergebnis?" Wenn nein, richte dein Augenmerk sofort auf DEINEN nächsten konstruktiven Schritt und akzeptiere das Ergebnis bereits im Vorfeld.
    `
  },
  {
    id: 'bodylanguage',
    title: 'Embodied Cognition & Körpersprache',
    category: 'Soziales & Fokus',
    icon: Activity,
    content: `
      ### Die Neurowissenschaft der Haltung
      Die Forschung beweist: Unser Gehirn ist kein isolierter Computer. Es nutzt den Körper als Feedback-Schleife, um Emotionen zu generieren. Du bist nicht traurig und lässt deshalb den Kopf hängen – oft bist du traurig, WEIL deine Körperhaltung "Niederlage" signalisiert.

      **1. Das Biofeedback-System**
      Dein Gehirn überwacht ständig die Spannung im Kiefer, die Weite der Brust und die Tiefe der Atmung. Eine zusammengezogene Haltung (Schutzhaltung) aktiviert die Amygdala und flutet den Körper mit Cortisol. Eine aufrechte Haltung hingegen signalisiert dem System Sicherheit, was die Produktion von Testosteron (Antrieb) leicht erhöht und Cortisol senkt.

      **2. Die Macht der Expansion**
      Expansion bedeutet Raum einnehmen. In Momenten der Unsicherheit neigen wir dazu, uns klein zu machen. Kämpfe aktiv dagegen an: Schultern zurück, Blick auf Augenhöhe, Hände sichtbar. Dies aktiviert das Belohnungssystem und gibt dir ein Gefühl von "Agency" (Selbstwirksamkeit). Du wartest nicht darauf, dich sicher zu fühlen, um aufrecht zu stehen – du stehst aufrecht, um dich sicher zu fühlen.

      **3. Mikro-Mimik und Stimmung**
      Untersuchungen zeigen, dass Menschen, die den "Bleistift-Test" machen (einen Stift so zwischen den Zähnen halten, dass die Lachmuskeln aktiviert werden), Cartoons lustiger finden als Menschen, die den Stift mit den Lippen halten (Schmolleffekt). Dein Gesichtsausdruck schreibt Programme in dein Gehirn.

      **Dein Coaching-Auftrag:** Mache den "High-Performance-Check" jede volle Stunde. Korrigiere deine Haltung: Scheitel Richtung Decke, Schultern locker fallen lassen, leichtes Lächeln. Atme 3-mal tief in den unteren Bauch (Vagus-Stimulation). Beobachte, wie sich dein mentaler Fokus in nur 60 Sekunden klärt.
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
      Modernste Psychiatriestudien zeigen: Depressive Verstimmungen und chronische Müdigkeit sind stark mit Entzündungsprozessen verknüpft. Eine Ernährung reich an Omega-3-Fettsäuren (Fisch, Alken), Polyphenolen (Beeren, Olivenöl) und Ballaststoffen senken Entzündungsmarker (wie Zytokine) messbar ab und schützt das Gehirn.
      
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

function getDailyIndices(date: Date, totalDeep: number) {
  // Use day count since epoch for deterministic cycling
  const dayCount = Math.floor(date.getTime() / (1000 * 60 * 60 * 24));
  
  return {
    Fitness: dayCount % DAILY_TIPS.Fitness.length,
    Fokus: (dayCount + 1) % DAILY_TIPS.Fokus.length,
    Disziplin: (dayCount + 2) % DAILY_TIPS.Disziplin.length,
    Wissen: (dayCount + 3) % DAILY_TIPS.Wissen.length,
    Soziales: (dayCount + 4) % DAILY_TIPS.Soziales.length,
    Deep: dayCount % Math.max(1, totalDeep)
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
  const { deepTrainings, lastTrainingGeneratedDate, addDeepTraining, setLastTrainingGeneratedDate } = useStore();
  const [currentDate] = useState(() => new Date());
  const [activeSubTab, setActiveSubTab] = useState<'impulse' | 'tiefentraining' | 'archiv'>('impulse');
  const [expandedTraining, setExpandedTraining] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const allTrainings = useMemo(() => {
    const dynamicTrainings = deepTrainings.map(d => ({
      id: d.id,
      title: d.title,
      category: d.category,
      icon: ICON_MAP[d.iconName] || BookOpen,
      content: d.content
    }));
    // Reverse dynamic trainings so newest is first? Or keep chronological
    return [...DEEP_TRAINings, ...dynamicTrainings];
  }, [deepTrainings]);

  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (lastTrainingGeneratedDate !== todayStr && !isGenerating && process.env.GEMINI_API_KEY) {
      setIsGenerating(true);
      const existingTitles = allTrainings.map(t => t.title);
      generateDailyTraining(existingTitles).then((newTraining) => {
        addDeepTraining({ ...newTraining, id: crypto.randomUUID(), createdAt: Date.now() });
        setLastTrainingGeneratedDate(todayStr);
        setIsGenerating(false);
      }).catch(err => {
        console.error("Failed to generate daily training", err);
        setIsGenerating(false);
      });
    }
  }, [lastTrainingGeneratedDate, allTrainings, isGenerating, addDeepTraining, setLastTrainingGeneratedDate]);

  const [selectedArchiveDate, setSelectedArchiveDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  });

  const archiveDays = useMemo(() => {
    const days = [];
    for (let i = 1; i <= 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d);
    }
    return days;
  }, []);

  const getIndicesForDate = (date: Date) => {
    return getDailyIndices(date, allTrainings.length);
  };

  const dailyIndices = useMemo(() => {
    return getIndicesForDate(currentDate);
  }, [currentDate]);

  const archiveIndices = useMemo(() => {
    return getIndicesForDate(selectedArchiveDate);
  }, [selectedArchiveDate]);

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
      <div className="flex gap-2 p-1 bg-neutral-900 rounded-xl max-w-md mb-6 border border-neutral-800">
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
        <button
          onClick={() => setActiveSubTab('archiv')}
          className={cn(
            "flex-1 py-2 text-sm font-medium rounded-lg transition-all",
            activeSubTab === 'archiv' 
              ? "bg-amber-500 text-black shadow-md shadow-amber-500/20" 
              : "text-neutral-400 hover:text-white"
          )}
        >
          Archiv
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
             <div className="flex items-center justify-between mb-4">
               <h3 className="text-xl font-bold text-white flex items-center gap-2">
                 <BookOpen className="w-6 h-6 text-blue-400" />
                 Die Coach-Bibliothek
               </h3>
               <span className="text-xs font-medium text-neutral-500 bg-neutral-800 px-3 py-1 rounded-full">
                 {allTrainings.length} Module verfügbar
               </span>
             </div>
             
             <p className="text-neutral-400 text-sm leading-relaxed mb-6">
               Als dein mentaler und physischer High-Performance Coach habe ich hier die wichtigsten psychologischen, anatomischen und kognitiven Fundamente zusammengetragen. Eine Auswahl wird täglich als Fokus-Thema hervorgehoben.
             </p>

             {/* Featured Training of the Day */}
             <div className="mb-8 p-1 bg-gradient-to-r from-amber-500/20 to-blue-500/20 rounded-2xl">
               <div className="bg-neutral-900 rounded-xl p-5 border border-white/5">
                 <div className="flex items-center gap-2 mb-3">
                   <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                   <span className="text-xs font-bold text-amber-500 uppercase tracking-widest">Empfehlung für heute</span>
                 </div>
                 <div className="flex items-center justify-between">
                   <div className="flex items-center gap-4">
                     <div className="bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
                       {(() => {
                         const FeaturedIcon = allTrainings[dailyIndices.Deep]?.icon || BookOpen;
                         return <FeaturedIcon className="w-6 h-6 text-amber-500" />;
                       })()}
                     </div>
                     <div>
                       <h4 className="text-lg font-bold text-white">{allTrainings[dailyIndices.Deep]?.title}</h4>
                       <p className="text-sm text-neutral-400">{allTrainings[dailyIndices.Deep]?.category}</p>
                     </div>
                   </div>
                   <button 
                     onClick={() => setExpandedTraining(allTrainings[dailyIndices.Deep]?.id)}
                     className="text-sm font-bold text-blue-400 hover:text-blue-300 transition-colors"
                   >
                     Zum Training →
                   </button>
                 </div>
               </div>
             </div>

             <div className="space-y-4">
               {allTrainings.map(training => {
                 const isExpanded = expandedTraining === training.id;
                 const Icon = training.icon || BookOpen;
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

      {activeSubTab === 'archiv' && (
        <div className="animate-in fade-in duration-300 space-y-6">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Date Selector Sidebar */}
            <div className="w-full md:w-64 flex-shrink-0 space-y-2">
              <h3 className="text-sm font-bold text-neutral-500 uppercase tracking-wider px-2 mb-4 flex items-center gap-2">
                <History className="w-4 h-4" /> Letzte 30 Tage
              </h3>
              <div className="max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar space-y-1">
                {archiveDays.map((date) => {
                  const isSelected = date.toDateString() === selectedArchiveDate.toDateString();
                  return (
                    <button
                      key={date.toISOString()}
                      onClick={() => setSelectedArchiveDate(date)}
                      className={cn(
                        "w-full text-left px-4 py-3 rounded-xl transition-all border flex items-center justify-between group",
                        isSelected 
                          ? "bg-amber-500/10 border-amber-500 text-amber-500 shadow-lg shadow-amber-500/5" 
                          : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-white"
                      )}
                    >
                      <div className="flex flex-col">
                        <span className="text-xs font-medium opacity-60">
                          {date.toLocaleDateString(undefined, { weekday: 'short' })}
                        </span>
                        <span className="font-bold">
                          {date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                      <ChevronRight className={cn("w-4 h-4 transition-transform", isSelected ? "translate-x-1" : "opacity-0 group-hover:opacity-100")} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Archive Content Area */}
            <div className="flex-1 space-y-6">
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="bg-amber-500/10 p-2 rounded-lg">
                      <CalendarIcon className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Rückblick: {selectedArchiveDate.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</h3>
                      <p className="text-sm text-neutral-400">Vergangene Impulse und Trainings</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {/* Featured Deep Training in Archive */}
                  <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-5 mb-2">
                    <div className="flex items-center gap-2 mb-4">
                      <BookOpen className="w-4 h-4 text-blue-400" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Haupt-Coaching des Tages</span>
                    </div>
                    <div className="flex items-start gap-4">
                      <div className="bg-neutral-900 p-3 rounded-xl border border-neutral-800">
                        {(() => {
                           const ArchIcon = allTrainings[archiveIndices.Deep]?.icon || BookOpen;
                           return <ArchIcon className="w-5 h-5 text-amber-500" />;
                        })()}
                      </div>
                      <div>
                        <h4 className="text-md font-bold text-white mb-1">{allTrainings[archiveIndices.Deep]?.title}</h4>
                        <p className="text-xs text-neutral-400 leading-relaxed line-clamp-2">
                          {allTrainings[archiveIndices.Deep]?.category} • {allTrainings[archiveIndices.Deep]?.content?.split('\n')[2]?.trim().slice(0, 100)}...
                        </p>
                      </div>
                    </div>
                  </div>

                  {skillKeys.map((skill) => {
                    const index = archiveIndices[skill];
                    const tipData = DAILY_TIPS[skill][index];
                    return (
                      <div key={skill} className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 hover:border-amber-500/20 transition-colors">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500/70">{skill}</span>
                        </div>
                        <blockquote className="text-sm font-medium text-white mb-3 italic">
                          "{tipData.quote}"
                        </blockquote>
                        <div className="bg-neutral-900/50 rounded-xl p-3 border border-neutral-800/50">
                          <h4 className="text-xs font-bold text-neutral-400 mb-1 flex items-center gap-1">
                            <Target className="w-3 h-3" /> Die Lektion
                          </h4>
                          <p className="text-xs text-neutral-300 leading-relaxed">
                            {tipData.tip}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-amber-500/5 border border-amber-500/10 rounded-3xl p-6">
                <h4 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                  <Brain className="w-5 h-5 text-amber-500" /> Coaching-Tipp fürs Archiv
                </h4>
                <p className="text-neutral-400 text-sm leading-relaxed">
                  Reflexion ist einer der am meisten unterschätzten Hebel für Erfolg. Schau dir regelmäßig alte Impulse an. Oft verstehst du eine Lektion erst dann wirklich, wenn du sie in einem anderen Kontext oder nach einer gewissen Zeit erneut liest. Wissen muss reifen.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
