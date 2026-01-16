import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import Amadeus from "amadeus";

dotenv.config();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const PORT = process.env.PORT || 3001;

// --- 1. AUTHENTICATION ---
const AMADEUS_ID = process.env.AMADEUS_CLIENT_ID?.trim();
const AMADEUS_SECRET = process.env.AMADEUS_CLIENT_SECRET?.trim();
const AMADEUS_ENV = "test"; 

if (!AMADEUS_ID || !AMADEUS_SECRET) {
  console.error("❌ CRITICAL: Amadeus Keys are missing from .env");
}

const amadeus = new Amadeus({
  clientId: AMADEUS_ID,
  clientSecret: AMADEUS_SECRET,
  hostname: AMADEUS_ENV, 
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- 2. CONFIGURATION DATA ---
const CITY_TO_IATA = {
  "vancouver": "YVR", "calgary": "YYC", "edmonton": "YEG", "toronto": "YYZ",
  "ottawa": "YOW", "montreal": "YUL", "halifax": "YHZ", "victoria": "YYJ",
  "winnipeg": "YWG", "kelowna": "YLW", "saskatoon": "YXE", "regina": "YQR",
  "kamloops": "YKA", "abbotsford": "YXX", "nanaimo": "YCD"
};

const BUNDLE_MAP = {
  E: "Econo", F: "EconoFlex", P: "Premium", R: "PremiumFlex",
  N: "Business", J: "BusinessFlex", B: "UltraBasic",
};

const HIERARCHY = [
  "UltraBasic", "Econo", "EconoFlex", "Premium", "PremiumFlex", "Business", "BusinessFlex"
];

const BUNDLE_DETAILS = {
  UltraBasic:   "Carry-on: NO (Personal item only). Checked Bags: Fee. Seats: Fee (Back). Changes: No. Refunds: No.",
  Econo:        "Carry-on: YES. Checked Bags: Fee. Seats: Fee. Changes: Fee. Refunds: Credit only.",
  EconoFlex:    "Carry-on: YES. Checked Bags: 1 Free. Seats: Included. Changes: Free. Refunds: Fully refundable.",
  Premium:      "Carry-on: YES. Checked Bags: 2 Free. Seats: Premium. Changes: Fee. Refunds: Credit only.",
  PremiumFlex:  "Carry-on: YES. Checked Bags: 2 Free. Seats: Premium. Changes: Free. Refunds: Fully refundable.",
  Business:     "Carry-on: YES. Checked Bags: 2 Free. Seats: Business. Changes: Fee. Refunds: Credit only.",
  BusinessFlex: "Carry-on: YES. Checked Bags: 2 Free. Seats: Business. Changes: Free. Refunds: Fully refundable.",
};

const BUNDLE_FEATURES_DISPLAY = {
  UltraBasic: [
    { label: "Carry-on baggage", value: "No (Personal item only)", icon: "❌" },
    { label: "Checked baggage", value: "For a fee", icon: "💲" },
    { label: "Seat selection", value: "For a fee (Back of plane)", icon: "💲" },
    { label: "Change or cancel", value: "Not allowed", icon: "❌" },
    { label: "Rewards", value: "No", icon: "❌" }
  ],
  Econo: [
    { label: "Carry-on baggage", value: "Included", icon: "✅" },
    { label: "Checked baggage", value: "For a fee", icon: "💲" },
    { label: "Seat selection", value: "For a fee", icon: "💲" },
    { label: "Change or cancel", value: "Fee applies", icon: "💲" },
    { label: "Rewards", value: "Yes", icon: "✅" }
  ],
  EconoFlex: [
    { label: "Carry-on baggage", value: "Included", icon: "✅" },
    { label: "Checked baggage", value: "1st bag free", icon: "✅" },
    { label: "Seat selection", value: "Standard seat free", icon: "✅" },
    { label: "Change or cancel", value: "No fee", icon: "✅" },
    { label: "Rewards", value: "Yes", icon: "✅" }
  ],
  Premium: [
    { label: "Carry-on baggage", value: "Included", icon: "✅" },
    { label: "Checked baggage", value: "2 free bags", icon: "✅" },
    { label: "Seat selection", value: "Premium seat free", icon: "✅" },
    { label: "Change or cancel", value: "Fee applies", icon: "💲" },
    { label: "Rewards", value: "Yes (Higher earn)", icon: "✅" }
  ],
  PremiumFlex: [
    { label: "Carry-on baggage", value: "Included", icon: "✅" },
    { label: "Checked baggage", value: "2 free bags", icon: "✅" },
    { label: "Seat selection", value: "Premium seat free", icon: "✅" },
    { label: "Change or cancel", value: "No fee", icon: "✅" },
    { label: "Rewards", value: "Yes (Higher earn)", icon: "✅" }
  ],
  Business: [
    { label: "Carry-on baggage", value: "Included", icon: "✅" },
    { label: "Checked baggage", value: "2 free bags", icon: "✅" },
    { label: "Seat selection", value: "Business seat free", icon: "✅" },
    { label: "Change or cancel", value: "Fee applies", icon: "💲" },
    { label: "Rewards", value: "Yes (Highest earn)", icon: "✅" }
  ],
  BusinessFlex: [
    { label: "Carry-on baggage", value: "Included", icon: "✅" },
    { label: "Checked baggage", value: "2 free bags", icon: "✅" },
    { label: "Seat selection", value: "Business seat free", icon: "✅" },
    { label: "Change or cancel", value: "No fee", icon: "✅" },
    { label: "Rewards", value: "Yes (Highest earn)", icon: "✅" }
  ]
};

const BUNDLE_SCORING = {
  UltraBasic:   { carryOn: 0, checkedBags: 0, flexibility: 0, seatSelection: 0, rewards: 0 },
  Econo:        { carryOn: 1, checkedBags: 0, flexibility: 0, seatSelection: 0, rewards: 1 }, 
  EconoFlex:    { carryOn: 1, checkedBags: 1, flexibility: 1, seatSelection: 1, rewards: 1 },
  Premium:      { carryOn: 1, checkedBags: 1, flexibility: 0, seatSelection: 1, rewards: 1 },
  PremiumFlex:  { carryOn: 1, checkedBags: 1, flexibility: 1, seatSelection: 1, rewards: 1 },
  Business:     { carryOn: 1, checkedBags: 1, flexibility: 0, seatSelection: 1, rewards: 1 },
  BusinessFlex: { carryOn: 1, checkedBags: 1, flexibility: 1, seatSelection: 1, rewards: 1 },
  "Unmapped Bundle": { carryOn: 1, checkedBags: 0, flexibility: 0, seatSelection: 0, rewards: 0 }
};

// --- 3. SESSION MANAGEMENT ---
const SESSIONS = new Map();

function getSession(id) {
  if (!SESSIONS.has(id)) {
    SESSIONS.set(id, {
      phase: "travel_details",
      history: [],
      slots: {
        origin: null, destination: null, departureDate: null, returnDate: null, travelers: null, ambiguousCity: null, tripType: null,
        carryOn: null, checkedBags: null, changePolicy: null, seatSelection: null, rewardsEarn: null,
      },
      flightCache: [],
      lastRecommendation: null 
    });
  }
  return SESSIONS.get(id);
}

// --- 4. HELPERS ---
function formatFlightDetails(segments) {
  if (!segments || segments.length === 0) return [];
  return segments.map(seg => {
    const formatTime = (iso) => (iso ? iso.split("T")[1].slice(0, 5) : "??:??");
    return {
      origin: seg.departure.iataCode,
      dest: seg.arrival.iataCode,
      depTime: formatTime(seg.departure.at),
      arrTime: formatTime(seg.arrival.at),
      date: seg.departure.at.split("T")[0],
      flightNumber: `${seg.carrierCode}${seg.number}`
    };
  });
}

function ensureFutureDate(dateStr) {
  if (!dateStr || dateStr === 'N/A') return dateStr;
  const today = new Date();
  today.setHours(0,0,0,0);
  const target = new Date(dateStr);
  const targetLocal = new Date(target.getTime() + target.getTimezoneOffset() * 60000);
  if (targetLocal < today) {
    targetLocal.setFullYear(targetLocal.getFullYear() + 1);
    return targetLocal.toISOString().split('T')[0];
  }
  return dateStr;
}

function calculateScore(userPrefs, bundleName, price) {
  const capabilities = BUNDLE_SCORING[bundleName] || BUNDLE_SCORING["Unmapped Bundle"];
  let score = 0;
  if (userPrefs.changePolicy === "included" && capabilities.flexibility === 0) score -= 1000;
  if (userPrefs.rewardsEarn === true && capabilities.rewards === 0) score -= 500;
  if (userPrefs.carryOn === true && capabilities.carryOn === 0) score -= 500;
  if (userPrefs.seatSelection === "included" && capabilities.seatSelection === 0) score -= 200;

  if (userPrefs.changePolicy === "included" && capabilities.flexibility === 1) score += 50;
  if (userPrefs.rewardsEarn === true && capabilities.rewards === 1) score += 20;

  score -= (parseFloat(price) / 10000); 
  return score;
}

function generateReason(bundleName) {
  return BUNDLE_FEATURES_DISPLAY[bundleName] || [];
}

// --- 5. INTELLIGENT STATE MANAGER ---

async function updateState(userText, session) {
  const isPhase1 = session.phase === "travel_details";
  const TODAY = new Date().toISOString().split('T')[0];
  const lastBotMsg = [...session.history].reverse().find(m => m.role === "assistant")?.content || "";
  const currentStateJSON = JSON.stringify(session.slots, null, 2);

  // Identify Active Topic from Last Bot Message
  let activeTopic = "unknown";
  const lowerMsg = lastBotMsg.toLowerCase();
  if (lowerMsg.includes("fly") || lowerMsg.includes("where")) activeTopic = "location";
  else if (lowerMsg.includes("date") || lowerMsg.includes("when")) activeTopic = "date";
  else if (lowerMsg.includes("how many") || lowerMsg.includes("guests")) activeTopic = "travelers";
  else if (lowerMsg.includes("round-trip")) activeTopic = "tripType";
  else if (lowerMsg.includes("carry-on")) activeTopic = "carryOn";
  else if (lowerMsg.includes("checked bag")) activeTopic = "checkedBags";
  else if (lowerMsg.includes("flexibility") || lowerMsg.includes("lowest price")) activeTopic = "changePolicy";
  else if (lowerMsg.includes("seat")) activeTopic = "seatSelection";
  else if (lowerMsg.includes("loyalty") || lowerMsg.includes("rewards")) activeTopic = "rewardsEarn";

  const systemPrompt = `
    You are a Flight Bot State Manager.
    Current Date: ${TODAY}
    Active Topic: ${activeTopic} (Based on: "${lastBotMsg}")
    Current State: ${currentStateJSON}
    User Input: "${userText}"

    YOUR JOB: Map the User Input to the Active Topic.

    RULES:
    1. **"Just me"** -> travelers: 1.
    2. **"Nope/Nah/No"**:
       - If Topic=carryOn -> carryOn: false.
       - If Topic=checkedBags -> checkedBags: 0.
       - If Topic=seatSelection -> seatSelection: "cheapest".
       - If Topic=rewardsEarn -> rewardsEarn: false.
       - If Topic=tripType -> tripType: "oneway", returnDate: "N/A".
    3. **"Yes/Sure/Yep"**:
       - If Topic=carryOn -> carryOn: true.
       - If Topic=rewardsEarn -> rewardsEarn: true.
    4. **Context**: If Topic=location (Where to?), input is DESTINATION.
    
    OUTPUT: JSON object with ONLY the fields to update.
  `;

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userText }],
      temperature: 0,
      response_format: { type: "json_object" }
    });
    
    const result = JSON.parse(resp.choices[0].message.content || "{}");
    console.log(`🧠 [${activeTopic}] Input: "${userText}" -> Update:`, result);
    return result;

  } catch (e) { return {}; }
}

