const express = require("express");
const router = express.Router();
const { db } = require("../database/schema");
const { authenticateVisitor } = require("../middleware/auth");
const { audit, visitorActor } = require("../utils/audit");
const { validate, quizSubmitRules } = require("../middleware/validate");
const {
  getQuizSettings,
  pickAdminQuestions,
  rebuildAdminQuestions,
} = require("../utils/quizSettings");
const {
  generateQuizFromContent: localGenerate,
} = require("../utils/quizGenerator");

// ─── Per-visitor quiz attempt cooldown (ms) — prevents rapid brute-force ─────
const QUIZ_COOLDOWN_MS =
  parseInt(process.env.QUIZ_COOLDOWN_SECONDS || "30", 10) * 1000;
// Map: visitorId → timestamp of last submit
const lastSubmitTime = new Map();

// ─── OpenAI client (optional — only used if OPENAI_API_KEY is set) ────────────
let openaiClient = null;
if (process.env.OPENAI_API_KEY) {
  try {
    const { OpenAI } = require("openai");
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log("  ✔ OpenAI quiz generation enabled");
  } catch {
    console.warn("  ⚠ OpenAI package not found — using built-in question bank");
  }
}

// ─── Built-in question bank — 30 questions per language (pool is large enough
//     that every attempt draws a different 5-question subset) ──────────────────
const QUESTION_POOL = {
  en: [
    {
      id: 1,
      text: "What does HSE stand for?",
      options: [
        "Health, Safety and Environment",
        "Hazard, Security and Emergency",
        "Human Safety and Equipment",
        "Health, Security and Engineering",
      ],
      correct: 0,
      explanation: "HSE stands for Health, Safety and Environment.",
    },
    {
      id: 2,
      text: "What should you do immediately when you hear the fire alarm?",
      options: [
        "Continue working",
        "Evacuate via the nearest emergency exit",
        "Call the fire department first",
        "Wait at your workstation",
      ],
      correct: 1,
      explanation:
        "Always evacuate immediately via the nearest emergency exit.",
    },
    {
      id: 3,
      text: "What is the purpose of Personal Protective Equipment (PPE)?",
      options: [
        "To look professional",
        "To protect workers from workplace hazards",
        "To improve productivity",
        "To comply with dress code",
      ],
      correct: 1,
      explanation: "PPE protects workers from health and safety risks.",
    },
    {
      id: 4,
      text: "Where is the emergency muster point?",
      options: [
        "Near the reception",
        "In the parking lot",
        "At the designated assembly area on evacuation maps",
        "Near the fire extinguisher",
      ],
      correct: 2,
      explanation:
        "The muster point is the designated assembly area shown on evacuation maps.",
    },
    {
      id: 5,
      text: "What should you do if you witness a near-miss incident?",
      options: [
        "Ignore it",
        "Fix it yourself",
        "Report it to the HSE officer immediately",
        "Wait until end of day",
      ],
      correct: 2,
      explanation: "All near-miss incidents must be reported immediately.",
    },
    {
      id: 6,
      text: "Which activity is NOT permitted on company premises?",
      options: [
        "Wearing a visitor badge",
        "Smoking in designated areas",
        "Using mobile phones in restricted zones",
        "Following your escort",
      ],
      correct: 2,
      explanation:
        "Mobile phones are prohibited in restricted/hazardous zones.",
    },
    {
      id: 7,
      text: "What does a yellow safety sign indicate?",
      options: [
        "Prohibition",
        "Warning — potential hazard",
        "Mandatory action",
        "Emergency",
      ],
      correct: 1,
      explanation: "Yellow signs warn of potential hazards.",
    },
    {
      id: 8,
      text: "How should a visitor behave on company premises?",
      options: [
        "Explore freely",
        "Stay with escort and follow instructions",
        "Access any area of interest",
        "Share access badges",
      ],
      correct: 1,
      explanation: "Visitors must stay with their escort at all times.",
    },
    {
      id: 9,
      text: "What is the first step in a medical emergency?",
      options: [
        "Move the injured person",
        "Call for help and emergency services",
        "Give water and rest",
        "Continue working",
      ],
      correct: 1,
      explanation: "Call for help first; keep the victim calm.",
    },
    {
      id: 10,
      text: "What must you do before entering a restricted area?",
      options: [
        "Enter quickly",
        "Get the required permit and wear PPE",
        "Ask a colleague",
        "Check your phone",
      ],
      correct: 1,
      explanation:
        "Restricted areas require authorisation and appropriate PPE.",
    },
    {
      id: 11,
      text: "What colour are mandatory safety signs?",
      options: ["Yellow", "Red", "Blue", "Green"],
      correct: 2,
      explanation: "Mandatory signs (must-do actions) are blue.",
    },
    {
      id: 12,
      text: "What does a red safety sign indicate?",
      options: [
        "Warning",
        "Prohibition or fire equipment",
        "Safe condition",
        "Mandatory",
      ],
      correct: 1,
      explanation: "Red signs indicate prohibition or fire-related equipment.",
    },
    {
      id: 13,
      text: "How often should fire extinguishers be inspected?",
      options: ["Every 5 years", "Annually", "Monthly", "Only after use"],
      correct: 1,
      explanation: "Fire extinguishers should be inspected at least annually.",
    },
    {
      id: 14,
      text: "Which fire extinguisher type is safe for electrical fires?",
      options: ["Water", "Foam", "CO₂", "Dry powder (class D)"],
      correct: 2,
      explanation: "CO₂ extinguishers are safe for electrical fires.",
    },
    {
      id: 15,
      text: "What does PASS stand for when using a fire extinguisher?",
      options: [
        "Pull, Aim, Squeeze, Sweep",
        "Push, Aim, Shoot, Spray",
        "Pull, Activate, Squeeze, Spray",
        "Press, Aim, Squeeze, Sweep",
      ],
      correct: 0,
      explanation:
        "PASS: Pull the pin, Aim at the base, Squeeze the handle, Sweep side to side.",
    },
    {
      id: 16,
      text: "What should you do if your clothing catches fire?",
      options: [
        "Run for help",
        "Stop, drop and roll",
        "Remove clothing immediately",
        "Jump into water",
      ],
      correct: 1,
      explanation: "Stop, drop and roll to smother the flames.",
    },
    {
      id: 17,
      text: "What is a hazard?",
      options: [
        "An accident that has occurred",
        "Anything with potential to cause harm",
        "A safety rule",
        "A PPE item",
      ],
      correct: 1,
      explanation: "A hazard is anything with the potential to cause harm.",
    },
    {
      id: 18,
      text: "What is a risk?",
      options: [
        "A safety sign",
        "The likelihood and severity that a hazard causes harm",
        "A type of PPE",
        "An emergency procedure",
      ],
      correct: 1,
      explanation: "Risk = likelihood × severity of harm from a hazard.",
    },
    {
      id: 19,
      text: "Who is responsible for health and safety at work?",
      options: [
        "Only the safety officer",
        "Only managers",
        "Everyone in the workplace",
        "Only the employer",
      ],
      correct: 2,
      explanation: "Health and safety is everyone's responsibility.",
    },
    {
      id: 20,
      text: "What should you do if you find a suspicious package?",
      options: [
        "Open it to check",
        "Move it to a safe place",
        "Report it immediately and do not touch it",
        "Ignore it",
      ],
      correct: 2,
      explanation: "Never touch a suspicious package; report it immediately.",
    },
    {
      id: 21,
      text: "When must you wash your hands in a workplace?",
      options: [
        "Only before eating",
        "After using chemicals, before eating, and after toilet use",
        "Only if visibly dirty",
        "Only after toilet use",
      ],
      correct: 1,
      explanation:
        "Wash hands after chemicals, before eating, and after toilet use.",
    },
    {
      id: 22,
      text: "What is the purpose of a safety data sheet (SDS)?",
      options: [
        "To record accidents",
        "To provide hazard information for chemicals",
        "To list employees",
        "To document PPE issued",
      ],
      correct: 1,
      explanation:
        "An SDS provides hazard and safe-handling information for chemicals.",
    },
    {
      id: 23,
      text: "What should you do if a chemical spills on your skin?",
      options: [
        "Wipe it off with cloth",
        "Rinse immediately with plenty of water",
        "Apply a bandage",
        "Ignore it if it does not sting",
      ],
      correct: 1,
      explanation:
        "Rinse with plenty of water immediately and seek medical help.",
    },
    {
      id: 24,
      text: "Which sign shows the location of emergency exits?",
      options: [
        "Red prohibition sign",
        "Blue mandatory sign",
        "Green safe condition sign",
        "Yellow warning sign",
      ],
      correct: 2,
      explanation:
        "Green signs indicate safe conditions, including emergency exits.",
    },
    {
      id: 25,
      text: "What is the minimum number of people needed to lift a heavy load safely?",
      options: ["1", "2", "3", "4"],
      correct: 1,
      explanation:
        "Heavy loads require at least 2 people to lift safely; assess with a risk assessment.",
    },
    {
      id: 26,
      text: "What PPE must be worn when working at heights?",
      options: [
        "Safety boots only",
        "Hard hat only",
        "Full body harness and hard hat",
        "Goggles only",
      ],
      correct: 2,
      explanation:
        "Working at heights requires a full body harness and hard hat as a minimum.",
    },
    {
      id: 27,
      text: "What should you do if you discover a fire?",
      options: [
        "Fight it alone",
        "Raise the alarm, evacuate, and call emergency services",
        "Continue working",
        "Wait to see if it grows",
      ],
      correct: 1,
      explanation:
        "Raise the alarm first, then evacuate and call emergency services.",
    },
    {
      id: 28,
      text: "What does COSHH stand for?",
      options: [
        "Control of Substances Hazardous to Health",
        "Code of Safety for Hazardous Handling",
        "Company Operations Safety and Health Handbook",
        "Certificate of Safe Handling",
      ],
      correct: 0,
      explanation: "COSHH = Control of Substances Hazardous to Health.",
    },
    {
      id: 29,
      text: "How should you store flammable liquids?",
      options: [
        "In any sealed container",
        "In a dedicated flammable materials cabinet away from ignition sources",
        "Near heating equipment for convenience",
        "In the open air",
      ],
      correct: 1,
      explanation:
        "Flammable liquids must be stored in a dedicated cabinet away from ignition sources.",
    },
    {
      id: 30,
      text: "What is the correct action if the emergency evacuation alarm sounds?",
      options: [
        "Finish your current task",
        "Collect your belongings before leaving",
        "Leave immediately via the nearest exit and proceed to the muster point",
        "Call your supervisor first",
      ],
      correct: 2,
      explanation:
        "Leave immediately via the nearest exit and go to the muster point.",
    },
  ],
  fr: [
    {
      id: 1,
      text: "Que signifie HSE ?",
      options: [
        "Hygiène, Sécurité et Environnement",
        "Hazard, Sécurité et Urgence",
        "Humain, Sécurité et Équipement",
        "Hygiène, Sécurité et Engineering",
      ],
      correct: 0,
      explanation: "HSE = Hygiène, Sécurité et Environnement.",
    },
    {
      id: 2,
      text: "Que faire en entendant l'alarme incendie ?",
      options: [
        "Continuer à travailler",
        "Évacuer par la sortie la plus proche",
        "Appeler les pompiers d'abord",
        "Attendre à son poste",
      ],
      correct: 1,
      explanation: "Évacuez immédiatement par la sortie la plus proche.",
    },
    {
      id: 3,
      text: "À quoi servent les EPI ?",
      options: [
        "Paraître professionnel",
        "Protéger contre les risques professionnels",
        "Améliorer la productivité",
        "Respecter le code vestimentaire",
      ],
      correct: 1,
      explanation:
        "Les EPI protègent contre les risques pour la santé et la sécurité.",
    },
    {
      id: 4,
      text: "Où se trouve le point de rassemblement ?",
      options: [
        "Près de la réception",
        "Dans le parking",
        "À la zone désignée sur les plans d'évacuation",
        "Près de l'extincteur",
      ],
      correct: 2,
      explanation:
        "Le point de rassemblement est indiqué sur les plans d'évacuation.",
    },
    {
      id: 5,
      text: "Que faire si vous êtes témoin d'un quasi-accident ?",
      options: [
        "L'ignorer",
        "Le réparer soi-même",
        "Le signaler immédiatement",
        "Attendre la fin de journée",
      ],
      correct: 2,
      explanation:
        "Tous les quasi-accidents doivent être signalés immédiatement.",
    },
    {
      id: 6,
      text: "Qu'est-ce qui est INTERDIT dans les locaux ?",
      options: [
        "Porter un badge visiteur",
        "Fumer en zone fumeur",
        "Utiliser le téléphone en zone restreinte",
        "Suivre son escorte",
      ],
      correct: 2,
      explanation:
        "L'utilisation du téléphone est interdite en zone restreinte.",
    },
    {
      id: 7,
      text: "Que signifie un panneau jaune ?",
      options: [
        "Interdiction",
        "Avertissement — danger potentiel",
        "Obligation",
        "Urgence",
      ],
      correct: 1,
      explanation: "Les panneaux jaunes signalent un danger potentiel.",
    },
    {
      id: 8,
      text: "Comment un visiteur doit-il se comporter ?",
      options: [
        "Explorer librement",
        "Rester avec son escorte",
        "Accéder à toute zone",
        "Partager ses accréditations",
      ],
      correct: 1,
      explanation: "Les visiteurs doivent rester avec leur escorte.",
    },
    {
      id: 9,
      text: "Première étape face à une urgence médicale ?",
      options: [
        "Déplacer la victime",
        "Appeler les secours",
        "Donner de l'eau",
        "Continuer à travailler",
      ],
      correct: 1,
      explanation: "Appelez les secours en premier.",
    },
    {
      id: 10,
      text: "Avant d'entrer en zone restreinte ?",
      options: [
        "Entrer vite",
        "Obtenir le permis et porter les EPI",
        "Demander à un collègue",
        "Vérifier son téléphone",
      ],
      correct: 1,
      explanation: "Autorisations et EPI sont obligatoires en zone restreinte.",
    },
    {
      id: 11,
      text: "De quelle couleur sont les panneaux d'obligation ?",
      options: ["Jaune", "Rouge", "Bleu", "Vert"],
      correct: 2,
      explanation:
        "Les panneaux d'obligation (actions à effectuer) sont bleus.",
    },
    {
      id: 12,
      text: "Que signifie un panneau rouge ?",
      options: [
        "Avertissement",
        "Interdiction ou matériel incendie",
        "Condition sûre",
        "Obligation",
      ],
      correct: 1,
      explanation: "Rouge = interdiction ou équipement incendie.",
    },
    {
      id: 13,
      text: "À quelle fréquence les extincteurs doivent-ils être vérifiés ?",
      options: [
        "Tous les 5 ans",
        "Annuellement",
        "Mensuellement",
        "Seulement après utilisation",
      ],
      correct: 1,
      explanation:
        "Les extincteurs doivent être vérifiés au moins une fois par an.",
    },
    {
      id: 14,
      text: "Quel extincteur convient aux feux électriques ?",
      options: ["Eau", "Mousse", "CO₂", "Poudre"],
      correct: 2,
      explanation: "Le CO₂ est adapté aux feux électriques.",
    },
    {
      id: 15,
      text: "Que signifie la méthode TPAS pour utiliser un extincteur ?",
      options: [
        "Tirer, Pointer, Appuyer, Balayer",
        "Tenir, Placer, Activer, Souffler",
        "Tirer, Presser, Ajuster, Supprimer",
        "Tenir, Pointer, Attendre, Souffler",
      ],
      correct: 0,
      explanation:
        "TPAS : Tirer la goupille, Pointer la buse, Appuyer sur la poignée, Balayer.",
    },
    {
      id: 16,
      text: "Que faire si vos vêtements s'enflamment ?",
      options: [
        "Courir chercher de l'aide",
        "S'arrêter, se coucher et se rouler",
        "Enlever immédiatement les vêtements",
        "Sauter dans l'eau",
      ],
      correct: 1,
      explanation:
        "S'arrêter, se coucher et se rouler pour étouffer les flammes.",
    },
    {
      id: 17,
      text: "Qu'est-ce qu'un danger ?",
      options: [
        "Un accident survenu",
        "Tout ce qui peut causer un dommage",
        "Une règle de sécurité",
        "Un EPI",
      ],
      correct: 1,
      explanation: "Un danger est tout ce qui peut causer un dommage.",
    },
    {
      id: 18,
      text: "Qu'est-ce qu'un risque ?",
      options: [
        "Un panneau de sécurité",
        "La probabilité et la gravité d'un préjudice",
        "Un type d'EPI",
        "Une procédure d'urgence",
      ],
      correct: 1,
      explanation: "Risque = probabilité × gravité du dommage.",
    },
    {
      id: 19,
      text: "Qui est responsable de la sécurité au travail ?",
      options: [
        "Le seul agent de sécurité",
        "Les seuls managers",
        "Tout le monde",
        "Le seul employeur",
      ],
      correct: 2,
      explanation: "La sécurité est la responsabilité de tous.",
    },
    {
      id: 20,
      text: "Que faire face à un colis suspect ?",
      options: [
        "L'ouvrir",
        "Le déplacer",
        "Le signaler sans y toucher",
        "L'ignorer",
      ],
      correct: 2,
      explanation:
        "Ne touchez jamais un colis suspect ; signalez-le immédiatement.",
    },
    {
      id: 21,
      text: "Quand faut-il se laver les mains ?",
      options: [
        "Seulement avant de manger",
        "Après les produits chimiques, avant de manger et après les toilettes",
        "Seulement si mains sales",
        "Seulement après les toilettes",
      ],
      correct: 1,
      explanation:
        "Lavage des mains après les produits chimiques, avant de manger et après les toilettes.",
    },
    {
      id: 22,
      text: "À quoi sert une fiche de données de sécurité (FDS) ?",
      options: [
        "Enregistrer les accidents",
        "Fournir des informations sur les dangers des produits chimiques",
        "Lister les employés",
        "Documenter les EPI délivrés",
      ],
      correct: 1,
      explanation:
        "La FDS fournit les informations sur les dangers et la manipulation sûre des produits chimiques.",
    },
    {
      id: 23,
      text: "Que faire si un produit chimique se renverse sur la peau ?",
      options: [
        "Essuyer avec un chiffon",
        "Rincer abondamment à l'eau",
        "Appliquer un pansement",
        "Ignorer si ça ne brûle pas",
      ],
      correct: 1,
      explanation: "Rincer abondamment à l'eau immédiatement.",
    },
    {
      id: 24,
      text: "Quelle couleur indique les issues de secours ?",
      options: ["Rouge", "Bleu", "Vert", "Jaune"],
      correct: 2,
      explanation:
        "Les panneaux verts indiquent les conditions sûres, dont les issues de secours.",
    },
    {
      id: 25,
      text: "Combien de personnes minimum pour soulever une charge lourde ?",
      options: ["1", "2", "3", "4"],
      correct: 1,
      explanation: "Au minimum 2 personnes pour les charges lourdes.",
    },
    {
      id: 26,
      text: "Quels EPI pour travailler en hauteur ?",
      options: [
        "Chaussures de sécurité uniquement",
        "Casque uniquement",
        "Harnais intégral et casque",
        "Lunettes uniquement",
      ],
      correct: 2,
      explanation: "Harnais intégral et casque sont obligatoires en hauteur.",
    },
    {
      id: 27,
      text: "Que faire si vous découvrez un incendie ?",
      options: [
        "Le combattre seul",
        "Déclencher l'alarme, évacuer et appeler les secours",
        "Continuer à travailler",
        "Attendre qu'il s'aggrave",
      ],
      correct: 1,
      explanation: "Déclenchez l'alarme, évacuez puis appelez les secours.",
    },
    {
      id: 28,
      text: "Que signifie FDS ?",
      options: [
        "Fiche de Données de Sécurité",
        "Formulaire De Sécurité",
        "Fiche De Stockage",
        "Formation De Sécurité",
      ],
      correct: 0,
      explanation: "FDS = Fiche de Données de Sécurité.",
    },
    {
      id: 29,
      text: "Comment stocker les liquides inflammables ?",
      options: [
        "Dans n'importe quel récipient fermé",
        "Dans une armoire dédiée loin des sources d'ignition",
        "Près des appareils de chauffage",
        "À l'air libre",
      ],
      correct: 1,
      explanation: "Armoire dédiée, loin de toute source d'ignition.",
    },
    {
      id: 30,
      text: "Que faire quand l'alarme d'évacuation sonne ?",
      options: [
        "Terminer la tâche en cours",
        "Prendre ses affaires d'abord",
        "Quitter immédiatement par la sortie la plus proche vers le point de rassemblement",
        "Appeler son responsable d'abord",
      ],
      correct: 2,
      explanation:
        "Quitter immédiatement et rejoindre le point de rassemblement.",
    },
  ],
  rw: [
    {
      id: 1,
      text: "HSE bisobanura iki?",
      options: [
        "Ubuzima, Umutekano n'Ibidukikije",
        "Ingorane, Umutekano n'Imbere",
        "Ubumuntu, Umutekano n'Ibikoresho",
        "Ubuzima, Umutekano n'Ubuhanga",
      ],
      correct: 0,
      explanation: "HSE = Ubuzima, Umutekano n'Ibidukikije.",
    },
    {
      id: 2,
      text: "Ugomba gukora iki wumvise agahago k'umuriro?",
      options: [
        "Gukomeza akazi",
        "Gusohoka ukoresheje inzira y'ubutabazi",
        "Guhamagara inyangarugero",
        "Gutegereza amabwiriza",
      ],
      correct: 1,
      explanation: "Sohoha ako kanya ukoresheje inzira y'ubutabazi iri hafi.",
    },
    {
      id: 3,
      text: "Ni iki icyo PPE bigamije?",
      options: [
        "Gutuma abakozi baboneka neza",
        "Kurinda abakozi ingorane z'akazi",
        "Gukonjesha umusaruro",
        "Gukurikiza amabwiriza",
      ],
      correct: 1,
      explanation: "PPE irinda abakozi ingorane z'ubuzima n'umutekano.",
    },
    {
      id: 4,
      text: "Aho guteranira mu gihe cy'ibibazo biri he?",
      options: [
        "Hafi y'inkubiti",
        "Mu parking",
        "Ahantu hagenewe ku makarita y'inyanduruko",
        "Hafi y'inshinge yo kuzimya umuriro",
      ],
      correct: 2,
      explanation:
        "Ahantu hagenewe guteranira hashingiwe ku makarita y'inyanduruko.",
    },
    {
      id: 5,
      text: "Ugomba gukora iki ubonye ikibazo giteye akaga?",
      options: [
        "Kibaze",
        "Kigorore wenyine",
        "Kibitsa ako kanya inzego za HSE",
        "Tegereza akagero k'ijoro",
      ],
      correct: 2,
      explanation: "Ibibazo byose biteye akaga bigomba kugezwa ako kanya.",
    },
    {
      id: 6,
      text: "Ni ikihe kitemewe mu biro by'ikigo?",
      options: [
        "Kwambara akabati ka mugenzi",
        "Kunywa itabi ahantu hagenwe",
        "Gukoresha telefone mu turere tuziguye",
        "Gukurikira umuyobozi",
      ],
      correct: 2,
      explanation: "Gukoresha telefone biraburantswe mu turere tuziguye.",
    },
    {
      id: 7,
      text: "Ishusho y'umutekano ya umuhondo isobanura iki?",
      options: [
        "Kubuza",
        "Kuzindukira — akaga gashoboye gaba",
        "Ngombwa",
        "Ihangayika",
      ],
      correct: 1,
      explanation: "Ibimenyetso by'umuhondo bivuga akaga gashoboye gaba.",
    },
    {
      id: 8,
      text: "Mugenzi agomba kwifatwa gute?",
      options: [
        "Gusesenura hose",
        "Kuguma n'umuyobozi no gukurikira amabwiriza",
        "Kwinjira ahantu hose ashakiye",
        "Gusangira uburenganzira",
      ],
      correct: 1,
      explanation: "Abashyitsi bagomba kuguma n'umuyobozi wabo.",
    },
    {
      id: 9,
      text: "Intambwe ya mbere mu gihe cy'ikibazo cy'ubuvuzi?",
      options: [
        "Kwimura umuntu wakomekwaho",
        "Gusaba ubufasha no guhamagara serivisi",
        "Guha umuntu amazi",
        "Gukomeza akazi",
      ],
      correct: 1,
      explanation: "Gusaba ubufasha ako kanya ni intambwe ya mbere.",
    },
    {
      id: 10,
      text: "Ugomba gukora iki mbere yo kwinjira ahantu haziguye?",
      options: [
        "Kwinjira vuba",
        "Kubona uruhushya no kwambara PPE ikwiye",
        "Kubaza mugenzi",
        "Kureba telefone",
      ],
      correct: 1,
      explanation: "Hasaba uruhushya n'PPE ikwiye mbere yo kwinjira.",
    },
    {
      id: 11,
      text: "Amabara y'ibimenyetso bya blue bisobanura iki?",
      options: [
        "Akaga",
        "Kubuza",
        "Ngombwa — ikorwa rigomba gukorwa",
        "Umutekano",
      ],
      correct: 2,
      explanation: "Ibimenyetso by'ubururu bivuga ikorwa rigomba gukorwa.",
    },
    {
      id: 12,
      text: "Ibimenyetso by'umutuku bisobanura iki?",
      options: [
        "Akaga",
        "Kubuza cyangwa ibikoresho by'umuriro",
        "Umutekano",
        "Ngombwa",
      ],
      correct: 1,
      explanation: "Ubutuku = kubuza cyangwa ibikoresho by'umuriro.",
    },
    {
      id: 13,
      text: "Ni ryari inshinge zo kuzimya umuriro zigomba kugenzurwa?",
      options: [
        "Buri myaka 5",
        "Buri mwaka",
        "Buri kwezi",
        "Gusa nyuma y'gukoresha",
      ],
      correct: 1,
      explanation: "Inshinge zigenzurwa byibura rimwe mu mwaka.",
    },
    {
      id: 14,
      text: "Ni iyihe nshinge ikora neza ku muriro w'amashanyarazi?",
      options: ["Amazi", "Foam", "CO₂", "Umukungugu"],
      correct: 2,
      explanation: "CO₂ ni ikiza umuriro w'amashanyarazi.",
    },
    {
      id: 15,
      text: "PASS mu gukoresha inshinge bisobanura iki?",
      options: [
        "Kura, Saba, Kanda, Kanura",
        "Kanda, Saba, Kura, Kanura",
        "Kura, Kanda, Saba, Fata",
        "Kanda, Kura, Kanura, Saba",
      ],
      correct: 0,
      explanation: "PASS: Kura, Saba, Kanda, Kanura.",
    },
    {
      id: 16,
      text: "Ugomba gukora iki niba imyenda yawe yaka umuriro?",
      options: [
        "Guhunga usaba ubufasha",
        "Guhagarara, kwivurura hasi no kwizungumuriza",
        "Gukuramo imyenda ako kanya",
        "Kuruka mu mazi",
      ],
      correct: 1,
      explanation: "Hagarara, vurura hasi hanyuma wizungumurize.",
    },
    {
      id: 17,
      text: "Akaga ni iki?",
      options: [
        "Impanuka yabayeho",
        "Ikintu cyose gishobora gutera ingorane",
        "Amabwiriza y'umutekano",
        "Ibikoresho bya PPE",
      ],
      correct: 1,
      explanation: "Akaga ni ikintu cyose gishobora gutera ingorane.",
    },
    {
      id: 18,
      text: "Ingaruka ni iki?",
      options: [
        "Ikimenyetso cy'umutekano",
        "Amahirwe n'ubukana bw'ingorane",
        "Ubwoko bwa PPE",
        "Uburyo bw'imbere y'ihangayika",
      ],
      correct: 1,
      explanation: "Ingaruka = amahirwe × ubukana bw'ingorane.",
    },
    {
      id: 19,
      text: "Ni nde ushinzwe umutekano ku kazi?",
      options: [
        "Umunyapolisi w'umutekano gusa",
        "Abayobozi gusa",
        "Buri muntu wese mu kazi",
        "Umukoresha gusa",
      ],
      correct: 2,
      explanation: "Umutekano ni inshingano ya buri muntu.",
    },
    {
      id: 20,
      text: "Ugomba gukora iki ubonye agaseke gashimishije?",
      options: [
        "Kugafungura",
        "Kukagenura ahantu heza",
        "Kukabitsa utakagiye",
        "Kubibaza",
      ],
      correct: 2,
      explanation: "Ntukagire akagaseke; bitsa ako kanya.",
    },
    {
      id: 21,
      text: "Ni ryari ugomba gukaraba intoki?",
      options: [
        "Mbere yo kurya gusa",
        "Nyuma y'imiti, mbere yo kurya, nyuma y'ubwiherero",
        "Gusa iyo amazi aboneka",
        "Gusa nyuma y'ubwiherero",
      ],
      correct: 1,
      explanation:
        "Karaba intoki nyuma y'imiti, mbere yo kurya n'nyuma y'ubwiherero.",
    },
    {
      id: 22,
      text: "Ni iki icyo karita y'amakuru y'umutekano (SDS) igamije?",
      options: [
        "Kugaragaza impanuka",
        "Gutanga amakuru ku makomeye y'imiti",
        "Gutunga lisiti y'abakozi",
        "Gukora dosiye ya PPE",
      ],
      correct: 1,
      explanation:
        "SDS itanga amakuru ku makomeye n'uburyo bwo gufata imiti neza.",
    },
    {
      id: 23,
      text: "Ugomba gukora iki niba imiti imanye ku ruhu rwawe?",
      options: [
        "Gusiba n'icyuma",
        "Kunyura amazi menshi ako kanya",
        "Gushyira bandage",
        "Kubibaza niba bitakubabaza",
      ],
      correct: 1,
      explanation: "Nyura amazi menshi ako kanya hanyuma usabe ubuvuzi.",
    },
    {
      id: 24,
      text: "Ni irihe rangi rigaragaza inzira z'ubutabazi?",
      options: ["Umukungu", "Ubururu", "Icyatsi", "Umuhondo"],
      correct: 2,
      explanation: "Ibimenyetso by'icyatsi bigaragaza inzira z'ubutabazi.",
    },
    {
      id: 25,
      text: "Ni abantu bangahe bagomba gutwara umutwaro uremereye?",
      options: ["1", "2", "3", "4"],
      correct: 1,
      explanation: "Nibura abantu 2 bagomba gutwara umutwaro uremereye.",
    },
    {
      id: 26,
      text: "Ni izihe PPE zigomba kwambikwa mu gihe cyo gukora hejuru?",
      options: [
        "Ingofero gusa",
        "Inkweto z'umutekano gusa",
        "Harnais ya gutwara umubiri wose n'ingofero",
        "Insinga gusa",
      ],
      correct: 2,
      explanation:
        "Harnais ya gutwara umubiri wose n'ingofero birasabwa mu gihe cyo gukora hejuru.",
    },
    {
      id: 27,
      text: "Ugomba gukora iki ubonye umuriro?",
      options: [
        "Kuwuzimya wenyine",
        "Kurira agahago, gusohoka no guhamagara inzego z'ubutabazi",
        "Gukomeza akazi",
        "Gutegereza kureba ko uzamuka",
      ],
      correct: 1,
      explanation:
        "Kurira agahago mbere, hanyuma usohoke uhamagare inzego z'ubutabazi.",
    },
    {
      id: 28,
      text: "Ni iki COSHH isobanura?",
      options: [
        "Kugenzura ibintu biteye akaga ku buzima",
        "Uburyo bwo Gufata neza Ibintu Bibi",
        "Ubu buryo bwo kurinda imiti y'inzira",
        "Icyangombwa cy'Umutekano",
      ],
      correct: 0,
      explanation:
        "COSHH = Control of Substances Hazardous to Health (Kugenzura Ibintu Biteye Akaga).",
    },
    {
      id: 29,
      text: "Nigute ukwiye gufata umutayiti w'umuriro (flammable liquids)?",
      options: [
        "Mu gikoresho cyose gifunzwe",
        "Mu kabati gashinzwe ibintu bitwika kure y'inkomoko z'inshinge",
        "Hafi y'ibikoresho bya gushyuha",
        "Mu kirere cyangwa",
      ],
      correct: 1,
      explanation:
        "Umutayiti w'umuriro ugomba guterwa mu kabati gashinzwe kure y'inkomoko z'inshinge.",
    },
    {
      id: 30,
      text: "Ugomba gukora iki iyo agahago k'inyanduruko kavuzwe?",
      options: [
        "Rangiza akazi kawe",
        "Fata ibintu byawe mbere yo gusohooka",
        "Sohoha ako kanya ukoresheje inzira iri hafi ugire aho guteranira",
        "Hamagara umuyobozi wawe mbere",
      ],
      correct: 2,
      explanation: "Sohoha ako kanya ugendera ahantu hagenewe guteranira.",
    },
  ],
};

