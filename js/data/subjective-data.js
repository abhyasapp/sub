/* ═══════════════════════════════════════════════════════════════════════
   SUBJECTIVE-DATA.JS — Supabase Storage paths for subjective question banks.

   ONE file per chapter (not per topic). File shape:
     { "group": "...", "sections": [
         { "section": "...", "questions": [
             { "type":"subjective", "chapter":"...", "q":"...", "marks":"..." }
         ] } ] }

   `marks` may be a number (5, 10) or a string like "5+5=10" or
   "3+3.5+3.5=10". subjective.js's _parseMarks() reads the total.

   Exposes:
     window.SUBJECTIVE_DATA       — { [chapterId]: { name, group, icon, fileId } }
     window.SUBJECTIVE_FILE_INDEX — fileId → chapter meta
     window.SUBJECTIVE_FILE_REFS  — [{ chapterId, name, group, icon, fileId }]
   ═══════════════════════════════════════════════════════════════════════ */
window.SUBJECTIVE_DATA = {
  structure: {
    name: "Structure",
    group: "A",
    icon: "🏗️",
    fileId: "subjective-content/questions/GROUP-A-STRUCTURE.json"
  },
  geotech: {
    name: "Geotechnical Engineering",
    group: "A",
    icon: "⛰️",
    fileId: "subjective-content/questions/GROUP-A-GEOTECH.json"
  },
  irrigationAndCo: {
    name: "Water Resource / Irrigation",
    group: "B",
    icon: "💧",
    fileId: "subjective-content/questions/GROUP-B.json"
  },
  transportAndCo: {
    name: "Transportation Engineering",
    group: "C",
    icon: "🛣️",
    fileId: "subjective-content/questions/group-C.json"
  },
  publicHealth: {
    name: "Public Health Engineering",
    group: "D",
    icon: "🚰",
    fileId: "subjective-content/questions/group-D.json"
  },
  miscellaneous: {
    name: "Miscellaneous / General",
    group: "D",
    icon: "📚",
    fileId: "subjective-content/questions/MISCELLENIOUS.json"
  }
};

window.SUBJECTIVE_FILE_INDEX = (function(){
  const idx = {};
  Object.entries(window.SUBJECTIVE_DATA).forEach(([chId, ch]) => {
    if (ch.fileId && !/^REPLACE_WITH/.test(ch.fileId)) {
      idx[ch.fileId] = { chapterId: chId, name: ch.name, group: ch.group, icon: ch.icon };
    }
  });
  return idx;
})();

window.SUBJECTIVE_FILE_REFS = Object.entries(window.SUBJECTIVE_DATA)
  .filter(([_, ch]) => ch.fileId && !/^REPLACE_WITH/.test(ch.fileId))
  .map(([chapterId, ch]) => ({
    chapterId,
    name: ch.name,
    group: ch.group,
    icon: ch.icon,
    fileId: ch.fileId
  }));