// --- 6. MAIN ROUTE ---

app.post("/api/chat", async (req, res) => {
  try {
    const { conversationId, message } = req.body;
    if (!conversationId || !message) return res.status(400).json({ reply: "Error: Missing data." });

    const session = getSession(conversationId);
    
    // 1. ANALYZE
    let analysis = await updateState(message, session);
    
    // 2. DETECT OFF-TOPIC QUESTIONS (Strict Redirect)
    // We do a specific check here to see if the user is asking about non-bundle features.
    const lowerInput = message.toLowerCase();
    const offTopicKeywords = ["pet", "dog", "cat", "food", "meal", "wifi", "wheelchair", "minor", "visa"];
    const isOffTopic = offTopicKeywords.some(kw => lowerInput.includes(kw));

    if (isOffTopic) {
        return res.json({ reply: "I can only answer questions about bundle features (Bags, Seats, Changes, Rewards). For other inquiries, please visit westjet.com or call 1-888-WESTJET." });
    }

    // 3. DETECT RELEVANT QUESTIONS
    // Only if it's NOT off-topic, we check if it's a valid bundle question.
    const isQuestion = message.match(/can i|what if|how much|refund/i);
    if (isQuestion && session.lastRecommendation) {
        analysis.intent = "question";
    }

    if (analysis.intent === "question") {
       const bundleName = session.lastRecommendation;
       const qaPrompt = `
         You are a helpful assistant for WestJet.
         User Question: "${message}"
         Current Bundle: ${bundleName}
         Rules: ${JSON.stringify(BUNDLE_DETAILS[bundleName])}
         
         **INSTRUCTION:**
         Answer the user's question specifically about the ${bundleName} bundle.
         Keep it short and clear.
       `;
       
       const qaResp = await openai.chat.completions.create({
         model: "gpt-4o-mini",
         messages: [{ role: "system", content: qaPrompt }],
       });
       const reply = qaResp.choices[0].message.content;
       session.history.push({ role: "user", content: message });
       session.history.push({ role: "assistant", content: reply });
       return res.json({ reply });
    }

    // 4. UPDATE STATE
    if (analysis.departureDate) analysis.departureDate = ensureFutureDate(analysis.departureDate);
    if (analysis.returnDate && analysis.returnDate !== "N/A") analysis.returnDate = ensureFutureDate(analysis.returnDate);
    
    delete analysis.intent; 
    
    Object.assign(session.slots, analysis);
    if (session.slots.origin && session.slots.destination) session.slots.ambiguousCity = null;
    
    session.history.push({ role: "user", content: message });

    // --- PHASE 1: DETAILS ---
    if (session.phase === "travel_details") {
      const s = session.slots;

      // Ambiguity Check
      if (s.ambiguousCity && (!s.origin || !s.destination)) {
        const reply = `Just to clarify, is ${s.ambiguousCity} where you are leaving from or going to?`;
        session.history.push({ role: "assistant", content: reply });
        return res.json({ reply });
      }

      // Next Question Logic
      const isOneWay = s.tripType === 'oneway' || s.returnDate === 'N/A';
      let nextQ = null;
      if (!s.origin) nextQ = "Where are you flying from?";
      else if (!s.destination) nextQ = "Where are you flying to?";
      else if (!s.departureDate) nextQ = "What date would you like to depart?";
      else if (!s.travelers) nextQ = "How many guests are travelling?";
      else if (!isOneWay && !s.returnDate) nextQ = "Is this a round-trip? If so, when are you returning?";

      if (nextQ) {
        session.history.push({ role: "assistant", content: nextQ });
        return res.json({ reply: nextQ });
      }

      // API CALL
      const originIATA = CITY_TO_IATA[s.origin.toLowerCase().trim()] || s.origin.toUpperCase().slice(0, 3);
      const destIATA = CITY_TO_IATA[s.destination.toLowerCase().trim()] || s.destination.toUpperCase().slice(0, 3);

      const params = {
        originLocationCode: originIATA,
        destinationLocationCode: destIATA,
        departureDate: s.departureDate,
        adults: s.travelers,
        currencyCode: "CAD",
        includedAirlineCodes: "WS"
      };
      if (!isOneWay && s.returnDate && s.returnDate !== 'N/A') params.returnDate = s.returnDate;

      console.log("✈️ API Call:", params);

      try {
        const amadeusResp = await amadeus.shopping.flightOffersSearch.get(params);
        if (!amadeusResp.data || amadeusResp.data.length === 0) {
          session.slots.departureDate = null; 
          return res.json({ reply: "I couldn't find flights for those dates. Please try different dates." });
        }

        const valid = amadeusResp.data.map(o => {
          const fb = o.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.fareBasis;
          let bundleName = "Unmapped Bundle"; 
          if (fb && fb.length >= 7) {
            const char7 = fb[6]; 
            if (BUNDLE_MAP[char7]) bundleName = BUNDLE_MAP[char7];
          }
          return { ...o, _bundle: bundleName, _fareBasis: fb || "N/A" };
        });

        session.flightCache = valid;
        session.phase = "preferences";
        const reply = "I found flights! To pick the best bundle, I need to ask a few quick questions.\n\nFirst: Will you be bringing a carry-on bag?";
        session.history.push({ role: "assistant", content: reply });
        return res.json({ reply });
        
      } catch (e) {
        console.error("❌ API ERROR:", e.code);
        return res.json({ reply: "System error finding flights. Check the server logs." });
      }
    }

    // --- PHASE 2: RECOMMENDATION ---
    if (session.phase === "preferences") {
      const s = session.slots;
      
      let nextQ = null;
      if (s.carryOn === null) nextQ = "Will you be bringing a carry-on bag?";
      else if (s.checkedBags === null) nextQ = "How many checked bags will you have?";
      else if (s.changePolicy === null) nextQ = "Do you prefer the flexibility to change your flight, or is getting the lowest price your priority?";
      else if (s.seatSelection === null) nextQ = "Is choosing your specific seat important to you? (Yes / No)";
      else if (s.rewardsEarn === null) nextQ = "Do you want to earn loyalty points on this trip?";

      if (nextQ) {
        session.history.push({ role: "assistant", content: nextQ });
        return res.json({ reply: nextQ });
      }

      // SCORING
      let offer = null;
      let topBundleName = null;

      if (session.lastRecommendation) {
         // Logic for re-sorting if user updated preferences...
         const currentIndex = HIERARCHY.indexOf(session.lastRecommendation);
         // Simplified logic: Just re-score everything to be safe
      }

      const bundles = [...new Set(session.flightCache.map(o => o._bundle))];
      const scored = bundles.map(b => {
          const cheapestOfBundle = session.flightCache
             .filter(o => o._bundle === b)
             .sort((x, y) => parseFloat(x.price.total) - parseFloat(y.price.total))[0];
          const result = calculateScore(s, b, cheapestOfBundle.price.total);
          return { name: b, score: result.score };
      }).sort((a,b) => b.score - a.score);

      topBundleName = scored[0].name;
      const candidates = session.flightCache
          .filter(o => o._bundle === topBundleName)
          .sort((a,b) => parseFloat(a.price.total) - parseFloat(b.price.total));
      offer = candidates[0];

      session.lastRecommendation = topBundleName;
      const reasonData = generateReason(topBundleName);
      const alts = HIERARCHY.filter(h => h !== topBundleName && session.flightCache.some(o => o._bundle === h)).slice(0,2);
      const itin = offer.itineraries || [];
      const flightInfo = {
        outbound: itin[0] ? formatFlightDetails(itin[0].segments) : [],
        return: itin[1] ? formatFlightDetails(itin[1].segments) : []
      };

      const reply = `I recommend the ${topBundleName} bundle.`;
      session.history.push({ role: "assistant", content: reply });

      return res.json({
        reply,
        recommendation: {
          title: topBundleName,
          price: `${offer.price.currency} ${offer.price.total}`,
          reason: reasonData,
          alternatives: alts,
          flightInfo,
          fareBasis: offer._fareBasis
        }
      });
    }

  } catch (e) {
    console.error(e);
    res.status(500).json({ reply: "Something went wrong." });
  }
});

app.listen(PORT, () => console.log(`Flight Bot vFinalPolish running on ${PORT}`));