// ─── Generate a unique quiz by shuffling + picking 5 questions ────────────────
// Guarantees a different set on every call by seeding the shuffle with visitor_id + attempt
function pickUniqueQuestions(language, visitorId, attemptNumber, count = 5) {
  const pool = QUESTION_POOL[language] || QUESTION_POOL.en;
  // Deterministic-ish shuffle per visitor+attempt so the same attempt always returns same Qs
  const seed = (visitorId * 7919 + attemptNumber * 31) % pool.length;
  const shuffled = [...pool];
  // Fisher-Yates with seeded offset
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (i * seed + attemptNumber) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  // Extra random shuffle layer so even same visitor+attempt gets mild variation across restarts
  shuffled.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// ─── OpenAI-powered quiz generation ──────────────────────────────────────────
// `contentOrContext` can be either:
//   - A string (pre-built rich context with content_text + key_points)
//   - An array of { title, description } objects (legacy fallback)
async function generateAIQuiz(language, contentOrContext, count = 5) {
  if (!openaiClient) return null;

  const langNames = { en: "English", fr: "French", rw: "Kinyarwanda" };
  const langName = langNames[language] || "English";

  // Build context from either a pre-built string or legacy array format
  let context;
  if (typeof contentOrContext === "string") {
    context = contentOrContext;
  } else if (Array.isArray(contentOrContext) && contentOrContext.length > 0) {
    context = contentOrContext
      .map((c) => `- ${c.title}: ${c.description || ""}`)
      .join("\n");
  } else {
    context =
      "General HSE workplace safety induction covering evacuation, PPE, fire safety, incident reporting, and visitor conduct.";
  }

  const prompt = `You are an HSE (Health, Safety and Environment) training expert. 
Generate exactly ${count} multiple-choice quiz questions in ${langName} based on the following induction content:

${context}

Rules:
- Each question must have exactly 4 answer options (A, B, C, D)
- Only ONE option is correct
- Questions must be varied — cover different safety topics from the content
- Questions must be clear, specific, and test understanding of the key points
- Do NOT repeat questions from previous attempts
- Make wrong options plausible but clearly incorrect to a trained person
- Include a brief explanation for the correct answer

Respond ONLY with valid JSON in this exact format (no markdown, no extra text):
{
  "questions": [
    {
      "id": 1,
      "text": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct": 0,
      "explanation": "Brief explanation why this is correct."
    }
  ]
}`;

  try {
    const response = await openaiClient.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8, // higher = more variety between attempts
      max_tokens: 2000,
    });

    const raw = response.choices[0].message.content.trim();
    // Strip markdown code blocks if present
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const parsed = JSON.parse(cleaned);

    if (!parsed.questions || parsed.questions.length < count) return null;
    return parsed.questions.slice(0, count);
  } catch (err) {
    console.error("OpenAI quiz generation failed:", err.message);
    return null;
  }
}

// One quiz, all languages: if the visitor already has an unexpired quiz for this attempt in ANOTHER
// language (they switched language part-way), return that quiz's question ids so we can show the same
// questions in the new language instead of drawing a new random set.
async function sameQuizInOtherLanguage(visitorId, attemptNumber, language) {
  const rows = await db("quiz_question_cache")
    .where({ visitor_id: visitorId, attempt_number: attemptNumber })
    .whereNot({ language })
    .where("expires_at", ">", new Date().toISOString())
    .orderBy("created_at", "desc");
  for (const row of rows) {
    let qs;
    try {
      qs =
        typeof row.questions === "string"
          ? JSON.parse(row.questions)
          : row.questions;
    } catch {
      continue;
    }
    if (Array.isArray(qs) && qs.length && qs.every((q) => q.bank_id)) {
      const rebuilt = await rebuildAdminQuestions(
        language,
        qs.map((q) => q.bank_id),
      );
      if (rebuilt) return rebuilt;
    }
  }
  return null;
}

// ─── GET /api/quiz/generate?language=en&visitor_id=1 ─────────────────────────
router.get("/generate", authenticateVisitor, async (req, res) => {
  try {
    const { language = "en", visitor_id } = req.query;
    if (!visitor_id)
      return res
        .status(400)
        .json({ success: false, message: "visitor_id required" });

    // Ownership check
    if (req.visitorSession.visitor_id !== parseInt(visitor_id, 10)) {
      return res
        .status(403)
        .json({ success: false, message: "Token does not match this visitor" });
    }

    const visitor = await db("visitors").where({ id: visitor_id }).first();
    if (!visitor)
      return res
        .status(404)
        .json({ success: false, message: "Visitor not found" });

    const attemptNumber = (visitor.quiz_attempts || 0) + 1;
    const settings = await getQuizSettings(); // number of questions + pass mark set by the admin

    // Check if a fresh cached set exists for this attempt
    const now = new Date();
    const cached = await db("quiz_question_cache")
      .where({ visitor_id, language, attempt_number: attemptNumber })
      .where("expires_at", ">", now.toISOString())
      .first();

    if (cached) {
      const questions = (
        typeof cached.questions === "string"
          ? JSON.parse(cached.questions)
          : cached.questions
      ).map(({ id, text, options }) => ({ id, text, options }));
      return res.json({
        success: true,
        questions,
        total: questions.length,
        source: "cache",
        same_quiz: true,
        pass_score: settings.pass_score,
      });
    }

    // ── Step 1: Use admin-approved questions from active_quiz_pool ─────────────
    // Admin must have uploaded induction content AND clicked "Approve" on the quiz.
    const poolRow = await db("active_quiz_pool")
      .where({ language })
      .orWhere({ language: "all" })
      .orderBy("updated_at", "desc")
      .first();

    // ── Step 0: Questions written by the admin take priority ───────────────────
    // Same questions if the visitor just switched language; otherwise a fresh random set
    let fullQuestions = await sameQuizInOtherLanguage(
      parseInt(visitor_id, 10),
      attemptNumber,
      language,
    );
    const sameQuiz = !!fullQuestions;
    if (!fullQuestions) {
      fullQuestions = await pickAdminQuestions(
        language,
        settings.question_count,
      );
    }
    let source = fullQuestions ? "admin" : "builtin";

    if (!fullQuestions && poolRow) {
      const poolQuestions =
        typeof poolRow.questions === "string"
          ? JSON.parse(poolRow.questions)
          : poolRow.questions;

      if (poolQuestions && poolQuestions.length >= 5) {
        // Randomly pick different questions each attempt
        const shuffled = [...poolQuestions].sort(() => Math.random() - 0.5);
        fullQuestions = shuffled
          .slice(0, settings.question_count)
          .map((q, i) => ({ ...q, id: i + 1 }));
        source = "approved";
      }
    }

    // ── Step 2: No approved pool — try generating from induction content ────────
    if (!fullQuestions) {
      const inductionContent = await db("induction_content")
        .where({ is_active: true })
        .where(function () {
          this.where({ language }).orWhere({ language: "all" });
        })
        .select("title", "description", "key_points", "content_text")
        .limit(10);

      if (inductionContent.length > 0) {
        // Try local content-based generator
        fullQuestions = localGenerate(
          inductionContent,
          language,
          settings.question_count,
        );
        if (fullQuestions) source = "content-ai";

        // Try OpenAI if local didn't work
        if (!fullQuestions && openaiClient) {
          const contextParts = inductionContent.map((c) => {
            const sections = [`Title: ${c.title}`];
            if (c.description) sections.push(`Description: ${c.description}`);
            if (c.key_points) sections.push(`Key Points:\n${c.key_points}`);
            if (c.content_text)
              sections.push(`Content:\n${c.content_text.slice(0, 2000)}`);
            return sections.join("\n");
          });
          const ctx = contextParts.join("\n\n---\n\n");
          fullQuestions = await generateAIQuiz(
            language,
            ctx,
            settings.question_count,
          );
          if (fullQuestions) source = "ai";
        }
      }
    }

    // ── Step 3: Absolute fallback — built-in question bank ─────────────────────
    if (!fullQuestions) {
      fullQuestions = pickUniqueQuestions(
        language,
        parseInt(visitor_id, 10),
        attemptNumber,
        settings.question_count,
      );
      source = "builtin";
    }

    // Cache the full questions (with correct answers) server-side for 2 hours
    const expires = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    // Delete old cache entry if any
    await db("quiz_question_cache")
      .where({ visitor_id, language, attempt_number: attemptNumber })
      .delete();
    await db("quiz_question_cache").insert({
      visitor_id,
      language,
      attempt_number: attemptNumber,
      questions: JSON.stringify(fullQuestions),
      expires_at: expires.toISOString(),
    });

    // Send to client WITHOUT correct answers
    const questions = fullQuestions.map(({ id, text, options }) => ({
      id,
      text,
      options,
    }));
    res.json({
      success: true,
      questions,
      total: questions.length,
      source,
      same_quiz: sameQuiz,
      pass_score: settings.pass_score,
    });
  } catch (err) {
    console.error("Quiz generate error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /api/quiz/submit ────────────────────────────────────────────────────
router.post(
  "/submit",
  authenticateVisitor,
  validate(quizSubmitRules),
  async (req, res) => {
    try {
      const { visitor_id, language = "en", answers } = req.body;

      if (
        !visitor_id ||
        !answers ||
        !Array.isArray(answers) ||
        answers.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message: "visitor_id and answers array required",
        });
      }

      // Ownership check
      if (req.visitorSession.visitor_id !== parseInt(visitor_id, 10)) {
        return res.status(403).json({
          success: false,
          message: "Token does not match this visitor",
        });
      }

      // Per-visitor cooldown — prevent rapid-fire brute forcing
      const now = Date.now();
      const lastTime = lastSubmitTime.get(visitor_id) || 0;
      if (now - lastTime < QUIZ_COOLDOWN_MS) {
        const remaining = Math.ceil(
          (QUIZ_COOLDOWN_MS - (now - lastTime)) / 1000,
        );
        return res.status(429).json({
          success: false,
          message: `Please wait ${remaining} seconds before trying again.`,
          retryAfter: remaining,
        });
      }
      lastSubmitTime.set(visitor_id, now);

      const visitor = await db("visitors").where({ id: visitor_id }).first();
      if (!visitor)
        return res
          .status(404)
          .json({ success: false, message: "Visitor not found" });

      const attemptNumber = (visitor.quiz_attempts || 0) + 1;
      const settings = await getQuizSettings();

      // Retrieve cached full questions (with correct answers) for this attempt
      const cached = await db("quiz_question_cache")
        .where({ visitor_id, language, attempt_number: attemptNumber })
        .first();

      let fullQuestions;
      if (cached) {
        fullQuestions =
          typeof cached.questions === "string"
            ? JSON.parse(cached.questions)
            : cached.questions;
      } else {
        // The questions are only kept for 2 hours. If the admin wrote their own questions we cannot
        // rebuild the same random set, so ask the visitor to start again instead of grading wrongly.
        const sameQuiz = await sameQuizInOtherLanguage(
          visitor_id,
          attemptNumber,
          language,
        );
        if (sameQuiz) {
          fullQuestions = sameQuiz;
        } else if (await pickAdminQuestions(language, 1)) {
          lastSubmitTime.delete(visitor_id);
          return res.status(410).json({
            success: false,
            code: "QUIZ_EXPIRED",
            message:
              "Your quiz session expired. Please reload the quiz and try again.",
          });
        }

        // No cache — try to reconstruct from approved pool first, then built-in bank
        const poolRow = await db("active_quiz_pool")
          .where({ language })
          .orWhere({ language: "all" })
          .orderBy("updated_at", "desc")
          .first();

        if (!fullQuestions && poolRow) {
          const poolQs =
            typeof poolRow.questions === "string"
              ? JSON.parse(poolRow.questions)
              : poolRow.questions;
          if (poolQs && poolQs.length >= 5) {
            const shuffled = [...poolQs].sort(() => Math.random() - 0.5);
            fullQuestions = shuffled
              .slice(0, settings.question_count)
              .map((q, i) => ({ ...q, id: i + 1 }));
          }
        }

        // Absolute fallback to built-in bank
        if (!fullQuestions) {
          fullQuestions = pickUniqueQuestions(
            language,
            parseInt(visitor_id, 10),
            attemptNumber,
            settings.question_count,
          );
        }
      }

      // ── Grade answers ─────────────────────────────────────────────────────────
      let correctCount = 0;
      const gradedAnswers = answers
        .map((answer) => {
          const question = fullQuestions.find(
            (q) => q.id === answer.question_id,
          );
          if (!question) return null;

          const isCorrect = answer.selected === question.correct;
          if (isCorrect) correctCount++;

          return {
            question_id: question.id,
            question_text: question.text,
            selected_option: answer.selected,
            selected_text: question.options?.[answer.selected] ?? "No answer",
            correct_option: question.correct,
            correct_text: question.options?.[question.correct] ?? "",
            is_correct: isCorrect,
            explanation: question.explanation || "",
            correct_answer: question.correct,
          };
        })
        .filter(Boolean);

      // Score against ALL the questions in the quiz — skipped questions count as wrong
      // (otherwise answering a single question correctly would give 100 %)
      const total = fullQuestions.length;
      const percentage =
        total > 0 ? Math.round((correctCount / total) * 100) : 0;
      const passed = percentage >= settings.pass_score;

      // ── 1. Update visitor ─────────────────────────────────────────────────────
      await db("visitors")
        .where({ id: visitor_id })
        .update({
          induction_status: passed ? "passed" : "failed",
          quiz_score: percentage,
          quiz_attempts: attemptNumber,
        });

      // ── 2. quiz_results summary row ───────────────────────────────────────────
      const [resultRow] = await db("quiz_results")
        .insert({
          visitor_id,
          score: percentage,
          correct_count: correctCount,
          total_questions: total,
          passed: passed ? 1 : 0,
          language,
          attempt_number: attemptNumber,
        })
        .returning("id");

      const quizResultId = resultRow?.id ?? resultRow;

      // ── 3. quiz_answers — one row per question ────────────────────────────────
      await db("quiz_answers").insert(
        gradedAnswers.map((a) => ({
          quiz_result_id: quizResultId,
          visitor_id,
          question_id: a.question_id,
          question_text: a.question_text,
          selected_option: a.selected_option,
          selected_text: a.selected_text,
          correct_option: a.correct_option,
          correct_text: a.correct_text,
          is_correct: a.is_correct ? 1 : 0,
          language,
          attempt_number: attemptNumber,
        })),
      );

      // ── 4. Invalidate the cache entry ─────────────────────────────────────────
      await db("quiz_question_cache")
        .where({ visitor_id, language, attempt_number: attemptNumber })
        .delete();

      await audit(req, {
        actor: visitor
          ? visitorActor(visitor)
          : { type: "visitor", id: visitor_id, name: `Visitor #${visitor_id}` },
        action: passed ? "quiz.passed" : "quiz.failed",
        category: "quiz",
        entity_type: "visitor",
        entity_id: visitor_id,
        entity_label: visitor
          ? `${visitor.first_name} ${visitor.last_name}`
          : `Visitor #${visitor_id}`,
        details: {
          score: percentage,
          correct: correctCount,
          total,
          attempt: attemptNumber,
          language,
        },
      });

      res.json({
        success: true,
        score: correctCount,
        total,
        percentage,
        passed,
        pass_score: settings.pass_score,
        attempt: attemptNumber,
        results: gradedAnswers,
        message: passed
          ? "Congratulations! You have passed the HSE induction assessment."
          : `You scored ${percentage}%. You need at least ${settings.pass_score}% to pass. Please try again.`,
      });
    } catch (err) {
      console.error("Quiz submit error:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// ─── GET /api/quiz/history/:visitor_id (protected) ───────────────────────────
router.get("/history/:visitor_id", authenticateVisitor, async (req, res) => {
  try {
    const visitor_id = parseInt(req.params.visitor_id, 10);

    // Ownership check — can only view your own history
    if (req.visitorSession.visitor_id !== visitor_id) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const results = await db("quiz_results")
      .where({ visitor_id })
      .orderBy("attempt_number", "asc");

    const history = await Promise.all(
      results.map(async (result) => {
        const answers = await db("quiz_answers")
          .where({ quiz_result_id: result.id })
          .orderBy("question_id", "asc");
        return { ...result, answers };
      }),
    );

    res.json({ success: true, history, total: history.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
